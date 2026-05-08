-- Initial schema. Mirrors ARCHITECTURE.md §6.
-- Embedding dimensions = 1024 to match BAAI/bge-m3 (the v1 default embedder).
-- Within pgvector's 2000-dim HNSW cap on the `vector` type, so the HNSW
-- index below works without halfvec. If the embedder is swapped to a model
-- with > 2000 dims, switch the column to `halfvec(N)` and the op class to
-- `halfvec_cosine_ops`.

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
  embedding     VECTOR(1024) NOT NULL,
  tsv_pt        TSVECTOR,
  tsv_en        TSVECTOR,
  metadata      JSONB
);

CREATE INDEX chunks_embedding_idx ON chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_tsv_pt_idx ON chunks USING gin (tsv_pt);
CREATE INDEX chunks_tsv_en_idx ON chunks USING gin (tsv_en);
