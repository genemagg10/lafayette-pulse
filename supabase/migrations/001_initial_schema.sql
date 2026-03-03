-- Enable PostGIS for geospatial queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================
-- CATEGORIES REFERENCE
-- ============================================
CREATE TYPE project_category AS ENUM (
  'bike_ped',           -- Bike & Pedestrian Safety
  'safe_routes',        -- Safe Routes to School
  'street_quieting',    -- Street Quieting / Traffic Calming
  'city_council',       -- City Council Updates
  'infrastructure',     -- Road & Infrastructure
  'parks_trails'        -- Parks & Trails
);

CREATE TYPE project_status AS ENUM (
  'proposed',
  'approved',
  'in_progress',
  'completed',
  'on_hold'
);

CREATE TYPE source_type AS ENUM (
  'agenda',
  'minutes',
  'committee',
  'budget',
  'report',
  'news',
  'manual'
);

-- ============================================
-- PROJECTS TABLE (main tracker)
-- ============================================
CREATE TABLE projects (
  id              BIGSERIAL PRIMARY KEY,
  title           TEXT NOT NULL,
  description     TEXT,
  category        project_category NOT NULL,
  status          project_status NOT NULL DEFAULT 'proposed',
  location_name   TEXT,                          -- Human-readable location
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  geom            GEOMETRY(Point, 4326),         -- PostGIS point for spatial queries
  start_date      DATE,
  end_date        DATE,
  timeline_text   TEXT,                          -- Free text like "Q1-Q3 2026"
  funding_source  TEXT,
  estimated_cost  NUMERIC(12,2),
  source_url      TEXT,                          -- Link to original city document
  source_type     source_type DEFAULT 'agenda',
  tags            TEXT[] DEFAULT '{}',           -- Searchable tags array
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

CREATE TRIGGER trg_update_geom
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_geom();

-- ============================================
-- PROJECT UPDATES (changelog / history)
-- ============================================
CREATE TABLE project_updates (
  id              BIGSERIAL PRIMARY KEY,
  project_id      BIGINT REFERENCES projects(id) ON DELETE CASCADE,
  update_text     TEXT NOT NULL,
  source_url      TEXT,
  source_type     source_type DEFAULT 'agenda',
  source_date     DATE,                          -- Date of the meeting/document
  extracted_at    TIMESTAMPTZ DEFAULT NOW(),      -- When our scraper found this
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- AGENDA ITEMS (raw items from city agendas)
-- ============================================
CREATE TABLE agenda_items (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL,
  body            TEXT NOT NULL,                  -- "City Council", "Circulation Commission", etc.
  title           TEXT NOT NULL,
  description     TEXT,
  category        project_category,
  linked_project  BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  source_url      TEXT,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SCRAPED SOURCES (deduplication tracking)
-- ============================================
CREATE TABLE scraped_sources (
  id              BIGSERIAL PRIMARY KEY,
  url             TEXT UNIQUE NOT NULL,
  filename        TEXT,
  body            TEXT,                           -- Which commission/body
  meeting_date    DATE,
  scraped_at      TIMESTAMPTZ DEFAULT NOW(),
  items_extracted INTEGER DEFAULT 0,
  status          TEXT DEFAULT 'success'          -- success, failed, skipped
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_projects_category ON projects(category);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_geom ON projects USING GIST(geom);
CREATE INDEX idx_projects_tags ON projects USING GIN(tags);
CREATE INDEX idx_projects_search ON projects USING GIN(
  to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(location_name,''))
);
CREATE INDEX idx_agenda_items_date ON agenda_items(date DESC);
CREATE INDEX idx_agenda_items_category ON agenda_items(category);
CREATE INDEX idx_project_updates_project ON project_updates(project_id);
CREATE INDEX idx_scraped_sources_url ON scraped_sources(url);

-- ============================================
-- ROW LEVEL SECURITY (public read access)
-- ============================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE scraped_sources ENABLE ROW LEVEL SECURITY;

-- Public read access for all tables
CREATE POLICY "Public read access" ON projects FOR SELECT USING (true);
CREATE POLICY "Public read access" ON project_updates FOR SELECT USING (true);
CREATE POLICY "Public read access" ON agenda_items FOR SELECT USING (true);

-- Service role write access (used by scraper via service key)
CREATE POLICY "Service write" ON projects FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write" ON project_updates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write" ON agenda_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service write" ON scraped_sources FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_projects_updated
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
