-- Expand project_category enum to cover all City of Lafayette email
-- subscription topics, grouped into broader buckets.
--
-- Old values → new mapping:
--   bike_ped        → transportation
--   safe_routes     → transportation
--   street_quieting → transportation
--   city_council    → government
--   infrastructure  → development
--   parks_trails    → parks_environment
--
-- New values added:
--   public_safety, community, jobs, news

-- Step 1: Add the new enum values
ALTER TYPE project_category ADD VALUE IF NOT EXISTS 'transportation';
ALTER TYPE project_category ADD VALUE IF NOT EXISTS 'government';
ALTER TYPE project_category ADD VALUE IF NOT EXISTS 'development';
ALTER TYPE project_category ADD VALUE IF NOT EXISTS 'parks_environment';
ALTER TYPE project_category ADD VALUE IF NOT EXISTS 'public_safety';
ALTER TYPE project_category ADD VALUE IF NOT EXISTS 'community';
ALTER TYPE project_category ADD VALUE IF NOT EXISTS 'jobs';
ALTER TYPE project_category ADD VALUE IF NOT EXISTS 'news';

-- Step 2: Migrate existing data to new categories
UPDATE projects SET category = 'transportation'    WHERE category IN ('bike_ped', 'safe_routes', 'street_quieting');
UPDATE projects SET category = 'government'         WHERE category = 'city_council';
UPDATE projects SET category = 'development'        WHERE category = 'infrastructure';
UPDATE projects SET category = 'parks_environment'  WHERE category = 'parks_trails';

UPDATE agenda_items SET category = 'transportation'    WHERE category IN ('bike_ped', 'safe_routes', 'street_quieting');
UPDATE agenda_items SET category = 'government'         WHERE category = 'city_council';
UPDATE agenda_items SET category = 'development'        WHERE category = 'infrastructure';
UPDATE agenda_items SET category = 'parks_environment'  WHERE category = 'parks_trails';

-- Step 3: Add subcategory tags to existing projects so the UI can
-- nest them properly (first tag = subcategory key).
UPDATE projects
SET tags = ARRAY['bike_ped'] || tags
WHERE category = 'transportation'
  AND NOT ('bike_ped' = ANY(tags))
  AND NOT ('safe_routes' = ANY(tags))
  AND NOT ('traffic_calming' = ANY(tags))
  AND (title ILIKE '%bike%' OR title ILIKE '%pedestrian%' OR title ILIKE '%complete streets%');

UPDATE projects
SET tags = ARRAY['safe_routes'] || tags
WHERE category = 'transportation'
  AND NOT ('bike_ped' = ANY(tags))
  AND NOT ('safe_routes' = ANY(tags))
  AND NOT ('traffic_calming' = ANY(tags))
  AND title ILIKE '%safe routes%';

UPDATE projects
SET tags = ARRAY['traffic_calming'] || tags
WHERE category = 'transportation'
  AND NOT ('bike_ped' = ANY(tags))
  AND NOT ('safe_routes' = ANY(tags))
  AND NOT ('traffic_calming' = ANY(tags))
  AND (title ILIKE '%traffic%' OR title ILIKE '%speed%' OR title ILIKE '%quieting%');

UPDATE projects
SET tags = ARRAY['city_council'] || tags
WHERE category = 'government'
  AND NOT ('city_council' = ANY(tags))
  AND title ILIKE '%council%';

UPDATE projects
SET tags = ARRAY['capital_projects'] || tags
WHERE category = 'development'
  AND NOT ('capital_projects' = ANY(tags))
  AND NOT ('housing' = ANY(tags))
  AND (title ILIKE '%intersection%' OR title ILIKE '%road%' OR title ILIKE '%repav%');

UPDATE projects
SET tags = ARRAY['parks_trails'] || tags
WHERE category = 'parks_environment'
  AND NOT ('parks_trails' = ANY(tags))
  AND (title ILIKE '%trail%' OR title ILIKE '%park%');
