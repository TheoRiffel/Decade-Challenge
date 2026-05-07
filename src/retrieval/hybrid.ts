import type { LanguageHint } from './tsvector.js';
import type { DenseHit } from './pgvector.js';
import type { SparseHit } from './tsvector.js';

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

export function reciprocalRankFusion(_args: RrfArgs): FusedHit[] {
  throw new Error('not implemented');
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

export async function hybridRetrieve(
  _args: HybridRetrieveArgs,
): Promise<HybridChunk[]> {
  throw new Error('not implemented');
}
