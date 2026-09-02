# Lafayette Pulse — Community Project Tracker

A full-stack web application that automatically monitors City of Lafayette, California government agendas, extracts relevant projects and initiatives, and displays them on an interactive map-based dashboard.

> **Ops note (2026-09-02):** Production APIs were returning Supabase `fetch failed`, and the Collect & Classify Action had been `disabled_inactivity`. Pushing to `main` re-enables scheduled workflows; verify Vercel `NEXT_PUBLIC_SUPABASE_*` env vars and re-run the workflow manually after secrets are confirmed.

## What It Tracks

- **Bike & Pedestrian Safety** — Bike lanes, crosswalks, pedestrian signals, ADA improvements
- **Safe Routes to School** — Walking buses, school zone improvements, crossing guards, SRTS grants
- **Street Quieting / Traffic Calming** — Speed cushions, chicanes, radar signs, traffic circles
- **City Council Updates** — Resolutions, policy decisions, budget approvals, study sessions
- **Road & Infrastructure** — Repaving, drainage, signals, intersection redesigns
- **Parks & Trails** — Trail improvements, park renovations, open space projects

## Tech Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS, react-leaflet (OpenStreetMap)
- **Backend**: Next.js API routes, Supabase (PostgreSQL + PostGIS + pgvector)
- **Scraper**: Python + Claude API for agenda classification
- **CI/CD**: GitHub Actions (daily cron), Vercel (auto-deploy)

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- A Supabase project (free tier works)
- Anthropic API key (for the scraper)
- OpenAI API key (for RAG embeddings)

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

### Set Up Database

1. Create a new project at [supabase.com](https://supabase.com)
2. Enable the PostGIS and vector extensions from Database > Extensions
3. Go to SQL Editor and run migrations in `supabase/migrations/` in order
4. Optionally run `supabase/migrations/002_seed_data.sql` for sample data
5. Copy the project URL and anon key from Settings > API

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Test the Scraper Locally

```bash
cd scripts
pip install -r requirements.txt
python scrape-granicus.py
python scrape-agendas.py
python classify-with-claude.py
```

## Deployment

### Vercel

1. Connect the GitHub repository to Vercel
2. Vercel auto-detects Next.js and deploys on push to `main`
3. Add all environment variables from `.env.example` to Vercel project settings
4. `SUPABASE_SERVICE_ROLE_KEY` should only be in server-side env vars (not prefixed with `NEXT_PUBLIC_`)

### GitHub Actions

Add these secrets to the GitHub repo (Settings > Secrets & variables > Actions):

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `SUPABASE_URL` (same as `NEXT_PUBLIC_SUPABASE_URL`)
- `SUPABASE_SERVICE_KEY` (the service role key, NOT the anon key)
- `EMAIL_ADDRESS` / `EMAIL_APP_PASSWORD` (Gmail inbox subscribed to city notifications)

The Collect & Classify workflow runs **daily at 2am PT** (`0 10 * * *` UTC) and can be triggered manually via Actions → workflow_dispatch.

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

## License

MIT
