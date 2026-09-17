-- Granicus M3 / MMMAC scout pack (2026-09-17).
-- Source pack: data/scout/granicus-m3/ (BRIEF.md, neo_events_m3_delta.csv,
-- neo_projects_m3.csv). Idempotent: safe to re-run.
--
-- 1) UPDATE the existing Sep 21 2026 Multi-Modal Mobility Advisory Committee
--    meeting (city-calendar ingest had a blank / unspecified room). Match by
--    title + body + Pacific date. Do NOT insert a new meeting, and do NOT
--    invent Meeting 2–5 rows (Fall 2026–Fall 2027 seasons live on the M3
--    project notes only).
-- 2) Upsert 8 downtown mobility projects by slug tag (projects.slug does not
--    exist; the kebab slug is stored in tags). Leave lat/lng null as provided.
--    Do not invent roster rows or meta_id=214085 content (404).
--
-- Working Granicus links (view_id=3, event_id=1468):
--   Agenda viewer: https://lafayette.granicus.com/GeneratedAgendaViewer.php?view_id=3&event_id=1468
--   Agenda PDF:    https://lafayette.granicus.com/MetaViewer.php?view_id=3&event_id=1468&meta_id=214081
--   Item 5A packet:https://lafayette.granicus.com/MetaViewer.php?view_id=3&event_id=1468&meta_id=214098
-- Broken (do not store as source_url): empty view_id + meta_id=214085.

-- ============================================================
-- Helper: upsert a pack project by slug tag
-- ============================================================
CREATE OR REPLACE FUNCTION pg_temp.lp_project_by_slug(
  p_title text,
  p_slug text,
  p_status project_status,
  p_category project_category,
  p_description text,
  p_location text,
  p_source_url text,
  p_start date,
  p_end date,
  p_timeline text,
  p_funding text,
  p_cost numeric,
  p_tags text[]
) RETURNS bigint LANGUAGE plpgsql AS $fn$
DECLARE v bigint;
BEGIN
  SELECT id INTO v
  FROM projects
  WHERE p_slug = ANY(COALESCE(tags, '{}'))
  LIMIT 1;

  -- Fallback: exact title, so a prior scrape of the same project (e.g.
  -- "Smart Signals Project") is updated instead of duplicated.
  IF v IS NULL THEN
    SELECT id INTO v
    FROM projects
    WHERE lower(btrim(title)) = lower(btrim(p_title))
    LIMIT 1;
  END IF;

  IF v IS NULL THEN
    INSERT INTO projects (
      title, description, category, status, location_name,
      latitude, longitude, start_date, end_date, timeline_text,
      funding_source, estimated_cost, source_url, source_type, tags, is_active
    ) VALUES (
      p_title, p_description, p_category, p_status, p_location,
      NULL, NULL, p_start, p_end, p_timeline,
      p_funding, p_cost, p_source_url, 'report', p_tags, true
    )
    RETURNING id INTO v;
  ELSE
    UPDATE projects SET
      title = p_title,
      description = p_description,
      category = p_category,
      status = p_status,
      location_name = p_location,
      -- Pack rows ship without coords; do not invent, and do not wipe a
      -- previously geocoded point if this slug already existed.
      start_date = p_start,
      end_date = p_end,
      timeline_text = p_timeline,
      funding_source = p_funding,
      estimated_cost = p_cost,
      source_url = p_source_url,
      source_type = COALESCE(source_type, 'report'),
      tags = (
        SELECT ARRAY(
          SELECT DISTINCT t
          FROM unnest(COALESCE(tags, '{}') || p_tags) AS t
          WHERE t IS NOT NULL AND btrim(t) <> ''
        )
      ),
      is_active = true
    WHERE id = v;
  END IF;

  RETURN v;
END $fn$;

-- ============================================================
-- 1) Event location + Granicus enrichment (UPDATE only)
-- ============================================================
UPDATE events SET
  location_name = 'Arts & Science Discovery Center, Lafayette Library and Learning Center, 3491 Mt. Diablo Blvd',
  latitude = 37.8919426,
  longitude = -122.1159305,
  source_url = 'https://lafayette.granicus.com/GeneratedAgendaViewer.php?view_id=3&event_id=1468',
  description = $desc$MMMAC Meeting #1 — Mt. Diablo Boulevard Corridor Multi-Modal Mobility Plan (M3) project introduction and guiding principles. Staff: Patrick Golier. No formal action requested. [confidence=high; UPDATE_LOCATION_FROM_GRANICUS view_id=3 event_id=1468; agenda PDF meta_id=214081; packet meta_id=214098 (item 5A). User empty view_id+meta_id=214085 404s — not stored. Agenda: https://lafayette.granicus.com/MetaViewer.php?view_id=3&event_id=1468&meta_id=214081 Packet: https://lafayette.granicus.com/MetaViewer.php?view_id=3&event_id=1468&meta_id=214098]$desc$,
  category = 'government',
  event_type = 'meeting'
WHERE title ILIKE '%Multi-Modal Mobility Advisory Committee%'
  AND body ILIKE '%Multi-Modal Mobility Advisory Committee%'
  AND starts_at >= TIMESTAMPTZ '2026-09-21 19:00:00-07'
  AND starts_at < TIMESTAMPTZ '2026-09-21 20:00:00-07';

-- ============================================================
-- 2) Eight M3-packet projects (CSV status mapped onto project_status)
--    planning→proposed, design→in_progress, funded_construction→approved,
--    construction→in_progress, implementation→in_progress
-- ============================================================
DO $$
DECLARE
  packet text := 'https://lafayette.granicus.com/MetaViewer.php?view_id=3&event_id=1468&meta_id=214098';
  m3_id bigint;
BEGIN
  m3_id := pg_temp.lp_project_by_slug(
    'Mt. Diablo Boulevard Corridor Multi-Modal Mobility Plan (M3)',
    'mt-diablo-blvd-corridor-m3',
    'proposed',
    'transportation',
    $d$Umbrella 20-year multimodal mobility and public-realm framework for Downtown Lafayette (Mt. Diablo Blvd between Acalanes Rd and Pleasant Hill Rd, including BART and commercial core). Guides alignment across concurrent downtown mobility efforts. Advisory input via Multi-Modal Mobility Advisory Committee (~18–24 month term).

Staff report 2026-09-21 MMMAC Meeting #1 (Patrick Golier). Planned MMMAC touchpoints (seasons only — no dated meetings invented): Fall 2026, Winter 2027, Spring 2027, Summer 2027, Fall 2027.$d$,
    'Downtown Lafayette / Mt. Diablo Blvd corridor',
    packet,
    DATE '2026-07-01',
    DATE '2027-12-01',
    '2026-07 to 2027-12',
    'Local funds $300,000',
    300000,
    ARRAY['bike_ped','mt-diablo-blvd-corridor-m3','granicus_m3_packet','multi-modal-mobility-advisory-committee','m3','downtown']
  );

  PERFORM pg_temp.lp_project_by_slug(
    'BART Station Access & Circulation Study',
    'bart-station-access-circulation-study',
    'proposed',
    'transportation',
    $d$Identify multi-modal access improvements within ½ mile of Lafayette BART; support MTC Transit-Oriented Communities policy. Parallel to M3.

From Attachment 2 (Apr 20 2026 TCC staff report) in MMMAC 5A packet.$d$,
    'Lafayette BART walkshed',
    packet,
    DATE '2026-02-01',
    DATE '2027-08-01',
    '2026-02 to 2027-08',
    'MTC technical assistance grant $350,000',
    350000,
    ARRAY['bike_ped','bart-station-access-circulation-study','granicus_m3_packet','circulation-commission','BART','study']
  );

  PERFORM pg_temp.lp_project_by_slug(
    'Aqueduct Pathway – Design (Dolores Dr to Pleasant Hill Rd)',
    'aqueduct-pathway-design',
    'in_progress',
    'transportation',
    $d$Design for Aqueduct Pathway segment between Dolores Drive and Pleasant Hill Road.

Attachment 2 in MMMAC 5A packet.$d$,
    'Aqueduct Pathway corridor',
    packet,
    DATE '2025-10-01',
    DATE '2026-12-01',
    '2025-10 to 2026-12',
    'MTC grant $300,000',
    300000,
    ARRAY['bike_ped','aqueduct-pathway-design','granicus_m3_packet','pathway','aqueduct']
  );

  PERFORM pg_temp.lp_project_by_slug(
    'Aqueduct Pathway – Construction (Dolores Drive to BART)',
    'aqueduct-pathway-construction-dolores-bart',
    'approved',
    'transportation',
    $d$Construct key Aqueduct Pathway segment supporting non-auto access to BART and downtown.

Attachment 2 in MMMAC 5A packet.$d$,
    'Dolores Drive to Lafayette BART',
    packet,
    NULL,
    DATE '2029-12-31',
    'construction phase FY2029',
    'Secured from multiple sources totaling $4.15 million; construction phase FY2029',
    4150000,
    ARRAY['bike_ped','aqueduct-pathway-construction-dolores-bart','granicus_m3_packet','pathway','aqueduct','BART']
  );

  PERFORM pg_temp.lp_project_by_slug(
    'BART Town Center Pathway & Bike Station Project',
    'bart-town-center-pathway-bike-station',
    'in_progress',
    'transportation',
    $d$Improve bicycle parking, pedestrian connectivity, and public realm near Lafayette BART.

Attachment 2; construction 2026.$d$,
    'Lafayette BART Station',
    packet,
    DATE '2026-01-01',
    DATE '2026-12-31',
    '2026',
    'Fully funded from multiple sources totaling $3.98 million',
    3980000,
    ARRAY['bike_ped','bart-town-center-pathway-bike-station','granicus_m3_packet','BART','bike_station','town_center']
  );

  PERFORM pg_temp.lp_project_by_slug(
    'Connecting Lafayette Project (School Street / Topper Lane)',
    'connecting-lafayette-school-street-topper',
    'in_progress',
    'transportation',
    $d$Construct separated Class I pedestrian and bicycle facilities on School Street and Topper Lane connecting neighborhoods, schools, and downtown.

Also called Downtown Pathways and Schools Safety Project in M3 presentation.$d$,
    'School Street and Topper Lane',
    packet,
    DATE '2026-01-01',
    DATE '2027-12-31',
    '2026 to 2027',
    'Fully funded from multiple sources totaling $4.42 million',
    4420000,
    ARRAY['bike_ped','connecting-lafayette-school-street-topper','granicus_m3_packet','pathways','school']
  );

  PERFORM pg_temp.lp_project_by_slug(
    'Smart Signals Project',
    'smart-signals',
    'in_progress',
    'transportation',
    $d$Upgraded signal technology for coordination, traffic flow, and safer operations for all users.

Attachment 2.$d$,
    'Downtown Lafayette signals',
    packet,
    DATE '2026-01-01',
    DATE '2027-12-31',
    '2026 to 2027',
    'Fully funded from multiple sources',
    NULL,
    ARRAY['traffic_calming','smart-signals','granicus_m3_packet','signal_upgrades','downtown']
  );

  PERFORM pg_temp.lp_project_by_slug(
    'Downtown Parking Management Study (implementation)',
    'downtown-parking-management-study',
    'in_progress',
    'transportation',
    $d$Update parking and curb management strategies; study adoption anticipated 1st half 2026; City advancing strategy implementation.

Attachment 2 / M3 presentation.$d$,
    'Downtown Lafayette',
    packet,
    NULL,
    DATE '2026-06-01',
    'through 2026-06',
    'MTC grant $170,000 (study)',
    170000,
    ARRAY['traffic_calming','downtown-parking-management-study','granicus_m3_packet','parking','downtown','study']
  );

  -- Link Meeting #1 to the M3 umbrella plan (same packet). No extra events.
  UPDATE events SET linked_project_id = m3_id
  WHERE title ILIKE '%Multi-Modal Mobility Advisory Committee%'
    AND body ILIKE '%Multi-Modal Mobility Advisory Committee%'
    AND starts_at >= TIMESTAMPTZ '2026-09-21 19:00:00-07'
    AND starts_at < TIMESTAMPTZ '2026-09-21 20:00:00-07';
END $$;
