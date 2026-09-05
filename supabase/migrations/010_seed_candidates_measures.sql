-- Seed Lafayette (CA) candidates, City Council seats, ballot measures,
-- organizational affinities, and quote-backed stances.
--
-- Idempotent: safe to re-run. Uses session-local pg_temp helper functions
-- (auto-dropped at session end) to resolve-or-insert by natural keys
-- (people by lower(full_name), orgs by slug, seats by org+title+district,
-- measures by short_code+election_date). Existing dedupe_keys are skipped.
--
-- Sourcing: every row is backed by a public source_url. Stances are
-- attributed and quote-backed (a candidate's own priorities page, a named
-- campaign-committee role, a League endorsement, a City Council resolution
-- vote). Political leaning is NOT inferred from co-membership; it is recorded
-- only where a candidate or body took a documented, attributable position.
-- Lafayette City Council elections are officially nonpartisan.
--
-- Key facts (Sept 2026):
--   * The Nov 3, 2026 General Municipal Election was CANCELLED — the number of
--     nominees did not exceed the open seats, so the City Council appointed the
--     nominees "as if elected" (Aug 20, 2026), saving ~$48,000.
--       - James (Jim) Cervantes  -> 4-year term ending 2030
--       - Stella Wotherspoon      -> 4-year term ending 2030
--       - Mario DiPrisco          -> 2-year term ending 2028 (seat vacated by
--                                    Susan Candell, who did not seek re-election)
--   * Current council (2026): Carl Anduri (Mayor), John McCormick (Vice Mayor),
--     Susan Candell, Jim Cervantes, Stella Wotherspoon.

-- ============================================================
-- Helper functions (session-local; auto-dropped on disconnect)
-- ============================================================
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

CREATE OR REPLACE FUNCTION pg_temp.lp_seat(
  p_org uuid, p_title text, p_type seat_type, p_district text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM seats
   WHERE organization_id = p_org AND title = p_title
     AND COALESCE(district, '') = COALESCE(p_district, '')
   LIMIT 1;
  IF v IS NULL THEN
    INSERT INTO seats (organization_id, title, seat_type, district)
    VALUES (p_org, p_title, p_type, p_district)
    RETURNING id INTO v;
  END IF;
  RETURN v;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.lp_seat_holder(
  p_seat uuid, p_person uuid, p_start date, p_end date, p_source text
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM seat_holders WHERE seat_id = p_seat AND person_id = p_person
  ) THEN
    INSERT INTO seat_holders (seat_id, person_id, start_date, end_date, source_url)
    VALUES (p_seat, p_person, p_start, p_end, p_source);
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.lp_measure(
  p_title text, p_code text, p_summary text, p_status measure_status,
  p_date date, p_source text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM measures
   WHERE COALESCE(short_code, '') = COALESCE(p_code, '')
     AND COALESCE(election_date, DATE '0001-01-01') = COALESCE(p_date, DATE '0001-01-01')
   LIMIT 1;
  IF v IS NULL THEN
    SELECT id INTO v FROM measures WHERE lower(title) = lower(p_title) LIMIT 1;
  END IF;
  IF v IS NULL THEN
    INSERT INTO measures (title, short_code, summary, status, election_date, source_url)
    VALUES (p_title, p_code, p_summary, p_status, p_date, p_source)
    RETURNING id INTO v;
  ELSE
    UPDATE measures
      SET summary = COALESCE(summary, p_summary),
          status = p_status,
          source_url = COALESCE(source_url, p_source),
          updated_at = NOW()
    WHERE id = v;
  END IF;
  RETURN v;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.lp_candidacy(
  p_person uuid, p_seat uuid, p_measure uuid, p_date date,
  p_slate text, p_status candidacy_status, p_source text
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM candidacies
    WHERE person_id = p_person
      AND COALESCE(seat_id, '00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(p_seat, '00000000-0000-0000-0000-000000000000'::uuid)
      AND COALESCE(election_date, DATE '0001-01-01') = COALESCE(p_date, DATE '0001-01-01')
  ) THEN
    INSERT INTO candidacies (person_id, seat_id, measure_id, election_date, party_or_slate, status, source_url)
    VALUES (p_person, p_seat, p_measure, p_date, p_slate, p_status, p_source);
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.lp_stance(
  p_actor_type stance_actor_type, p_actor uuid,
  p_subject_type stance_subject_type, p_subject uuid, p_label text,
  p_polarity stance_polarity, p_conf real, p_quote text, p_source text, p_asof date
) RETURNS void LANGUAGE plpgsql AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM stances
    WHERE actor_type = p_actor_type AND actor_id = p_actor
      AND subject_type = p_subject_type
      AND COALESCE(subject_id::text, lower(COALESCE(p_label, ''))) =
          COALESCE(p_subject::text, lower(COALESCE(p_label, '')))
      AND polarity = p_polarity
      AND COALESCE(source_url, '') = COALESCE(p_source, '')
  ) THEN
    INSERT INTO stances (actor_type, actor_id, subject_type, subject_id, subject_label,
                         polarity, confidence, evidence_quote, source_url, as_of, metadata)
    VALUES (p_actor_type, p_actor, p_subject_type, p_subject, p_label,
            p_polarity, p_conf, p_quote, p_source, p_asof, '{"source":"seed"}'::jsonb);
  END IF;
END $fn$;

-- ============================================================
-- Seed
-- ============================================================
DO $$
DECLARE
  v_council       uuid;
  v_tcc           uuid;  -- Transportation & Circulation Commission
  v_planning      uuid;
  v_foundation    uuid;
  v_chamber       uuid;
  v_rotary        uuid;
  v_lpie          uuid;  -- Lafayette Partners in Education
  v_lwv           uuid;  -- League of Women Voters, Diablo Valley

  v_anduri        uuid;
  v_mccormick     uuid;
  v_candell       uuid;
  v_cervantes     uuid;
  v_wotherspoon   uuid;
  v_diprisco      uuid;

  v_seat_anduri     uuid;
  v_seat_mccormick  uuid;
  v_seat_candell    uuid;   -- 2-year seat vacated by Candell, filled by DiPrisco
  v_seat_cervantes  uuid;
  v_seat_wother     uuid;

  v_measure_h     uuid;
  v_measure_l18   uuid;
  v_measure_l20   uuid;

  c_election      date := DATE '2026-11-03';
  s_city          text := 'https://www.lovelafayette.org/city-hall/city-council';
  s_nov26         text := 'https://www.lovelafayette.org/city-hall/city-departments/administration/city-clerk/november-2026-general-election';
  s_appoint       text := 'https://contracosta.news/2026/08/22/lafayette-appoints-two-incumbents-and-one-new-councilmember/';
BEGIN
  -- ---- Organizations (resolve existing, add new bodies) --------------------
  v_council := pg_temp.lp_org(
    'Lafayette City Council', 'city-council', 'city_body',
    'Elected governing body of the City of Lafayette. Sets policy, adopts the budget, and appoints commissions. Five at-large councilmembers; the mayor and vice mayor are selected by the council each year.',
    s_city, 'Lafayette City Hall, Lafayette, CA',
    '{"source":"seed","nonpartisan":true}'::jsonb);

  v_planning := pg_temp.lp_org(
    'Planning Commission', 'planning-commission', 'city_body',
    'Advisory body on land use, zoning, and the General Plan.',
    'https://www.lovelafayette.org/city-government/commissions-committees/planning-commission',
    'Lafayette, CA', '{"source":"seed"}'::jsonb);

  v_tcc := pg_temp.lp_org(
    'Transportation and Circulation Commission', 'transportation-circulation-commission', 'city_body',
    'Advisory commission on the transportation network, road safety, bicycle and pedestrian circulation, and traffic calming in Lafayette.',
    'https://www.lovelafayette.org/city-hall/commissions-committees/transportation-and-circulation-commission',
    'Lafayette, CA', '{"source":"seed"}'::jsonb);

  v_foundation := pg_temp.lp_org(
    'Lafayette Community Foundation', 'community-foundation', 'foundation',
    'Local philanthropic foundation (est. 1999) that invests in programs promoting the civic, cultural, educational and environmental health of Lafayette through annual Excellence Grants.',
    'https://lafayettecf.org/', 'Lafayette, CA', '{"source":"seed"}'::jsonb);

  v_chamber := pg_temp.lp_org(
    'Lafayette Chamber of Commerce', 'chamber-of-commerce', 'civic',
    'Business advocacy and community-events organization serving Lafayette merchants and employers.',
    'https://www.lafayettechamber.org/', 'Lafayette, CA', '{"source":"seed"}'::jsonb);

  v_rotary := pg_temp.lp_org(
    'Rotary Club of Lafayette', 'rotary', 'civic',
    'Local Rotary club supporting community service, scholarships, and civic projects in Lafayette.',
    'https://www.rotarylafayette.org/', 'Lafayette, CA', '{"source":"seed"}'::jsonb);

  v_lpie := pg_temp.lp_org(
    'Lafayette Partners in Education', 'lpie', 'civic',
    'Nonprofit education foundation that raises funds for teachers, programs, and staff across the Lafayette School District.',
    'https://www.lpie.org/', 'Lafayette, CA', '{"source":"seed"}'::jsonb);

  v_lwv := pg_temp.lp_org(
    'League of Women Voters of Diablo Valley', 'lwv-diablo-valley', 'civic',
    'Nonpartisan civic organization that encourages informed participation in government and takes positions on local ballot measures after study.',
    'https://my.lwv.org/california/diablo-valley', 'Contra Costa County, CA', '{"source":"seed"}'::jsonb);

  -- ---- People: current council + 2026 appointees ---------------------------
  v_anduri := pg_temp.lp_person(
    'Carl Anduri',
    'Mayor of Lafayette (2026). First elected to the City Council in 2002, serving through 2012 (mayor in 2005 and 2011); re-elected in 2020 and mayor again in 2023.',
    NULL,
    ('{"source":"seed","role_context":"Mayor 2026","source_url":"' || s_city || '"}')::jsonb);

  v_mccormick := pg_temp.lp_person(
    'John McCormick',
    'Vice Mayor of Lafayette (2026). On the City Council since January 2024; long-time resident and co-owner of Lamorinda Music. Former Planning Commissioner; active with the Lafayette Chamber of Commerce and the Park Theater Trust.',
    NULL,
    ('{"source":"seed","role_context":"Vice Mayor 2026","source_url":"' || s_city || '"}')::jsonb);

  v_candell := pg_temp.lp_person(
    'Susan Candell',
    'Lafayette City Councilmember since 2018; served as Mayor in 2021 and 2024. Did not seek re-election in 2026. Also serves on the board of the Lafayette Community Foundation.',
    NULL,
    ('{"source":"seed","not_seeking_reelection_2026":true,"source_url":"' || s_appoint || '"}')::jsonb);

  v_cervantes := pg_temp.lp_person(
    'Jim Cervantes',
    'Lafayette City Councilmember (first seated December 2024). Public-finance professional with a 34-year career advising California cities and public agencies; appointed by the Governor as Chair of the California Housing Finance Agency (CalHFA), the state''s affordable-housing financing agency.',
    'https://jimforlafayette.com/',
    ('{"source":"seed","occupation":"Public finance","priorities":["Wildfire preparedness","Financial sustainability","Traffic safety"],"source_url":"https://jimforlafayette.com/priorities/"}')::jsonb);

  v_wotherspoon := pg_temp.lp_person(
    'Stella Wotherspoon',
    'Lafayette City Councilmember (appointed July 2025). Master''s in Geography/GIS; has worked in higher-education fundraising, software product management, and public-sector geospatial analysis. Served on the Transportation and Circulation Commission (2019– ) and the General Plan Advisory Committee (2021– ), and co-chaired the Measure H citizens'' campaign committee in 2024.',
    NULL,
    '{"source":"seed","priorities":["Transportation network effectiveness","Road safety","Housing element"],"source_url":"https://contracosta.news/2025/07/23/stella-wotherspoon-appointed-to-serve-on-lafayette-city-council/"}'::jsonb);

  v_diprisco := pg_temp.lp_person(
    'Mario DiPrisco',
    'Appointed to a two-year Lafayette City Council term (2026–2028). 26-year career in investment management with prior city-council experience. Has served on the Transportation & Circulation Commission, the ConFire advisory commission, the CCCERA Board of Retirement, the Rotary Club of Lafayette, the Lafayette Community Foundation board, and Lafayette Partners in Education.',
    'https://www.diprisco.org/',
    '{"source":"seed","occupation":"Investment management","affiliation_context":"Campaign canvassed with the Democratic Party of Contra Costa County (council office is nonpartisan)","affiliation_source":"https://contracostadems.com/event/mario-diprisco-for-lafayette-city-council-canvass-downtown/","source_url":"https://www.diprisco.org/"}'::jsonb);

  -- ---- City Council memberships (organizational affinities) ----------------
  PERFORM pg_temp.lp_membership(v_anduri,      v_council, 'Mayor',              true,  DATE '2020-12-01', NULL, s_city);
  PERFORM pg_temp.lp_membership(v_mccormick,   v_council, 'Vice Mayor',         true,  DATE '2024-01-01', NULL, s_city);
  PERFORM pg_temp.lp_membership(v_candell,     v_council, 'Councilmember',      true,  DATE '2018-12-01', NULL, s_city);
  PERFORM pg_temp.lp_membership(v_cervantes,   v_council, 'Councilmember',      true,  DATE '2024-12-09', NULL, s_city);
  PERFORM pg_temp.lp_membership(v_wotherspoon, v_council, 'Councilmember',      true,  DATE '2025-07-01', NULL, s_city);
  PERFORM pg_temp.lp_membership(v_diprisco,    v_council, 'Councilmember-elect',true,  DATE '2026-12-01', NULL, s_appoint);

  -- Cross-body affinities
  PERFORM pg_temp.lp_membership(v_mccormick,   v_planning, 'Former Planning Commissioner', false, NULL, DATE '2023-12-31', s_city);
  PERFORM pg_temp.lp_membership(v_mccormick,   v_chamber,  'Member',            false, NULL, NULL, 'https://www.lafayettechamber.org/');
  PERFORM pg_temp.lp_membership(v_candell,     v_foundation,'Board member',     false, NULL, NULL, 'https://lafayettecf.org/why-we-care/board-of-directors/');
  PERFORM pg_temp.lp_membership(v_wotherspoon, v_tcc,      'Commissioner',      false, DATE '2019-01-01', NULL, 'https://contracosta.news/2025/07/23/stella-wotherspoon-appointed-to-serve-on-lafayette-city-council/');
  PERFORM pg_temp.lp_membership(v_wotherspoon, v_lpie,     'Former board member', false, DATE '2023-01-01', DATE '2024-12-31', 'https://contracosta.news/2025/07/23/stella-wotherspoon-appointed-to-serve-on-lafayette-city-council/');
  PERFORM pg_temp.lp_membership(v_diprisco,    v_tcc,      'Former commissioner', false, NULL, NULL, 'https://www.diprisco.org/');
  PERFORM pg_temp.lp_membership(v_diprisco,    v_foundation,'Board member',     false, NULL, NULL, 'https://lafayettecf.org/why-we-care/board-of-directors/mario-diprisco/');
  PERFORM pg_temp.lp_membership(v_diprisco,    v_rotary,   'Member',            false, NULL, NULL, 'https://www.rotarylafayette.org/');
  PERFORM pg_temp.lp_membership(v_diprisco,    v_lpie,     'Former board member', false, NULL, NULL, 'https://www.diprisco.org/');

  -- ---- Formal seats + holders (five at-large council seats) ----------------
  v_seat_anduri    := pg_temp.lp_seat(v_council, 'City Councilmember', 'elected', 'At-large seat 1');
  v_seat_mccormick := pg_temp.lp_seat(v_council, 'City Councilmember', 'elected', 'At-large seat 2');
  v_seat_candell   := pg_temp.lp_seat(v_council, 'City Councilmember', 'elected', 'At-large seat 3');
  v_seat_cervantes := pg_temp.lp_seat(v_council, 'City Councilmember', 'elected', 'At-large seat 4');
  v_seat_wother    := pg_temp.lp_seat(v_council, 'City Councilmember', 'elected', 'At-large seat 5');

  PERFORM pg_temp.lp_seat_holder(v_seat_anduri,    v_anduri,      DATE '2020-12-01', NULL, s_city);
  PERFORM pg_temp.lp_seat_holder(v_seat_mccormick, v_mccormick,   DATE '2024-01-01', NULL, s_city);
  PERFORM pg_temp.lp_seat_holder(v_seat_candell,   v_candell,     DATE '2018-12-01', NULL, s_city);
  PERFORM pg_temp.lp_seat_holder(v_seat_cervantes, v_cervantes,   DATE '2024-12-09', NULL, s_city);
  PERFORM pg_temp.lp_seat_holder(v_seat_wother,    v_wotherspoon, DATE '2025-07-01', NULL, s_city);

  -- ---- 2026 candidacies (uncontested; appointed "as if elected") -----------
  -- Cervantes & Wotherspoon continue in their 4-year seats; DiPrisco takes the
  -- 2-year seat vacated by Candell.
  PERFORM pg_temp.lp_candidacy(v_cervantes,   v_seat_cervantes, NULL, c_election,
    'Nonpartisan — 4-year term (2026–2030); uncontested, appointed', 'elected', s_appoint);
  PERFORM pg_temp.lp_candidacy(v_wotherspoon, v_seat_wother,    NULL, c_election,
    'Nonpartisan — 4-year term (2026–2030); uncontested, appointed', 'elected', s_appoint);
  PERFORM pg_temp.lp_candidacy(v_diprisco,    v_seat_candell,   NULL, c_election,
    'Nonpartisan — 2-year term (2026–2028); uncontested, appointed', 'elected', s_appoint);

  -- ---- Ballot measures ------------------------------------------------------
  v_measure_h := pg_temp.lp_measure(
    'Lafayette Essential City Services Measure (half-cent sales tax)',
    'Measure H (2024)',
    'A half-cent (0.5%) general transactions and use tax for seven years, raising the Lafayette sales-tax rate from 8.75% to 9.25% (effective April 1, 2025). Expected to raise roughly $2.4 million a year to maintain city services — streets and pothole repair, storm drains, wildfire preparedness, police staffing, traffic safety, and senior and youth programs. Approved by more than 65% of voters in November 2024.',
    'passed', DATE '2024-11-05',
    'https://www.lovelafayette.org/business/measure-h-sales-tax');

  v_measure_l18 := pg_temp.lp_measure(
    'Homes at Deer Hill / Terraces of Lafayette referendum',
    'Measure L (2018)',
    'A June 2018 referendum on the "Homes at Deer Hill" development (the compromise alternative to the 315-unit Terraces of Lafayette apartment proposal). The measure failed, leaving the underlying apartment application on the table. A long-running, contentious Lafayette land-use fight.',
    'failed', DATE '2018-06-05',
    'https://www.lovelafayette.org/city-hall/quick-links/hot-topics/terraces-of-lafayette');

  v_measure_l20 := pg_temp.lp_measure(
    'Lafayette School District parcel tax',
    'Measure L (2020)',
    'A March 2020 Lafayette School District parcel tax to sustain funding for local elementary and middle schools. The Lafayette City Council adopted Resolution 2020-03 endorsing it by a 5–0 vote. Passed.',
    'passed', DATE '2020-03-03',
    'https://www.lovelafayette.org/city-hall/city-council');

  -- ---- Stances (attributed, quote-backed) ----------------------------------
  -- Measure H (2024) support
  PERFORM pg_temp.lp_stance('person', v_cervantes, 'measure', v_measure_h, NULL,
    'support', 0.9,
    'Support for Measure H — the half-cent sales tax proposal to stabilize the City''s finances and sustain important City services.',
    'https://jimforlafayette.com/priorities/', DATE '2024-10-01');

  PERFORM pg_temp.lp_stance('person', v_wotherspoon, 'measure', v_measure_h, NULL,
    'support', 0.9,
    'Co-chaired the Measure H Citizens'' Campaign Committee (2024).',
    'https://contracosta.news/2025/07/23/stella-wotherspoon-appointed-to-serve-on-lafayette-city-council/', DATE '2024-10-01');

  PERFORM pg_temp.lp_stance('organization', v_lwv, 'measure', v_measure_h, NULL,
    'endorse', 0.85,
    'Vote with the League! LWVDV Supports Measure H — Lafayette Sales Tax.',
    'https://my.lwv.org/california/diablo-valley/article/vote-league-lwvdv-supports-measure-h-lafayette-sales-tax', DATE '2024-10-01');

  -- Measure L (2020) endorsement — City Council Resolution 2020-03 (5–0)
  PERFORM pg_temp.lp_stance('organization', v_council, 'measure', v_measure_l20, NULL,
    'endorse', 0.85,
    'City Council adopted Resolution 2020-03 endorsing the parcel tax by a 5–0 vote.',
    'https://www.lovelafayette.org/city-hall/city-council', DATE '2020-02-24');

  PERFORM pg_temp.lp_stance('person', v_candell, 'measure', v_measure_l20, NULL,
    'support', 0.8,
    'Voted aye on City Council Resolution 2020-03 endorsing the Lafayette School District parcel tax (5–0).',
    'https://www.lovelafayette.org/city-hall/city-council', DATE '2020-02-24');
END $$;
