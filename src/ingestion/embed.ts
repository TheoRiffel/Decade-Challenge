import type { EmbeddingProvider } from '../providers/embeddings.js';

export type EmbedBatchArgs = {
  embeddings: EmbeddingProvider;
  texts: string[];
  batchSize?: number;
};

/**
 * OpenAI's embeddings endpoint accepts batched inputs but enforces per-request
 * token caps. We chunk into safe batches; the provider's embedMany returns one
 * vector per input.
 */
export async function embedBatch(args: EmbedBatchArgs): Promise<number[][]> {
  const { embeddings, texts } = args;
  const batchSize = args.batchSize ?? 64;
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const vecs = await embeddings.embedMany(batch);
    out.push(...vecs);
  }
  return out;
}
