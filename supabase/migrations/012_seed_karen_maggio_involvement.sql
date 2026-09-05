-- Fill in Karen Maggio's Lafayette (CA) organizational involvement.
--
-- Idempotent and self-contained (re-declares the pg_temp helpers). Karen Maggio
-- already exists as a Lafayette Community Foundation board member (011); this
-- adds her documented civic history and links her to each body. People are
-- matched by lower(full_name), so no duplicate person is created.
--
-- Source: Lafayette Community Foundation board bio —
--   https://cflafayette.org/why-we-care/board-of-directors/karen-maggio/
-- Corroborated by City of Lafayette Planning Commission / Library history.
--
-- Documented involvement (last ~25 years):
--   * Planning Commission — appointed 2000, served 12 years, twice Chair;
--     helped shape the General Plan, Downtown Specific Plan, Ridgeline Ordinances.
--   * Lafayette Library and Learning Center — Vision 2000 Library Committee
--     (the catalyst for the LLLC) and later Planning Commission liaison to its
--     building committee.
--   * Sustainable Lafayette — Board of Directors.
--   * City of Lafayette Environmental Task Force — Co-chair.
--   * Lafayette Community Foundation — Board member (seeded in 011).
--   * Earlier volunteer work (bio only): Lafayette School PTA, LMYA, Junior
--     Achievement. Principal/founder of POM Resource Group (sustainability,
--     planning, green building).

CREATE OR REPLACE FUNCTION pg_temp.lp_org(
  p_name text, p_slug text, p_type org_type, p_desc text,
  p_website text, p_location text, p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v uuid;
BEGIN
  INSERT INTO organizations (name, slug, org_type, description, website, location_name, metadata)
  VALUES (p_name, p_slug, p_type, p_desc, p_website, p_location, p_meta)
  ON CONFLICT (slug) DO UPDATE
    SET website = COALESCE(EXCLUDED.website, organizations.website),
        description = COALESCE(organizations.description, EXCLUDED.description),
        metadata = organizations.metadata || EXCLUDED.metadata,
        updated_at = NOW()
  RETURNING id INTO v;
  RETURN v;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.lp_person(
  p_name text, p_bio text DEFAULT NULL, p_website text DEFAULT NULL,
  p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM people WHERE lower(full_name) = lower(p_name) LIMIT 1;
  IF v IS NULL THEN
    INSERT INTO people (full_name, bio, website, metadata)
    VALUES (p_name, p_bio, p_website, p_meta)
    RETURNING id INTO v;
  ELSE
    UPDATE people
      SET bio = COALESCE(bio, p_bio),
          website = COALESCE(website, p_website),
          metadata = metadata || p_meta,
          updated_at = NOW()
    WHERE id = v;
  END IF;
  RETURN v;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.lp_membership(
  p_person uuid, p_org uuid, p_role text, p_primary boolean,
  p_start date, p_end date, p_source text
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE person_id = p_person AND organization_id = p_org
      AND COALESCE(role, '') = COALESCE(p_role, '')
  ) THEN
    INSERT INTO memberships (person_id, organization_id, role, is_primary, start_date, end_date, source_url)
    VALUES (p_person, p_org, p_role, p_primary, p_start, p_end, p_source);
  END IF;
END $fn$;

DO $$
DECLARE
  v_karen      uuid;
  v_planning   uuid;
  v_sustain    uuid;
  v_foundation uuid;
  v_library    uuid;
  v_env        uuid;
  s_bio        text := 'https://cflafayette.org/why-we-care/board-of-directors/karen-maggio/';
BEGIN
  -- ---- Organizations (resolve existing, add the two new bodies) -----------
  v_planning := pg_temp.lp_org(
    'Planning Commission', 'planning-commission', 'city_body',
    'Advisory body on land use, zoning, and the General Plan.',
    'https://www.lovelafayette.org/city-government/commissions-committees/planning-commission',
    'Lafayette, CA', '{"source":"seed"}'::jsonb);

  v_sustain := pg_temp.lp_org(
    'Sustainable Lafayette', 'sustainable-lafayette', 'civic',
    'Volunteer environmental organization advancing climate action, sustainability, and green practices in Lafayette.',
    'https://sustainablelafayette.org/', 'Lafayette, CA', '{"source":"seed"}'::jsonb);

  v_foundation := pg_temp.lp_org(
    'Lafayette Community Foundation', 'community-foundation', 'foundation',
    'Local philanthropic foundation (est. 1999) that invests in programs promoting the civic, cultural, educational and environmental health of Lafayette.',
    'https://lafayettecf.org/', 'Lafayette, CA', '{"source":"seed"}'::jsonb);

  v_library := pg_temp.lp_org(
    'Lafayette Library and Learning Center Foundation', 'library-learning-center-foundation', 'foundation',
    'Nonprofit that helped build and now sustains the Lafayette Library and Learning Center (opened 2009), funding programs, learning centers, and endowment. Grew out of the community''s Vision 2000 library planning effort.',
    'https://www.lllcf.org/', 'Lafayette, CA', '{"source":"seed"}'::jsonb);

  v_env := pg_temp.lp_org(
    'Lafayette Environmental Task Force', 'environmental-task-force', 'city_body',
    'City of Lafayette task force convened to advance local environmental and sustainability policy.',
    'https://www.lovelafayette.org/city-hall/commissions-committees', 'Lafayette, CA', '{"source":"seed"}'::jsonb);

  -- ---- Person (fill in bio; do not duplicate) -----------------------------
  v_karen := pg_temp.lp_person(
    'Karen Maggio',
    'California native and longtime Lafayette resident. Appointed to the Lafayette Planning Commission in 2000, she served twelve years (twice as Chair) and helped shape the current General Plan, the Downtown Specific Plan, and the Ridgeline Ordinances that protect Lafayette''s ridgelines. She served on the Vision 2000 Library Committee — the catalyst for the Lafayette Library and Learning Center — and later as the Planning Commission liaison to its building committee. She also served on the Sustainable Lafayette board and co-chaired the City of Lafayette Environmental Task Force, and sits on the Lafayette Community Foundation board. Principal and founder of POM Resource Group, a sustainability, planning, and green-building consultancy, she has lectured at Mills College, San Francisco State, Saint Mary''s College, and Diablo Valley College. Earlier community work included the Lafayette School PTA, LMYA, and Junior Achievement.',
    NULL,
    ('{"source":"seed","profession":"Sustainability / planning consultant (POM Resource Group)","source_url":"' || s_bio || '"}')::jsonb);

  -- ---- Memberships (organizational affinities across ~25 years) -----------
  PERFORM pg_temp.lp_membership(v_karen, v_planning,   'Commissioner (Chair, two terms)', false, DATE '2000-01-01', DATE '2012-12-31', s_bio);
  PERFORM pg_temp.lp_membership(v_karen, v_library,    'Vision 2000 Library Committee; Planning Commission liaison to the building committee', false, DATE '2000-01-01', NULL, s_bio);
  PERFORM pg_temp.lp_membership(v_karen, v_sustain,    'Former board member',            false, NULL, NULL, s_bio);
  PERFORM pg_temp.lp_membership(v_karen, v_env,        'Co-chair',                       false, NULL, NULL, s_bio);
  -- Community Foundation membership already seeded in 011; ensure the link exists.
  PERFORM pg_temp.lp_membership(v_karen, v_foundation, 'Board member',                   false, NULL, NULL, 'https://lafayettecf.org/why-we-care/board-of-directors/karen-maggio/');
END $$;
