-- Seed data: Known Lafayette projects for initial dashboard content

INSERT INTO projects (title, description, category, status, location_name, latitude, longitude, timeline_text, funding_source, estimated_cost, source_type, tags) VALUES
(
  'Mt. Diablo Blvd Complete Streets Corridor',
  'Comprehensive redesign of Mt. Diablo Boulevard through downtown Lafayette to improve bike lanes, widen sidewalks, and add protected pedestrian crossings. Includes new bike lane striping from Moraga Rd to Risa Rd.',
  'bike_ped',
  'in_progress',
  'Mt. Diablo Blvd, Downtown Lafayette',
  37.8935, -122.1178,
  'Q2 2025 - Q4 2026',
  'Measure J, Federal HSIP Grant',
  2500000.00,
  'agenda',
  ARRAY['bike lane', 'complete streets', 'downtown', 'pedestrian safety']
),
(
  'Lafayette-Moraga Regional Trail Improvements',
  'Trail resurfacing, lighting upgrades, and new wayfinding signage along the Lafayette-Moraga Regional Trail. Includes ADA-compliant access improvements at three trailheads.',
  'parks_trails',
  'approved',
  'Lafayette-Moraga Regional Trail',
  37.8750, -122.1250,
  'Q1 - Q3 2026',
  'East Bay Regional Park District, Measure WW',
  850000.00,
  'agenda',
  ARRAY['trail', 'lighting', 'ADA', 'wayfinding']
),
(
  'Safe Routes to School — Burton Valley Elementary',
  'Installation of new crosswalk signals, flashing beacons, and a designated walking school bus route for Burton Valley Elementary School. Includes traffic calming on School Lane.',
  'safe_routes',
  'in_progress',
  'Burton Valley Elementary, School Lane',
  37.8820, -122.1270,
  'Fall 2025 - Spring 2026',
  'SRTS Federal Grant, City General Fund',
  420000.00,
  'agenda',
  ARRAY['SRTS', 'crosswalk', 'school zone', 'walking bus', 'Burton Valley']
),
(
  'Happy Valley Road Traffic Calming',
  'Speed cushion installation, radar speed feedback signs, and neighborhood traffic circle at key intersections on Happy Valley Road to reduce cut-through traffic and speeding.',
  'street_quieting',
  'approved',
  'Happy Valley Road',
  37.8850, -122.1050,
  'Q2 2026',
  'City Traffic Calming Fund',
  180000.00,
  'agenda',
  ARRAY['speed cushions', 'radar signs', 'traffic circle', 'cut-through traffic']
),
(
  'Deer Hill Road / Pleasant Hill Road Intersection Redesign',
  'Major intersection improvement project including new traffic signals, dedicated left turn lanes, and bike-safe lane markings. Aims to reduce collision rate at this high-risk intersection.',
  'infrastructure',
  'proposed',
  'Deer Hill Rd & Pleasant Hill Rd',
  37.9010, -122.1060,
  '2026 - 2027',
  'Regional Measure 3, City CIP',
  3200000.00,
  'agenda',
  ARRAY['intersection', 'signal', 'safety', 'bike lanes']
),
(
  'City Council: Transportation Master Plan Update',
  'City Council study session to review and adopt the updated Transportation Master Plan including Vision Zero goals, bike network expansion, and pedestrian priority zones in downtown.',
  'city_council',
  'proposed',
  'Lafayette City Hall',
  37.8935, -122.1185,
  'March 2026',
  NULL,
  NULL,
  'agenda',
  ARRAY['transportation plan', 'Vision Zero', 'policy', 'bike network']
),
(
  'Safe Routes to School — Springhill Elementary',
  'Improved school zone signage, new crosswalk at Reliez Station Rd, and parent education program for safe walking and biking routes to Springhill Elementary.',
  'safe_routes',
  'proposed',
  'Springhill Elementary, Reliez Station Rd',
  37.8990, -122.1050,
  'Fall 2026',
  'SRTS State Grant (pending)',
  250000.00,
  'agenda',
  ARRAY['SRTS', 'school zone', 'crosswalk', 'Springhill']
),
(
  'Olympic Blvd Bike Lane Extension',
  'Extension of the existing bike lane on Olympic Boulevard from 1st Street to Pleasant Hill Road, creating a continuous bike corridor connecting to BART.',
  'bike_ped',
  'approved',
  'Olympic Blvd, from 1st St to Pleasant Hill Rd',
  37.8960, -122.1120,
  'Q3 2026',
  'Contra Costa Transportation Authority',
  680000.00,
  'agenda',
  ARRAY['bike lane', 'BART connection', 'corridor']
),
(
  'Briones Regional Park Trail Connector',
  'New multi-use trail segment connecting the Lafayette-Moraga Trail to Briones Regional Park via a grade-separated crossing of Pleasant Hill Road.',
  'parks_trails',
  'proposed',
  'Briones Regional Park / Pleasant Hill Rd',
  37.9200, -122.1400,
  '2027',
  'EBRPD Bond Measure, State Trails Grant',
  1500000.00,
  'agenda',
  ARRAY['trail connector', 'Briones', 'multi-use', 'grade separation']
),
(
  'Moraga Road Speed Reduction Pilot',
  'Pilot program to reduce the speed limit on Moraga Road from 35 to 30 mph between Mt. Diablo Blvd and the Moraga town line, with new radar speed signs and enforcement.',
  'street_quieting',
  'in_progress',
  'Moraga Road',
  37.8870, -122.1240,
  'January - June 2026',
  'City General Fund',
  95000.00,
  'agenda',
  ARRAY['speed reduction', 'radar signs', 'pilot program', 'Moraga Road']
);

-- Seed agenda items
INSERT INTO agenda_items (date, body, title, description, category, linked_project, source_url, tags) VALUES
(
  '2026-02-24',
  'City Council',
  'Transportation Master Plan Update — Study Session',
  'The Council will review draft goals for the 2026 Transportation Master Plan update, including Vision Zero adoption and bike network priorities.',
  'city_council',
  (SELECT id FROM projects WHERE title LIKE '%Transportation Master Plan%' LIMIT 1),
  NULL,
  ARRAY['transportation plan', 'Vision Zero', 'study session']
),
(
  '2026-02-20',
  'Circulation Commission',
  'Happy Valley Road Traffic Calming — Design Review',
  'Review of final design plans for speed cushions and traffic circles on Happy Valley Road. Public comment period open.',
  'street_quieting',
  (SELECT id FROM projects WHERE title LIKE '%Happy Valley%' LIMIT 1),
  NULL,
  ARRAY['traffic calming', 'Happy Valley', 'design review']
),
(
  '2026-02-18',
  'Parks & Recreation Commission',
  'Lafayette-Moraga Trail Lighting and Resurfacing Update',
  'Staff report on trail improvement progress. Phase 1 resurfacing complete, Phase 2 lighting installation to begin in March.',
  'parks_trails',
  (SELECT id FROM projects WHERE title LIKE '%Lafayette-Moraga Regional Trail%' LIMIT 1),
  NULL,
  ARRAY['trail', 'lighting', 'construction update']
),
(
  '2026-02-10',
  'City Council',
  'Consent Calendar — SRTS Grant Acceptance (Burton Valley)',
  'Accept federal Safe Routes to School grant of $320,000 for Burton Valley Elementary improvements.',
  'safe_routes',
  (SELECT id FROM projects WHERE title LIKE '%Burton Valley%' LIMIT 1),
  NULL,
  ARRAY['SRTS', 'grant', 'Burton Valley', 'consent calendar']
),
(
  '2026-02-06',
  'Circulation Commission',
  'Moraga Road Speed Reduction — 90-Day Progress Report',
  'Staff presentation on the first 90 days of the Moraga Road speed reduction pilot. Average speeds down 3 mph; compliance improving.',
  'street_quieting',
  (SELECT id FROM projects WHERE title LIKE '%Moraga Road Speed%' LIMIT 1),
  NULL,
  ARRAY['speed reduction', 'pilot', 'Moraga Road', 'progress report']
),
(
  '2026-01-27',
  'City Council',
  'CIP Budget Amendment — Deer Hill/Pleasant Hill Intersection',
  'Approve budget amendment to begin preliminary engineering for the Deer Hill/Pleasant Hill intersection redesign project.',
  'infrastructure',
  (SELECT id FROM projects WHERE title LIKE '%Deer Hill%' LIMIT 1),
  NULL,
  ARRAY['CIP', 'budget', 'intersection', 'engineering']
);

-- Seed project updates
INSERT INTO project_updates (project_id, update_text, source_type, source_date) VALUES
(
  (SELECT id FROM projects WHERE title LIKE '%Mt. Diablo Blvd%' LIMIT 1),
  'Phase 1 bike lane striping completed between Moraga Rd and Oak Hill Rd. Phase 2 sidewalk widening beginning in April 2026.',
  'agenda',
  '2026-02-24'
),
(
  (SELECT id FROM projects WHERE title LIKE '%Burton Valley%' LIMIT 1),
  'Federal SRTS grant of $320,000 formally accepted by City Council. Construction bidding to begin in March 2026.',
  'agenda',
  '2026-02-10'
),
(
  (SELECT id FROM projects WHERE title LIKE '%Moraga Road Speed%' LIMIT 1),
  '90-day progress report shows average speeds reduced by 3 mph. Two radar speed signs operational. Community feedback largely positive.',
  'agenda',
  '2026-02-06'
),
(
  (SELECT id FROM projects WHERE title LIKE '%Lafayette-Moraga Regional Trail%' LIMIT 1),
  'Phase 1 resurfacing between St. Marys Rd and Olympic Blvd completed. New wayfinding signage installed at 4 locations.',
  'agenda',
  '2026-02-18'
);
