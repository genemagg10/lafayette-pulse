# Lafayette Pulse — Civic Tracker for Lafayette, CA

A full-stack web application that monitors City of Lafayette, California government agendas, extracts projects and civic activity, and displays them on a modular Pulse Board (map, calendar, organizations, people, and projects).

Live site: [lafayette-pulse.vercel.app](https://lafayette-pulse.vercel.app)

> **Ops note (2026-09-02):** Supabase was restored to `ACTIVE_HEALTHY` and live APIs are healthy again. Collect & Classify may still need a manual **Enable** in the Actions tab if it remains disabled after inactivity.

## What It Tracks

- **Projects** — transportation, housing, parks, public safety, and city government items from agendas
- **Calendar & agenda** — upcoming and past meeting items
- **Organizations** — city bodies, civic groups, foundations, and campaigns
- **People** — commissioners, councilmembers, and other civic actors (as the graph is populated)
- **Measures & candidates** — schema ready; UI placeholder until election data is ingested

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

After deploy, open [`/api/health`](https://lafayette-pulse.vercel.app/api/health). It always returns HTTP 200 and reports whether Supabase is reachable, row counts for `projects` / `agenda_items` / `document_chunks` / `people` / `organizations` / `memberships` / `seat_holders`, and the latest `scraped_sources.scraped_at`. If the live board shows “Data temporarily unavailable”, this endpoint is the first place to look (usually missing or expired Vercel env vars — not an app crash). Pulse Board tiles for Who's Who and Organizations use these counts (not the length of a cached list).

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
- **Pulse Board** is a bento of expandable tiles on the home page. Chat stays global in the layout.

## Civic graph APIs

Phase 1 views (Who's Who, Most involved, Organizations) read the live civic graph. Civic graph routes send `Cache-Control: no-store`.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Reachability + counts including `people`, `organizations`, `memberships`, `seat_holders` |
| `GET /api/people?q=&has_seat=&limit=&offset=` | Who's Who directory (`{ items, total, limit, offset }`) |
| `GET /api/people/:id` | Person detail with memberships and formal seats |
| `GET /api/people/:id/ego?hops=1\|2&current_only=true&alter_cap=25` | 1–2 hop ego graph (person / organization / seat nodes) |
| `GET /api/organizations?q=&org_type=&limit=&offset=` | Org directory with `current_member_count` |
| `GET /api/organizations/:id` | Org detail with members and seats |
| `GET /api/graph/involvement?entity=person\|org&metric=degree\|formal&current_only=true&limit=50` | Ranked **Board footprint** (`degree`) or **Formal seats** (`formal`, seats weighted ×2) |
| `GET /api/graph/org-affinity?current_only=true&min_jaccard=0.15&min_shared=1&limit_orgs=40` | **Shared membership** (Jaccard on current member sets) |

Copy on these views is limited to overlapping membership / shared boards / board footprint / formal seats — not influence or factions.

## License

MIT
