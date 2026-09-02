-- Stance schema (Phase 2 Part B).
-- Idempotent: safe to re-run. Does not seed production fights.
--
-- Live `measures` and `candidacies` tables already exist from
-- supabase/migrations/006_civic_graph.sql. This file adds `stances`
-- (attributed support/oppose/endorse on a subject) and extends
-- civic_graph_proposals.kind to allow staging `stance` and `measure`
-- (`candidacy` was already allowed in 008).
--
-- RLS: public SELECT only. No INSERT/UPDATE/DELETE policies for
-- anon or authenticated. service_role bypasses RLS and is used by
-- extract-stances.py / admin writes.
--
-- Do NOT infer stance from co-membership. Extraction is quote-backed
-- (supports/opposes/endorses, resolutions, attributed votes).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- ENUMS
-- ============================================
DO $$ BEGIN
  CREATE TYPE stance_polarity AS ENUM (
    'support',
    'oppose',
    'endorse',
    'neutral',
    'mixed'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE stance_subject_type AS ENUM (
    'measure',
    'candidacy',
    'project',
    'policy'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE stance_actor_type AS ENUM (
    'person',
    'organization'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- If a prior partial type exists, fill missing labels (PG 15+).
ALTER TYPE stance_polarity ADD VALUE IF NOT EXISTS 'support';
ALTER TYPE stance_polarity ADD VALUE IF NOT EXISTS 'oppose';
ALTER TYPE stance_polarity ADD VALUE IF NOT EXISTS 'endorse';
ALTER TYPE stance_polarity ADD VALUE IF NOT EXISTS 'neutral';
ALTER TYPE stance_polarity ADD VALUE IF NOT EXISTS 'mixed';

ALTER TYPE stance_subject_type ADD VALUE IF NOT EXISTS 'measure';
ALTER TYPE stance_subject_type ADD VALUE IF NOT EXISTS 'candidacy';
ALTER TYPE stance_subject_type ADD VALUE IF NOT EXISTS 'project';
ALTER TYPE stance_subject_type ADD VALUE IF NOT EXISTS 'policy';

ALTER TYPE stance_actor_type ADD VALUE IF NOT EXISTS 'person';
ALTER TYPE stance_actor_type ADD VALUE IF NOT EXISTS 'organization';

-- ============================================
-- STANCES
-- actor_id / subject_id are polymorphic (person|org, measure|candidacy|…).
-- projects.id is BIGINT (001), so project subjects use subject_label
-- (optional project id in metadata) rather than stuffing a bigint into uuid.
-- ============================================
CREATE TABLE IF NOT EXISTS stances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type       stance_actor_type NOT NULL,
  actor_id         UUID NOT NULL,
  subject_type     stance_subject_type NOT NULL,
  subject_id       UUID,
  subject_label    TEXT,
  polarity         stance_polarity NOT NULL,
  confidence       REAL NOT NULL,
  evidence_quote   TEXT,
  source_url       TEXT,
  source_chunk_id  BIGINT,
  as_of            DATE,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE stances ADD COLUMN IF NOT EXISTS actor_type stance_actor_type;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS subject_type stance_subject_type;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS subject_id UUID;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS subject_label TEXT;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS polarity stance_polarity;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS confidence REAL;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS evidence_quote TEXT;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS source_chunk_id BIGINT;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS as_of DATE;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE stances ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE stances ALTER COLUMN actor_type SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE stances ALTER COLUMN actor_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE stances ALTER COLUMN subject_type SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE stances ALTER COLUMN polarity SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE stances ALTER COLUMN confidence SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE stances ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
  ALTER TABLE stances ALTER COLUMN metadata SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE stances ALTER COLUMN created_at SET DEFAULT NOW();
  ALTER TABLE stances ALTER COLUMN created_at SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE stances ALTER COLUMN updated_at SET DEFAULT NOW();
  ALTER TABLE stances ALTER COLUMN updated_at SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stances_confidence_range'
      AND conrelid = 'public.stances'::regclass
  ) THEN
    ALTER TABLE stances
      ADD CONSTRAINT stances_confidence_range
      CHECK (confidence >= 0 AND confidence <= 1);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stances_subject_present'
      AND conrelid = 'public.stances'::regclass
  ) THEN
    ALTER TABLE stances
      ADD CONSTRAINT stances_subject_present
      CHECK (
        subject_id IS NOT NULL
        OR (subject_label IS NOT NULL AND length(btrim(subject_label)) > 0)
      );
  END IF;
END $$;

-- Dedupe: same actor, subject, polarity, and source. subject_id wins
-- over label when both are present.
CREATE UNIQUE INDEX IF NOT EXISTS idx_stances_dedupe ON stances (
  actor_type,
  actor_id,
  subject_type,
  (COALESCE(subject_id::text, lower(subject_label))),
  polarity,
  (COALESCE(source_url, ''))
);

-- Measure-centric lookups (Phase 2 viz will group by subject).
CREATE INDEX IF NOT EXISTS idx_stances_subject
  ON stances (subject_type, subject_id);

CREATE INDEX IF NOT EXISTS idx_stances_subject_measure
  ON stances (subject_id, polarity)
  WHERE subject_type = 'measure';

CREATE INDEX IF NOT EXISTS idx_stances_subject_label
  ON stances (subject_type, lower(subject_label))
  WHERE subject_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_stances_actor
  ON stances (actor_type, actor_id);

CREATE INDEX IF NOT EXISTS idx_stances_polarity
  ON stances (subject_type, polarity);

CREATE INDEX IF NOT EXISTS idx_stances_as_of
  ON stances (as_of DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_stances_chunk
  ON stances (source_chunk_id)
  WHERE source_chunk_id IS NOT NULL;

-- Optional FK to RAG chunks (bigint PK in 005). Skip if chunks missing.
DO $$
BEGIN
  IF to_regclass('public.document_chunks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'stances_source_chunk_id_fkey'
         AND conrelid = 'public.stances'::regclass
     ) THEN
    ALTER TABLE stances
      ADD CONSTRAINT stances_source_chunk_id_fkey
      FOREIGN KEY (source_chunk_id)
      REFERENCES document_chunks(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'stances source_chunk_id FK not added: %', SQLERRM;
END $$;

DROP TRIGGER IF EXISTS trg_stances_updated ON stances;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE proname = 'update_updated_at'
  ) THEN
    CREATE TRIGGER trg_stances_updated
      BEFORE UPDATE ON stances
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

ALTER TABLE stances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON stances;
CREATE POLICY "Public read access" ON stances FOR SELECT USING (true);

-- No INSERT/UPDATE/DELETE policies for anon or authenticated.
-- Writes go through service_role (bypasses RLS).

-- ============================================
-- civic_graph_proposals.kind: add stance + measure
-- candidacy is already allowed by 008; recreate the CHECK so a
-- database that still has the 008 list picks up the new kinds.
-- ============================================
DO $$
BEGIN
  IF to_regclass('public.civic_graph_proposals') IS NULL THEN
    RAISE NOTICE 'civic_graph_proposals missing; skip kind check (run 008)';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'civic_graph_proposals_kind_check'
      AND conrelid = 'public.civic_graph_proposals'::regclass
  ) THEN
    ALTER TABLE civic_graph_proposals
      DROP CONSTRAINT civic_graph_proposals_kind_check;
  END IF;

  ALTER TABLE civic_graph_proposals
    ADD CONSTRAINT civic_graph_proposals_kind_check
    CHECK (kind = ANY (ARRAY[
      'person'::text,
      'organization'::text,
      'membership'::text,
      'seat'::text,
      'seat_holder'::text,
      'candidacy'::text,
      'stance'::text,
      'measure'::text
    ]));
END $$;
