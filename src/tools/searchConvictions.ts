import { z } from 'zod';

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

export async function executeSearchConvictions(
  _input: SearchConvictionsInput,
): Promise<SearchConvictionsHit[]> {
  throw new Error('not implemented');
}
