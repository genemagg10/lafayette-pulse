-- Enable pgvector for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- DOCUMENT CHUNKS (for RAG retrieval)
-- ============================================
CREATE TABLE document_chunks (
  id            BIGSERIAL PRIMARY KEY,
  content       TEXT NOT NULL,                    -- The chunk text
  embedding     vector(1536),                     -- OpenAI text-embedding-3-small
  -- Source metadata
  source_table  TEXT NOT NULL,                    -- 'projects', 'agenda_items', 'project_updates'
  source_id     BIGINT NOT NULL,                  -- ID in the source table
  -- Denormalized metadata for filtered search
  category      project_category,
  meeting_body  TEXT,
  meeting_date  DATE,
  project_title TEXT,
  source_url    TEXT,
  -- Timestamps
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint to prevent duplicate chunks per source record
CREATE UNIQUE INDEX idx_chunks_source_unique ON document_chunks(source_table, source_id);

-- Vector similarity search index (IVFFlat, cosine distance)
-- Note: IVFFlat requires the table to have some data before creating.
-- For initial setup with < 1000 rows, this index will be created later
-- or you can use HNSW which works on empty tables:
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING hnsw (embedding vector_cosine_ops);

-- Metadata indexes for filtered search
CREATE INDEX idx_chunks_category ON document_chunks(category);
CREATE INDEX idx_chunks_date ON document_chunks(meeting_date DESC);
CREATE INDEX idx_chunks_source_table ON document_chunks(source_table);

-- Full-text search on chunk content
CREATE INDEX idx_chunks_fts ON document_chunks
  USING GIN(to_tsvector('english', content));

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Public read access (matches existing pattern)
CREATE POLICY "Public read access" ON document_chunks FOR SELECT USING (true);

-- Service role write access (for embedding pipeline)
CREATE POLICY "Service write" ON document_chunks FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE TRIGGER trg_chunks_updated
  BEFORE UPDATE ON document_chunks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SIMILARITY SEARCH FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_count INT DEFAULT 10,
  filter_category project_category DEFAULT NULL,
  filter_body TEXT DEFAULT NULL,
  filter_after DATE DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  content TEXT,
  source_table TEXT,
  source_id BIGINT,
  category project_category,
  meeting_body TEXT,
  meeting_date DATE,
  project_title TEXT,
  source_url TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id, dc.content, dc.source_table, dc.source_id,
    dc.category, dc.meeting_body, dc.meeting_date,
    dc.project_title, dc.source_url,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  WHERE
    dc.embedding IS NOT NULL
    AND (filter_category IS NULL OR dc.category = filter_category)
    AND (filter_body IS NULL OR dc.meeting_body ILIKE '%' || filter_body || '%')
    AND (filter_after IS NULL OR dc.meeting_date >= filter_after)
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
