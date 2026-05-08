import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export type DenseHit = {
  chunkId: string;
  documentId: string;
  score: number;
};

export type DenseSearchArgs = {
  embedding: number[];
  topK: number;
};

/**
 * pgvector cosine similarity. The `<=>` operator returns cosine distance
 * (lower = closer); we surface 1 − distance as `score` so callers don't have
 * to invert. Sorted descending by score.
 */
export async function denseSearch(args: DenseSearchArgs): Promise<DenseHit[]> {
  if (args.embedding.length === 0 || args.topK <= 0) return [];
  const literal = `[${args.embedding.join(',')}]`;
  const rows = await db.execute<{
    id: string;
    document_id: string;
    score: string;
  }>(sql`
    SELECT
      id,
      document_id,
      (1 - (embedding <=> ${literal}::vector))::text AS score
    FROM chunks
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${args.topK}
  `);
  return rows.map((r) => ({
    chunkId: r.id,
    documentId: r.document_id,
    score: Number(r.score),
  }));
}
