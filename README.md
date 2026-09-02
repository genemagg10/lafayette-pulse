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

After deploy, open [`/api/health`](https://lafayette-pulse.vercel.app/api/health). It always returns HTTP 200 and reports whether Supabase is reachable, row counts for `projects` / `agenda_items` / `document_chunks`, and the latest `scraped_sources.scraped_at`. If the live board shows “Data temporarily unavailable”, this endpoint is the first place to look (usually missing or expired Vercel env vars — not an app crash).

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
4. Copy the project URL and anon key from Settings > API

Civic graph tables are **public read, service-role write**. They do not use the older `FOR ALL USING (true)` policy from 001.

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Test the Scraper Locally

```bash
cd scripts
pip install -r requirements.txt
python scrape-agendas.py
python classify-with-claude.py
```

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

## License

MIT
