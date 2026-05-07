import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  vector,
  customType,
  index,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

export const documents = pgTable('documents', {
  id: text('id').primaryKey(),
  filename: text('filename').notNull(),
  language: text('language').notNull(),
  title: text('title'),
  contentMd: text('content_md').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`NOW()`),
});

export const chunks = pgTable(
  'chunks',
  {
    id: text('id').primaryKey(),
    documentId: text('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    contextual: text('contextual').notNull(),
    embedding: vector('embedding', { dimensions: 3072 }),
    tsvPt: tsvector('tsv_pt'),
    tsvEn: tsvector('tsv_en'),
    metadata: jsonb('metadata'),
  },
  (table) => [
    index('chunks_embedding_idx').using(
      'hnsw',
      table.embedding.op('vector_cosine_ops'),
    ),
    index('chunks_tsv_pt_idx').using('gin', table.tsvPt),
    index('chunks_tsv_en_idx').using('gin', table.tsvEn),
  ],
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
