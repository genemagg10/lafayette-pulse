-- Staging table for civic-graph entities mined from RAG text.
-- Idempotent: safe to re-run on databases that already have this table
-- (production was loaded from a first-batch extract before this file landed).
--
-- RLS: enabled, no policies. anon/authenticated cannot read or write.
-- service_role bypasses RLS and is used by extract-civic-graph.py.

CREATE TABLE IF NOT EXISTS civic_graph_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL,
  payload          JSONB NOT NULL,
  confidence       DOUBLE PRECISION,
  source_table     TEXT,
  source_id        BIGINT,
  source_chunk_id  BIGINT,
  status           TEXT NOT NULL DEFAULT 'pending',
  dedupe_key       TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT civic_graph_proposals_kind_check
    CHECK (kind = ANY (ARRAY[
      'person'::text,
      'organization'::text,
      'membership'::text,
      'seat'::text,
      'seat_holder'::text,
      'candidacy'::text
    ])),
  CONSTRAINT civic_graph_proposals_status_check
    CHECK (status = ANY (ARRAY[
      'pending'::text,
      'accepted'::text,
      'rejected'::text,
      'merged'::text
    ]))
);

ALTER TABLE civic_graph_proposals
  ADD COLUMN IF NOT EXISTS kind TEXT,
  ADD COLUMN IF NOT EXISTS payload JSONB,
  ADD COLUMN IF NOT EXISTS confidence DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS source_table TEXT,
  ADD COLUMN IF NOT EXISTS source_id BIGINT,
  ADD COLUMN IF NOT EXISTS source_chunk_id BIGINT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

-- Tighten nullability / defaults if a prior partial table exists.
DO $$
BEGIN
  ALTER TABLE civic_graph_proposals ALTER COLUMN kind SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE civic_graph_proposals ALTER COLUMN payload SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE civic_graph_proposals ALTER COLUMN status SET DEFAULT 'pending';
  ALTER TABLE civic_graph_proposals ALTER COLUMN status SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE civic_graph_proposals ALTER COLUMN created_at SET DEFAULT NOW();
  ALTER TABLE civic_graph_proposals ALTER COLUMN created_at SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'civic_graph_proposals_kind_check'
      AND conrelid = 'public.civic_graph_proposals'::regclass
  ) THEN
    ALTER TABLE civic_graph_proposals
      ADD CONSTRAINT civic_graph_proposals_kind_check
      CHECK (kind = ANY (ARRAY[
        'person'::text,
        'organization'::text,
        'membership'::text,
        'seat'::text,
        'seat_holder'::text,
        'candidacy'::text
      ]));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'civic_graph_proposals_status_check'
      AND conrelid = 'public.civic_graph_proposals'::regclass
  ) THEN
    ALTER TABLE civic_graph_proposals
      ADD CONSTRAINT civic_graph_proposals_status_check
      CHECK (status = ANY (ARRAY[
        'pending'::text,
        'accepted'::text,
        'rejected'::text,
        'merged'::text
      ]));
  END IF;
END $$;

-- document_chunks.id is BIGSERIAL (bigint); FK is optional if the table
-- is missing on a brand-new install that has not run 005 yet.
DO $$
BEGIN
  IF to_regclass('public.document_chunks') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'civic_graph_proposals_source_chunk_id_fkey'
         AND conrelid = 'public.civic_graph_proposals'::regclass
     ) THEN
    ALTER TABLE civic_graph_proposals
      ADD CONSTRAINT civic_graph_proposals_source_chunk_id_fkey
      FOREIGN KEY (source_chunk_id)
      REFERENCES document_chunks(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'civic_graph_proposals source_chunk_id FK not added: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_cgp_status ON civic_graph_proposals (status);
CREATE INDEX IF NOT EXISTS idx_cgp_kind   ON civic_graph_proposals (kind);
CREATE INDEX IF NOT EXISTS idx_cgp_dedupe ON civic_graph_proposals (dedupe_key);

ALTER TABLE civic_graph_proposals ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon or authenticated.
-- Writes and reads go through service_role (bypasses RLS).
