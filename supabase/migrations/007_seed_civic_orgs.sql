-- Seed Lafayette civic organizations for the Pulse Board directory.
-- Idempotent on slug so the file can be re-run safely.

INSERT INTO organizations (name, slug, org_type, description, website, location_name, metadata)
VALUES
(
  'Lafayette City Council',
  'city-council',
  'city_body',
  'Elected governing body of the City of Lafayette. Sets policy, adopts the budget, and appoints commissions.',
  'https://www.lovelafayette.org/city-government/city-council',
  'Lafayette City Hall, Lafayette, CA',
  '{"source": "seed"}'::jsonb
),
(
  'Planning Commission',
  'planning-commission',
  'city_body',
  'Advisory body on land use, zoning, and the General Plan. Reviews planning applications and makes recommendations to City Council.',
  'https://www.lovelafayette.org/city-government/commissions-committees/planning-commission',
  'Lafayette, CA',
  '{"source": "seed"}'::jsonb
),
(
  'Design Review Commission',
  'design-review-commission',
  'city_body',
  'Reviews architecture, site design, and related applications to keep development consistent with Lafayette’s character.',
  'https://www.lovelafayette.org/city-government/commissions-committees/design-review-commission',
  'Lafayette, CA',
  '{"source": "seed"}'::jsonb
),
(
  'Lafayette Chamber of Commerce',
  'chamber-of-commerce',
  'civic',
  'Business advocacy and community events organization serving Lafayette merchants and employers.',
  'https://www.lafayettechamber.org/',
  'Lafayette, CA',
  '{"source": "seed"}'::jsonb
),
(
  'Rotary Club of Lafayette',
  'rotary',
  'civic',
  'Local Rotary club supporting community service, scholarships, and civic projects in Lafayette.',
  'https://www.rotarylafayette.org/',
  'Lafayette, CA',
  '{"source": "seed"}'::jsonb
),
(
  'Lafayette Community Foundation',
  'community-foundation',
  'foundation',
  'Philanthropic foundation funding local nonprofits, schools, and civic initiatives in Lafayette.',
  'https://www.lafayettecommunityfoundation.org/',
  'Lafayette, CA',
  '{"source": "seed"}'::jsonb
),
(
  'Vibrant Lafayette',
  'vibrant-lafayette',
  'civic',
  'Community group focused on a more walkable, bikeable, and connected Lafayette.',
  NULL,
  'Lafayette, CA',
  '{"source": "seed"}'::jsonb
),
(
  'Sustainable Lafayette',
  'sustainable-lafayette',
  'civic',
  'Volunteer organization advancing environmental sustainability, climate action, and green practices in Lafayette.',
  'https://www.sustainablelafayette.org/',
  'Lafayette, CA',
  '{"source": "seed"}'::jsonb
)
ON CONFLICT (slug) DO NOTHING;
