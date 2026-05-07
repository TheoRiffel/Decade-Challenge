-- Initial schema. Mirrors ARCHITECTURE.md §6 verbatim.
-- NOTE: pgvector's HNSW currently caps at 2000 dims for `vector` (4000 for `halfvec`).
-- The 3072-dim embedding column is created here as specified, but the HNSW index
-- below will fail on pgvector ≤0.8 with VECTOR(3072). If that happens, the
-- documented swap is `halfvec(3072)` — flagged as a deviation in README.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE documents (
  id            TEXT PRIMARY KEY,
  filename      TEXT NOT NULL,
  language      TEXT NOT NULL,
  title         TEXT,
  content_md    TEXT NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chunks (
  id            TEXT PRIMARY KEY,
  document_id   TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index   INT NOT NULL,
  content       TEXT NOT NULL,
  contextual    TEXT NOT NULL,
  embedding     VECTOR(3072),
  tsv_pt        TSVECTOR,
  tsv_en        TSVECTOR,
  metadata      JSONB
);

CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_tsv_pt_idx ON chunks USING gin (tsv_pt);
CREATE INDEX chunks_tsv_en_idx ON chunks USING gin (tsv_en);
