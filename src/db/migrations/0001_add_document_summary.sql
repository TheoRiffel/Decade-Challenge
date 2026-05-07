-- ARCHITECTURE.md §7: documents.summary used by the list_documents tool.
-- Generated once at ingestion time by Haiku (1–2 sentence per-doc summary).

ALTER TABLE documents ADD COLUMN summary TEXT;
