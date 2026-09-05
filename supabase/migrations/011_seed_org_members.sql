-- Backfill members for Lafayette (CA) civic organizations that otherwise show
-- zero members in the Board directory.
--
-- Idempotent: safe to re-run. Self-contained (re-declares the session-local
-- pg_temp helpers so this file can run independently of 010). People are
-- matched by lower(full_name), so councilmembers who also sit on these boards
-- (e.g., Susan Candell, Mario DiPrisco) are linked rather than duplicated.
--
-- Sourcing:
--   * Lafayette Community Foundation board — lafayettecf.org / cflafayette.org
--     "Board of Directors" (GuideStar EIN 80-0022897). Cheryl Noll has served
--     as President for ~7 years.
--   * Sustainable Lafayette — sustainablelafayette.org "Our Board" and
--     founding history (An Inconvenient Truth, 2007).
--
-- Only publicly listed board roles are recorded. These are civic-volunteer
-- affiliations; no partisan leaning is asserted for individual board members.

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
  v_foundation uuid;
  v_sustain    uuid;
  s_cf_board   text := 'https://lafayettecf.org/why-we-care/board-of-directors/';
  s_sl_board   text := 'https://sustainablelafayette.org/our-board/';
  p            uuid;
BEGIN
  -- ============================================================
  -- Lafayette Community Foundation — Board of Directors
  -- ============================================================
  v_foundation := pg_temp.lp_org(
    'Lafayette Community Foundation', 'community-foundation', 'foundation',
    'Local philanthropic foundation (est. 1999) that invests in programs promoting the civic, cultural, educational and environmental health of Lafayette through annual Excellence Grants.',
    'https://lafayettecf.org/', 'Lafayette, CA', '{"source":"seed"}'::jsonb);

  p := pg_temp.lp_person('Cheryl Noll',
    'President of the Lafayette Community Foundation (serving in the role for roughly seven years).',
    NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'President', true, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Ann Appert', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Diane Barbera', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Dawn Brightbill', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Rachel Browne', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Mindy Bush',
    'Lafayette Community Foundation board member; has served in board chair, treasurer, secretary, event-chair and fundraising roles.',
    NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  -- Susan Candell and Mario DiPrisco already exist (city council) — link, don't duplicate.
  p := pg_temp.lp_person('Susan Candell', NULL, NULL, ('{"source":"seed"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Mario DiPrisco', NULL, NULL, ('{"source":"seed"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL,
    'https://lafayettecf.org/why-we-care/board-of-directors/mario-diprisco/');

  p := pg_temp.lp_person('Grace Dixon', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Carol Federighi', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Sierra Higgins', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Karen Maggio', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Mary Newman', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Christine Raymond', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Brian Rochford', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Michele Sahar', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  p := pg_temp.lp_person('Randall Whitney', NULL, NULL, ('{"source":"seed","source_url":"' || s_cf_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_foundation, 'Board member', false, NULL, NULL, s_cf_board);

  -- ============================================================
  -- Sustainable Lafayette — Board
  -- ============================================================
  v_sustain := pg_temp.lp_org(
    'Sustainable Lafayette', 'sustainable-lafayette', 'civic',
    'Volunteer environmental organization advancing climate action, sustainability, and green practices in Lafayette. Founded in 2007 after the release of "An Inconvenient Truth."',
    'https://sustainablelafayette.org/', 'Lafayette, CA', '{"source":"seed"}'::jsonb);

  p := pg_temp.lp_person('Sejal Choksi-Chugh',
    'Board President of Sustainable Lafayette; also Executive Director of San Francisco Baykeeper.',
    NULL, ('{"source":"seed","source_url":"' || s_sl_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_sustain, 'Board President', true, NULL, NULL, s_sl_board);

  p := pg_temp.lp_person('Brad Crane',
    'Board Vice President of Sustainable Lafayette.',
    NULL, ('{"source":"seed","source_url":"' || s_sl_board || '"}')::jsonb);
  PERFORM pg_temp.lp_membership(p, v_sustain, 'Board Vice President', true, NULL, NULL, s_sl_board);

  p := pg_temp.lp_person('Steve Richard',
    'Co-founder of Sustainable Lafayette (2007); technology executive.',
    NULL, '{"source":"seed","source_url":"https://sustainablelafayette.org/about-us/"}'::jsonb);
  PERFORM pg_temp.lp_membership(p, v_sustain, 'Co-founder', false, DATE '2007-01-01', NULL,
    'https://sustainablelafayette.org/about-us/');

  p := pg_temp.lp_person('Bart Carr',
    'Co-founder of Sustainable Lafayette (2007); former senior program manager with RecycleSmart.',
    NULL, '{"source":"seed","source_url":"https://sustainablelafayette.org/about-us/"}'::jsonb);
  PERFORM pg_temp.lp_membership(p, v_sustain, 'Co-founder', false, DATE '2007-01-01', NULL,
    'https://sustainablelafayette.org/about-us/');
END $$;
