import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { chunks, documents } from '../db/schema.js';
import type { Language, ParsedDocument } from './parse.js';

export type IndexDocumentArgs = {
  document: ParsedDocument;
  summary: string;
  contextualByChunkId: Map<string, string>;
  embeddingByChunkId: Map<string, number[]>;
};

export type IndexResult = { documentId: string; status: 'inserted' | 'replaced' | 'skipped'; chunkCount: number };

/**
 * Idempotent per ARCHITECTURE.md §13: if the document's content_md is
 * unchanged, leave existing rows alone. Otherwise replace the document row
 * and reinsert all chunks (chunks cascade-delete on document delete).
 *
 * tsv_pt and tsv_en are computed via to_tsvector() at insert time. The
 * embedding parameter is bound as a string literal and cast with ::vector
 * because pgvector's wire format is `[v1,v2,...]`.
 */
export async function indexDocument(args: IndexDocumentArgs): Promise<IndexResult> {
  const { document: doc, summary, contextualByChunkId, embeddingByChunkId } = args;

  const existing = await db
    .select({ contentMd: documents.contentMd })
    .from(documents)
    .where(eq(documents.id, doc.id))
    .limit(1);

  if (existing[0]?.contentMd === doc.contentMd) {
    return { documentId: doc.id, status: 'skipped', chunkCount: doc.chunks.length };
  }

  const isReplace = existing.length > 0;

  await db.transaction(async (tx) => {
    if (isReplace) {
      await tx.delete(documents).where(eq(documents.id, doc.id));
    }
    await tx.insert(documents).values({
      id: doc.id,
      filename: doc.filename,
      language: doc.language,
      title: doc.title,
      summary,
      contentMd: doc.contentMd,
    });

    for (const chunk of doc.chunks) {
      const contextual = contextualByChunkId.get(chunk.id);
      const embedding = embeddingByChunkId.get(chunk.id);
      if (contextual === undefined || embedding === undefined) {
        throw new Error(`missing contextual/embedding for chunk ${chunk.id}`);
      }
      const embeddingLiteral = `[${embedding.join(',')}]`;
      const tsvLang = tsvectorConfig(doc.language);
      const metadataJson = JSON.stringify(chunk.metadata);
      await tx.execute(sql`
        INSERT INTO chunks (
          id, document_id, chunk_index, content, contextual,
          embedding, tsv_pt, tsv_en, metadata
        ) VALUES (
          ${chunk.id},
          ${doc.id},
          ${chunk.chunkIndex},
          ${chunk.content},
          ${contextual},
          ${embeddingLiteral}::vector,
          ${tsvLang === 'pt' ? sql`to_tsvector('portuguese', ${contextual})` : sql`NULL`},
          ${tsvLang === 'en' ? sql`to_tsvector('english', ${contextual})` : sql`NULL`},
          ${metadataJson}::jsonb
        )
      `);
    }
  });

  return {
    documentId: doc.id,
    status: isReplace ? 'replaced' : 'inserted',
    chunkCount: doc.chunks.length,
  };
}

function tsvectorConfig(language: Language): 'pt' | 'en' | null {
  if (language === 'pt') return 'pt';
  if (language === 'en') return 'en';
  return null;
}
