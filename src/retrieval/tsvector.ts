import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

export type LanguageHint = 'pt' | 'en' | 'auto';

export type SparseHit = {
  chunkId: string;
  documentId: string;
  score: number;
};

export type SparseSearchArgs = {
  query: string;
  languageHint: LanguageHint;
  topK: number;
};

/**
 * Postgres tsvector search via ts_rank_cd. Per ARCHITECTURE.md §14.3:
 * - 'pt' → tsv_pt with the portuguese config
 * - 'en' → tsv_en with the english config
 * - 'auto' → both, then take max per chunk so a doc that hits in either
 *   language is preserved.
 *
 * `plainto_tsquery` is used because the query comes from the user / agent
 * and we don't want to expose tsquery operators directly.
 */
export async function sparseSearch(
  args: SparseSearchArgs,
): Promise<SparseHit[]> {
  const { query, languageHint, topK } = args;
  if (query.trim().length === 0 || topK <= 0) return [];

  if (languageHint === 'pt') return runSingle(query, 'pt', topK);
  if (languageHint === 'en') return runSingle(query, 'en', topK);

  const rows = await db.execute<{
    id: string;
    document_id: string;
    score: string;
  }>(sql`
    SELECT id, document_id, MAX(score)::text AS score
    FROM (
      SELECT id, document_id,
             ts_rank_cd(tsv_pt, plainto_tsquery('portuguese', ${query}), 32) AS score
      FROM chunks
      WHERE tsv_pt @@ plainto_tsquery('portuguese', ${query})
      UNION ALL
      SELECT id, document_id,
             ts_rank_cd(tsv_en, plainto_tsquery('english', ${query}), 32) AS score
      FROM chunks
      WHERE tsv_en @@ plainto_tsquery('english', ${query})
    ) AS u
    GROUP BY id, document_id
    ORDER BY MAX(score) DESC
    LIMIT ${topK}
  `);
  return rows.map((r) => ({
    chunkId: r.id,
    documentId: r.document_id,
    score: Number(r.score),
  }));
}

async function runSingle(
  query: string,
  language: 'pt' | 'en',
  topK: number,
): Promise<SparseHit[]> {
  const column = language === 'pt' ? sql`tsv_pt` : sql`tsv_en`;
  const config = language === 'pt' ? 'portuguese' : 'english';
  const rows = await db.execute<{
    id: string;
    document_id: string;
    score: string;
  }>(sql`
    SELECT id, document_id,
           ts_rank_cd(${column}, plainto_tsquery(${config}, ${query}), 32)::text AS score
    FROM chunks
    WHERE ${column} @@ plainto_tsquery(${config}, ${query})
    ORDER BY ts_rank_cd(${column}, plainto_tsquery(${config}, ${query}), 32) DESC
    LIMIT ${topK}
  `);
  return rows.map((r) => ({
    chunkId: r.id,
    documentId: r.document_id,
    score: Number(r.score),
  }));
}
