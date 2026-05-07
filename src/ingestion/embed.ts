import type { EmbeddingProvider } from '../providers/embeddings.js';

export type EmbedBatchArgs = {
  embeddings: EmbeddingProvider;
  texts: string[];
};

export async function embedBatch(
  _args: EmbedBatchArgs,
): Promise<number[][]> {
  throw new Error('not implemented');
}
