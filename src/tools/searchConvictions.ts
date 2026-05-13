import { z } from 'zod';
import { reranker } from '../config.js';
import { tool } from '../providers/llm.js';
import { hybridRetrieve } from '../retrieval/hybrid.js';

export const searchConvictionsDescription =
  "Search Decade's conviction documents using hybrid (semantic + keyword) " +
  'retrieval. Returns the most relevant chunks with document IDs and ' +
  'snippets. Use this whenever the user asks an investment question; you ' +
  'may call multiple times with refined queries.';

export const searchConvictionsInputSchema = z.object({
  query: z
    .string()
    .describe(
      'Search query. Be specific and use the same language as the user.',
    ),
  language_hint: z
    .enum(['pt', 'en', 'auto'])
    .default('auto')
    .describe('Hint to bias toward Portuguese or English documents.'),
  top_k: z.number().int().min(1).max(20).default(8),
});

export type SearchConvictionsInput = z.infer<
  typeof searchConvictionsInputSchema
>;

export type SearchConvictionsHit = {
  document_id: string;
  chunk_id: string;
  content: string;
  score: number;
};

const CANDIDATE_POOL_SIZE = 30;

export const searchConvictionsTool = tool({
  description: searchConvictionsDescription,
  parameters: searchConvictionsInputSchema,
  execute: async ({
    query,
    language_hint,
    top_k,
  }): Promise<SearchConvictionsHit[] | { error: string }> => {
    try {
      const candidates = await hybridRetrieve({
        query,
        languageHint: language_hint,
        topK: CANDIDATE_POOL_SIZE,
      });
      if (candidates.length === 0) return [];

      const ranked = await reranker.rerank(
        query,
        candidates.map((c) => c.content),
        top_k,
      );

      return ranked.map((r) => {
        const chunk = candidates[r.index];
        if (!chunk) {
          throw new Error(
            `reranker returned out-of-range index ${r.index} (pool=${candidates.length})`,
          );
        }
        return {
          document_id: chunk.documentId,
          chunk_id: chunk.chunkId,
          content: chunk.content,
          score: r.score,
        };
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: `search_convictions failed: ${message}` };
    }
  },
});
