-- Migrate project_category enum from old values to new broader categories.
-- PostgreSQL doesn't support renaming/removing enum values directly,
-- so we recreate the type and update all references.

-- Step 1: Create the new enum type
CREATE TYPE project_category_new AS ENUM (
  'transportation',
  'government',
  'development',
  'parks_environment',
  'public_safety',
  'community',
  'jobs',
  'news'
);

-- Step 2: Update projects table
ALTER TABLE projects
  ALTER COLUMN category TYPE project_category_new
  USING CASE category::text
    WHEN 'bike_ped'         THEN 'transportation'::project_category_new
    WHEN 'safe_routes'      THEN 'transportation'::project_category_new
    WHEN 'street_quieting'  THEN 'transportation'::project_category_new
    WHEN 'infrastructure'   THEN 'development'::project_category_new
    WHEN 'city_council'     THEN 'government'::project_category_new
    WHEN 'parks_trails'     THEN 'parks_environment'::project_category_new
    ELSE 'government'::project_category_new
  END;

-- Step 3: Update agenda_items table
ALTER TABLE agenda_items
  ALTER COLUMN category TYPE project_category_new
  USING CASE category::text
    WHEN 'bike_ped'         THEN 'transportation'::project_category_new
    WHEN 'safe_routes'      THEN 'transportation'::project_category_new
    WHEN 'street_quieting'  THEN 'transportation'::project_category_new
    WHEN 'infrastructure'   THEN 'development'::project_category_new
    WHEN 'city_council'     THEN 'government'::project_category_new
    WHEN 'parks_trails'     THEN 'parks_environment'::project_category_new
    ELSE 'government'::project_category_new
  END;

-- Step 4: Drop old type, rename new one
DROP TYPE project_category;
ALTER TYPE project_category_new RENAME TO project_category;
