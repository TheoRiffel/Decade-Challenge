import { eq, inArray } from 'drizzle-orm';
import { config, embeddings } from '../config.js';
import { db } from '../db/index.js';
import { chunks as chunksTable, documents as documentsTable } from '../db/schema.js';
import { denseSearch, type DenseHit } from './pgvector.js';
import { sparseSearch, type LanguageHint, type SparseHit } from './tsvector.js';

export type FusedHit = {
  chunkId: string;
  documentId: string;
  rrfScore: number;
};

export type RrfArgs = {
  dense: DenseHit[];
  sparse: SparseHit[];
  k: number;
  topK: number;
};

/**
 * Reciprocal Rank Fusion (Cormack et al., 2009). Each hit list contributes
 * 1 / (k + rank) where rank is 1-indexed. Equal-weight fusion of dense and
 * sparse rankings — the standard hybrid-retrieval baseline.
 */
export function reciprocalRankFusion(args: RrfArgs): FusedHit[] {
  const scores = new Map<string, FusedHit>();

  const accumulate = (hits: { chunkId: string; documentId: string }[]) => {
    hits.forEach((h, i) => {
      const contrib = 1 / (args.k + (i + 1));
      const cur = scores.get(h.chunkId);
      if (cur) {
        cur.rrfScore += contrib;
      } else {
        scores.set(h.chunkId, {
          chunkId: h.chunkId,
          documentId: h.documentId,
          rrfScore: contrib,
        });
      }
    });
  };

  accumulate(args.dense);
  accumulate(args.sparse);

  return [...scores.values()]
    .sort((a, b) => b.rrfScore - a.rrfScore)
    .slice(0, args.topK);
}

export type HybridRetrieveArgs = {
  query: string;
  languageHint: LanguageHint;
  topK: number;
};

export type HybridChunk = {
  chunkId: string;
  documentId: string;
  filename: string;
  content: string;
  score: number;
};

/**
 * The candidate-pool retriever consumed by the search_convictions tool.
 * Returns a content-hydrated, RRF-ordered list of chunks. The reranker
 * runs in the tool layer (ARCHITECTURE.md §14.5), not here.
 */
export async function hybridRetrieve(
  args: HybridRetrieveArgs,
): Promise<HybridChunk[]> {
  if (args.query.trim().length === 0 || args.topK <= 0) return [];

  const [queryEmbedding] = await embeddings.embedMany([args.query]);
  if (!queryEmbedding) {
    throw new Error('hybridRetrieve: failed to embed query');
  }

  const [dense, sparse] = await Promise.all([
    denseSearch({ embedding: queryEmbedding, topK: config.retrieval.denseK }),
    sparseSearch({
      query: args.query,
      languageHint: args.languageHint,
      topK: config.retrieval.sparseK,
    }),
  ]);

  const fused = reciprocalRankFusion({
    dense,
    sparse,
    k: config.retrieval.fusionK,
    topK: args.topK,
  });

  if (fused.length === 0) return [];

  const ids = fused.map((f) => f.chunkId);
  const rows = await db
    .select({
      id: chunksTable.id,
      documentId: chunksTable.documentId,
      content: chunksTable.content,
      filename: documentsTable.filename,
    })
    .from(chunksTable)
    .innerJoin(documentsTable, eq(documentsTable.id, chunksTable.documentId))
    .where(inArray(chunksTable.id, ids));

  const byId = new Map<
    string,
    { documentId: string; content: string; filename: string }
  >();
  for (const r of rows) {
    byId.set(r.id, {
      documentId: r.documentId,
      content: r.content,
      filename: r.filename,
    });
  }

  const out: HybridChunk[] = [];
  for (const f of fused) {
    const row = byId.get(f.chunkId);
    if (!row) continue;
    out.push({
      chunkId: f.chunkId,
      documentId: row.documentId,
      filename: row.filename,
      content: row.content,
      score: f.rrfScore,
    });
  }
  return out;
}
