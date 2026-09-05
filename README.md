# Lafayette Pulse — Civic Tracker for Lafayette, CA

A full-stack web application that monitors City of Lafayette, California government agendas, extracts projects and civic activity, and displays them in Lafayette Pulse (home hub, map, calendar, and who's who).

Live site: [lafayette-pulse.vercel.app](https://lafayette-pulse.vercel.app)

> **Ops note (2026-09-02):** Supabase was restored to `ACTIVE_HEALTHY` and live APIs are healthy again. Collect & Classify may still need a manual **Enable** in the Actions tab if it remains disabled after inactivity.

## What It Tracks

- **Projects** — transportation, housing, parks, public safety, and city government items from agendas
- **Calendar & agenda** — union of civic-graph `events` (timed meetings / community) and `agenda_items` (topic rows) for the visible date range. Many meetings are **Projected** from recurring schedules (`RECURRING_PROJECTION` or `confidence=medium` in the description) until Granicus or the city calendar confirms.
- **Organizations** — city bodies, civic groups, foundations, and campaigns
- **People** — commissioners, councilmembers, and other civic actors (as the graph is populated)
- **Measures** — quote-backed support/oppose under Who → Measures (DEMO-SAFE ribbon when stances exist)
- **Candidates** — who is running for local office under Who → Candidates: office and term, organizational affinities (their board/commission memberships), and their positions on the record (attributed, quote-backed stances). Never inferred from co-membership.

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS, react-leaflet (OpenStreetMap)
- **Backend**: Next.js API routes, Supabase (PostgreSQL + PostGIS)
- **Scraper**: Python + Claude API for agenda classification
- **CI/CD**: GitHub Actions (daily cron), Vercel (auto-deploy)

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- A Supabase project (free tier works)
- Anthropic API key (for the scraper)

### Clone and Install

```bash
git clone https://github.com/genemagg10/lafayette-pulse.git
cd lafayette-pulse
npm install
```

### Set Up Environment

```bash
cp .env.example .env.local
# Fill in your Supabase and API keys
```

Required for the web app:

| Variable | Where it is used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + API routes (public project URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + read APIs (RLS-enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only writes / admin (never `NEXT_PUBLIC_`) |

Optional:

| Variable | Where it is used |
| --- | --- |
| `ANTHROPIC_API_KEY` | Scraper classification + chat |
| `OPENAI_API_KEY` | RAG embeddings |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Unused by default (OSM tiles) |
| `GOOGLE_MAPS_API_KEY` | Optional geocoding in scripts |

After deploy, open [`/api/health`](https://lafayette-pulse.vercel.app/api/health). It always returns HTTP 200 and reports whether Supabase is reachable, row counts for `projects` / `agenda_items` / `events` / `document_chunks` / `people` / `organizations` / `memberships` / `seat_holders`, and the latest `scraped_sources.scraped_at`. If pages show “Data temporarily unavailable”, this endpoint is the first place to look (usually missing or expired Vercel env vars — not an app crash). Health & freshness also live under **More** (`/more`).

### Set Up Database

1. Create a new project at [supabase.com](https://supabase.com)
2. Enable the PostGIS extension from Database > Extensions
3. In the SQL Editor, run migrations in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_seed_data.sql` (optional sample projects)
   - `supabase/migrations/003_expand_categories.sql`
   - `supabase/migrations/003_add_calendar_source_type.sql`
   - `supabase/migrations/004_update_project_categories.sql`
   - `supabase/migrations/005_rag_vector_schema.sql` (needs `pgvector`)
   - `supabase/migrations/006_civic_graph.sql` (people, orgs, events, measures)
   - `supabase/migrations/007_seed_civic_orgs.sql` (Lafayette orgs directory)
   - `supabase/migrations/008_civic_graph_proposals.sql` (staging for graph extraction; idempotent)
   - `supabase/migrations/009_stances.sql` (stances + proposal kinds `stance`/`measure`; idempotent)
   - `supabase/migrations/010_seed_candidates_measures.sql` (2026 City Council candidates + seats, ballot measures H/L, org affinities, and quote-backed stances; idempotent, source-backed)
   - `supabase/migrations/011_seed_org_members.sql` (Lafayette Community Foundation board + Sustainable Lafayette; backfills orgs that showed zero members; idempotent, source-backed)
4. Copy the project URL and anon key from Settings > API

Civic graph tables are **public read, service-role write**. They do not use the older `FOR ALL USING (true)` policy from 001.

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Scrapers

Python scripts in `scripts/` talk to Supabase over PostgREST (`requests`) using `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`.

```bash
cd scripts
pip install -r requirements.txt
python scrape-agendas.py
python classify-with-claude.py
```

**Civic graph extraction** (`extract-civic-graph.py`) mines high-signal RAG rows in `document_chunks` (appointed, commissioner, councilmember, chair, mayor, …) and writes staged rows to `civic_graph_proposals`. Distinct `meeting_body` values become organizations (slugified, no LLM). Claude structured JSON fills people, orgs, memberships, seats, and candidacies with `dedupe_key`s.

```bash
# Preview only — no database writes (still calls Claude unless --keywords-only)
python extract-civic-graph.py --dry-run --limit 20

# Stage proposals (default). Safe to re-run; existing dedupe_keys are skipped.
python extract-civic-graph.py --limit 50

# Keyword filter + meeting-body orgs only (no Anthropic calls)
python extract-civic-graph.py --keywords-only --limit 50

# Merge high-confidence pending proposals into people/organizations.
# Memberships are inserted only when both the person and org already resolve
# (match people by lower(full_name), orgs by slug).
python extract-civic-graph.py --limit 100 --apply --min-confidence 0.6
```

`--apply` is opt-in. The daily Collect & Classify workflow does **not** run this by default; enable the `extract_graph` workflow_dispatch input to run `--limit 100 --apply`.

**Stance / measure extraction** (`extract-stances.py`) is a sibling of the civic-graph extractor. It mines RAG chunks for ballot measures and *attributed* stances (supports / opposes / endorses, body resolutions, named aye/nay votes). It does **not** infer stance from co-membership or shared boards. Live `measures` / `candidacies` tables already exist from migration 006; 009 adds `stances` and allows proposal kinds `stance` and `measure`.

Confidence bands: **≥0.8** merge-candidate / high (staged; applied with `--apply`); **0.5–0.8** pending (staged only); **<0.5** dropped.

```bash
# Regex + confidence self-tests (no database, no Anthropic)
python extract-stances.py --self-test

# Preview only — no database writes (still calls Claude unless --keywords-only)
python extract-stances.py --dry-run --limit 20

# Stage proposals (default). Safe to re-run; existing dedupe_keys are skipped.
python extract-stances.py --limit 50

# Keyword filter + regex only (no Anthropic calls)
python extract-stances.py --keywords-only --limit 50

# Upsert measures; insert high-confidence stances only when the actor
# already exists on people/organizations (no people/org creates).
python extract-stances.py --limit 100 --apply --min-confidence 0.8
```

`--min-confidence` is the **apply** threshold for stances (default 0.8). `--stage-min` (default 0.5) is the floor for writing a proposal at all. `--apply` is opt-in. The daily workflow does **not** run this by default; enable the `extract_stances` workflow_dispatch input to run `--limit 100 --apply`.

If extract is thin, do **not** invent production rows in a migration. Seed 1–2 historically documented Lafayette fights in the SQL editor with service role, using quote-backed sources:

1. **Measure L (June 2018)** — Homes at Deer Hill referendum (failed). City page: [Terraces of Lafayette / Deer Hill](https://www.lovelafayette.org/city-hall/quick-links/hot-topics/terraces-of-lafayette). Distinct from the 2020 school Measure L — put the election year on `measures.election_date` / `subject_label`.
2. **Measure L (March 2020)** — Lafayette School District parcel tax. City Council adopted Resolution 2020-03 endorsing it (5–0: Anderson, Candell, Bliss, Burks, Gerringer). Granicus minutes for clip_id 4780.

Insert matching `measures` rows first, then `stances` only for named actors/votes in those sources. Never copy co-membership into `stances`.

## Deployment

### Vercel

1. Connect the GitHub repository to Vercel
2. Vercel auto-detects Next.js and deploys on push to `main`
3. Add all environment variables from `.env.example` to Vercel project settings
4. `SUPABASE_SERVICE_ROLE_KEY` should only be in server-side env vars (not prefixed with `NEXT_PUBLIC_`)
5. Confirm `GET /api/health` shows `"supabase_reachable": true` after deploy

### GitHub Actions

Add these secrets to the GitHub repo (Settings > Secrets > Actions):

- `ANTHROPIC_API_KEY`
- `SUPABASE_URL` (same as `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_KEY` (the service role key, NOT the anon key)
- `EMAIL_ADDRESS` / `EMAIL_APP_PASSWORD` (city notification mailbox)
- `OPENAI_API_KEY` (embeddings)

The daily scraper runs every day at 2am PST (`0 10 * * *` UTC) via **Collect & Classify**. GitHub may disable scheduled workflows after repository inactivity; re-enable from the Actions tab if the last scrape timestamp in `/api/health` goes stale.

## Architecture

```
Vercel (Next.js)          GitHub Actions (daily)
      │                          │
      │ reads (anon key)         │ writes (service key)
      ▼                          ▼
    ┌──────────────────────────────┐
    │     Supabase (PostgreSQL)    │
    │   + PostGIS + RLS policies   │
    └──────────────────────────────┘
```

- **Vercel** deploys the frontend + API routes. Reads from Supabase using the anon key (public, read-only via RLS).
- **GitHub Actions** runs the daily scraper. Writes to Supabase using the service role key (bypasses RLS).
- **Supabase** is the shared data layer. They never communicate directly with each other.

### App routes

| Route | What it is |
| --- | --- |
| `/` | Pulse — home orientation hub |
| `/map` | Full-viewport map |
| `/calendar` | Full-viewport calendar — `events` + `agenda_items` for the selected window |
| `/who` | Who's who — People, Organizations, Measures, Candidates. Lists are ranked by board footprint. Hover a graph edge for a short Why linked tooltip; click for the full panel (sheet on mobile). `?tab=footprint` redirects to `?tab=people&rank=footprint`. |
| `/projects` | Project archive (under **More**) |
| `/ask` | Ask Lafayette AI (under **More**) |
| `/more` | Secondary tools, health & freshness |

Ask lives under More — there is no global chat FAB. Primary nav is Pulse, Map, Calendar, Who.

`/calendar` (and Home → Coming up) reads both `GET /api/events?since=&until=` and `GET /api/agenda-items`. Event days use `starts_at` in **America/Los_Angeles**. A subtle **Projected** badge marks recurring-schedule meetings until Granicus or lovelafayette.org confirms; this PR does not invent cancellations or scrape the city calendar.

## Civic graph APIs

Phase 1 views (Who's Who, Most involved, Organizations) read the live civic graph. Civic graph routes send `Cache-Control: no-store`.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Reachability + counts including `people`, `organizations`, `memberships`, `seat_holders`, `events` |
| `GET /api/people?q=&has_seat=&sort=footprint\|name&limit=&offset=` | Who's Who directory (`{ items, total, limit, offset }`), default sort **board footprint** with `footprint_score` |
| `GET /api/people/:id` | Person detail with memberships and formal seats |
| `GET /api/people/:id/ego?hops=1\|2&current_only=true&alter_cap=25` | 1–2 hop ego graph (person / organization / seat nodes). Hop-2 includes person–person `shared_board` edges with `shared_names` |
| `GET /api/organizations?q=&org_type=&sort=footprint\|name&limit=&offset=` | Org directory with `current_member_count` and `footprint_score` (default sort footprint) |
| `GET /api/organizations/:id` | Org detail with members and seats |
| `GET /api/graph/involvement?entity=person\|org&metric=degree\|formal&current_only=true&limit=50` | Ranked **Board footprint** (`degree`) or **Formal seats** (`formal`, seats weighted ×2) |
| `GET /api/graph/org-affinity?current_only=true&min_jaccard=0.15&min_shared=1&limit_orgs=40` | **Shared membership** (Jaccard on current member sets) |

Copy on these views is limited to overlapping membership / shared boards / board footprint / formal seats — not influence or factions.

## Stance APIs (Phase 2)

Measures and attributed support / oppose. Civic graph routes send `Cache-Control: no-store`. Zero stances return honest empty payloads — never inferred from membership.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Also counts `measures`, `stances`, and `candidacies` |
| `GET /api/candidates?limit=&offset=` | Candidate list (`{ items, total, limit, offset }`): person, office (seat + org), election date, status, `party_or_slate`, organizational `affinities` (memberships), and `positions` (attributed stances). Sorted by election date. |
| `GET /api/measures?limit=&offset=` | Measure list with `support_count` / `oppose_count` / `endorse_count` |
| `GET /api/measures/:id` | One measure plus those counts |
| `GET /api/measures/:id/stances` | Actors with polarity, confidence, evidence_quote, source_url, as_of, and actor labels; includes a conflict-ribbon graph payload |
| `GET /api/graph/co-stance?actor=org\|person&min_shared=2` | Pairwise **Co-stance** vs **Opposed on issues** matrix (`cells[].kind` is `co-stance`, `opposed-on-issues`, or `insufficient`). Never labeled allies. |
| `GET /api/people/:id/stances` | Ego **On the record** strip |

Visual grammar: support = solid teal; oppose = dashed vermillion; endorse = gold. Size follows evidence/confidence. Do not use red/green alone.

## License

MIT
