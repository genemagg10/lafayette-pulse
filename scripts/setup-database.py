"""
Initialize the Supabase database schema for Lafayette Pulse.

Checks if required tables exist, and creates them if missing by
executing the migration SQL via Supabase's pg_net / HTTP approach.

Can be run standalone or as part of the GitHub Actions workflow.
"""

import os
import sys

import requests

SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    or ""
)
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or ""
)

MIGRATION_SQL = """
-- Enable PostGIS for geospatial queries (ignore if already exists)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create types if they don't exist
DO $$ BEGIN
  CREATE TYPE project_category AS ENUM (
    'bike_ped', 'safe_routes', 'street_quieting',
    'city_council', 'infrastructure', 'parks_trails'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM (
    'proposed', 'approved', 'in_progress', 'completed', 'on_hold'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE source_type AS ENUM (
    'agenda', 'minutes', 'committee', 'budget', 'report', 'news', 'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  category        project_category NOT NULL,
  status          project_status NOT NULL DEFAULT 'proposed',
  location_name   TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  geom            GEOMETRY(Point, 4326),
  start_date      DATE,
  end_date        DATE,
  timeline_text   TEXT,
  funding_source  TEXT,
  estimated_cost  NUMERIC(12,2),
  source_url      TEXT,
  source_type     source_type DEFAULT 'agenda',
  tags            TEXT[] DEFAULT '{}',
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-populate geom from lat/lng
CREATE OR REPLACE FUNCTION update_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_geom ON projects;
CREATE TRIGGER trg_update_geom
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_geom();

-- Project updates table
CREATE TABLE IF NOT EXISTS project_updates (
  id              BIGSERIAL PRIMARY KEY,
  project_id      BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  update_text     TEXT NOT NULL,
  source_url      TEXT,
  source_type     source_type DEFAULT 'agenda',
  source_date     DATE,
  extracted_at    TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Agenda items table
CREATE TABLE IF NOT EXISTS agenda_items (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  body            TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  category        project_category,
  linked_project  BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  source_url      TEXT,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Scraped sources table
CREATE TABLE IF NOT EXISTS scraped_sources (
  id              BIGSERIAL PRIMARY KEY,
  url             TEXT UNIQUE NOT NULL,
  filename        TEXT,
  body            TEXT,
  meeting_date    DATE,
  scraped_at      TIMESTAMPTZ DEFAULT NOW(),
  items_extracted INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'success'
);

-- Indexes (CREATE IF NOT EXISTS for indexes)
CREATE INDEX IF NOT EXISTS idx_projects_category ON projects(category);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_agenda_items_date ON agenda_items(date DESC);
CREATE INDEX IF NOT EXISTS idx_agenda_items_category ON agenda_items(category);
CREATE INDEX IF NOT EXISTS idx_project_updates_project ON project_updates(project_id);
CREATE INDEX IF NOT EXISTS idx_scraped_sources_url ON scraped_sources(url);

-- Row-Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_sources ENABLE ROW LEVEL SECURITY;

-- Policies (drop and recreate to avoid errors)
DROP POLICY IF EXISTS "Public read access" ON projects;
DROP POLICY IF EXISTS "Public read access" ON project_updates;
DROP POLICY IF EXISTS "Public read access" ON agenda_items;
DROP POLICY IF EXISTS "Service write" ON projects;
DROP POLICY IF EXISTS "Service write" ON project_updates;
DROP POLICY IF EXISTS "Service write" ON agenda_items;
DROP POLICY IF EXISTS "Service write" ON scraped_sources;

CREATE POLICY "Public read access" ON projects FOR SELECT USING (true);
CREATE POLICY "Public read access" ON project_updates FOR SELECT USING (true);
CREATE POLICY "Public read access" ON agenda_items FOR SELECT USING (true);
CREATE POLICY "Service write" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write" ON project_updates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write" ON agenda_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write" ON scraped_sources FOR ALL USING (true) WITH CHECK (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_projects_updated ON projects;
CREATE TRIGGER trg_projects_updated
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
"""


def run_sql(sql: str) -> bool:
    """Execute SQL against Supabase via the PostgREST rpc endpoint."""
    # Use Supabase's built-in SQL execution via the management API
    # This works with the service role key
    url = f"{SUPABASE_URL}/rest/v1/rpc/exec_sql"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
    }

    # Try the rpc approach first
    resp = requests.post(url, headers=headers,
                         json={"query": sql}, timeout=30)

    if resp.status_code == 404:
        # rpc/exec_sql doesn't exist — we need to use a different approach
        return False

    if resp.status_code >= 400:
        print(f"  SQL execution failed ({resp.status_code}): {resp.text[:200]}")
        return False

    return True


def check_table_exists(table: str) -> bool:
    """Check if a table exists via PostgREST."""
    try:
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
        }
        resp = requests.get(url, headers=headers,
                            params={"select": "id", "limit": "0"}, timeout=10)
        return resp.status_code != 404
    except Exception:
        return False


def main():
    print("=" * 60)
    print("Lafayette Pulse — Database Setup")
    print("=" * 60)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.")
        sys.exit(1)

    # Check which tables exist
    required = ["projects", "project_updates", "agenda_items", "scraped_sources"]
    missing = [t for t in required if not check_table_exists(t)]

    if not missing:
        print("All required tables already exist. No action needed.")
        return

    print(f"Missing tables: {', '.join(missing)}")
    print("Attempting to create tables...")

    # Try RPC approach
    if run_sql(MIGRATION_SQL):
        print("Tables created successfully via SQL RPC!")
        # Verify
        still_missing = [t for t in required if not check_table_exists(t)]
        if still_missing:
            print(f"WARNING: Still missing after migration: {', '.join(still_missing)}")
        else:
            print("All tables verified.")
        return

    # If RPC doesn't work, print instructions
    print("\n" + "=" * 60)
    print("MANUAL SETUP REQUIRED")
    print("=" * 60)
    print()
    print("The database tables need to be created manually.")
    print("Please follow these steps:")
    print()
    print("1. Go to your Supabase dashboard:")
    print(f"   {SUPABASE_URL.replace('.supabase.co', '.supabase.co')}")
    print()
    print("2. Click 'SQL Editor' in the left sidebar")
    print()
    print("3. Click '+ New query'")
    print()
    print("4. Paste the contents of this file:")
    print("   supabase/migrations/001_initial_schema.sql")
    print()
    print("5. Click 'Run' to execute the SQL")
    print()
    print("After running the migration, re-run this workflow.")
    sys.exit(1)


if __name__ == "__main__":
    main()
