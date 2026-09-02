CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Civic graph: people, organizations, memberships, seats, events,
-- measures, and candidacies.
--
-- RLS: public SELECT only. No INSERT/UPDATE/DELETE policies for
-- anon or authenticated. service_role bypasses RLS and is used by
-- scrapers / admin writes.
--
-- Do NOT copy the 001 pattern of `FOR ALL USING (true)`, which
-- effectively allowed anon writes.

-- ============================================
-- ENUMS
-- ============================================
CREATE TYPE org_type AS ENUM (
  'civic',
  'interest',
  'city_body',
  'campaign',
  'foundation',
  'other'
);

CREATE TYPE seat_type AS ENUM (
  'elected',
  'appointed',
  'staff',
  'other'
);

CREATE TYPE event_type AS ENUM (
  'meeting',
  'community',
  'election',
  'deadline',
  'other'
);

CREATE TYPE measure_status AS ENUM (
  'proposed',
  'qualified',
  'on_ballot',
  'passed',
  'failed',
  'withdrawn'
);

CREATE TYPE candidacy_status AS ENUM (
  'exploring',
  'declared',
  'qualified',
  'elected',
  'lost',
  'withdrawn'
);

-- ============================================
-- PEOPLE
-- ============================================
CREATE TABLE people (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name   TEXT NOT NULL,
  bio         TEXT,
  photo_url   TEXT,
  email       TEXT,
  website     TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- ORGANIZATIONS
-- ============================================
CREATE TABLE organizations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  org_type       org_type NOT NULL DEFAULT 'other',
  description    TEXT,
  website        TEXT,
  location_name  TEXT,
  latitude       DOUBLE PRECISION,
  longitude      DOUBLE PRECISION,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- MEMBERSHIPS (person ↔ organization)
-- ============================================
CREATE TABLE memberships (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id        UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role             TEXT,
  is_primary       BOOLEAN NOT NULL DEFAULT false,
  start_date       DATE,
  end_date         DATE,
  source_url       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (person_id, organization_id, role, start_date)
);

-- ============================================
-- SEATS (elected / appointed / staff positions)
-- ============================================
CREATE TABLE seats (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES organizations(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  seat_type        seat_type NOT NULL DEFAULT 'other',
  district         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- SEAT HOLDERS
-- ============================================
CREATE TABLE seat_holders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seat_id     UUID NOT NULL REFERENCES seats(id) ON DELETE CASCADE,
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  start_date  DATE,
  end_date    DATE,
  source_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- EVENTS
-- ============================================
CREATE TABLE events (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  description        TEXT,
  event_type         event_type NOT NULL DEFAULT 'other',
  body               TEXT,                                  -- free-text body/org name
  organization_id    UUID REFERENCES organizations(id) ON DELETE SET NULL,
  starts_at          TIMESTAMPTZ NOT NULL,
  ends_at            TIMESTAMPTZ,
  location_name      TEXT,
  latitude           DOUBLE PRECISION,
  longitude          DOUBLE PRECISION,
  source_url         TEXT,
  linked_project_id  BIGINT REFERENCES projects(id) ON DELETE SET NULL,
  category           project_category,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- MEASURES (ballot measures)
-- ============================================
CREATE TABLE measures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT NOT NULL,
  short_code     TEXT,
  summary        TEXT,
  status         measure_status NOT NULL DEFAULT 'proposed',
  election_date  DATE,
  source_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- CANDIDACIES
-- ============================================
CREATE TABLE candidacies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id       UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  seat_id         UUID REFERENCES seats(id) ON DELETE SET NULL,
  measure_id      UUID REFERENCES measures(id) ON DELETE SET NULL,
  election_date   DATE,
  party_or_slate  TEXT,
  status          candidacy_status NOT NULL DEFAULT 'exploring',
  source_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_people_name ON people (full_name);
CREATE INDEX idx_organizations_type ON organizations (org_type);
CREATE INDEX idx_organizations_slug ON organizations (slug);
CREATE INDEX idx_memberships_person ON memberships (person_id);
CREATE INDEX idx_memberships_org ON memberships (organization_id);
CREATE INDEX idx_seats_org ON seats (organization_id);
CREATE INDEX idx_seat_holders_seat ON seat_holders (seat_id);
CREATE INDEX idx_seat_holders_person ON seat_holders (person_id);
CREATE INDEX idx_events_starts ON events (starts_at DESC);
CREATE INDEX idx_events_type ON events (event_type);
CREATE INDEX idx_events_org ON events (organization_id);
CREATE INDEX idx_events_project ON events (linked_project_id);
CREATE INDEX idx_measures_status ON measures (status);
CREATE INDEX idx_measures_election ON measures (election_date);
CREATE INDEX idx_candidacies_person ON candidacies (person_id);
CREATE INDEX idx_candidacies_seat ON candidacies (seat_id);
CREATE INDEX idx_candidacies_measure ON candidacies (measure_id);

-- ============================================
-- UPDATED_AT TRIGGERS (reuses 001 helper)
-- ============================================
CREATE TRIGGER trg_people_updated
  BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_organizations_updated
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_memberships_updated
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_seats_updated
  BEFORE UPDATE ON seats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_seat_holders_updated
  BEFORE UPDATE ON seat_holders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_events_updated
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_measures_updated
  BEFORE UPDATE ON measures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_candidacies_updated
  BEFORE UPDATE ON candidacies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- Public read. Writes only via service_role (bypasses RLS).
-- ============================================
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_holders ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE measures ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidacies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON people FOR SELECT USING (true);
CREATE POLICY "Public read access" ON organizations FOR SELECT USING (true);
CREATE POLICY "Public read access" ON memberships FOR SELECT USING (true);
CREATE POLICY "Public read access" ON seats FOR SELECT USING (true);
CREATE POLICY "Public read access" ON seat_holders FOR SELECT USING (true);
CREATE POLICY "Public read access" ON events FOR SELECT USING (true);
CREATE POLICY "Public read access" ON measures FOR SELECT USING (true);
CREATE POLICY "Public read access" ON candidacies FOR SELECT USING (true);
