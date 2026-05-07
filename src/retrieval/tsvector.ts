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

export async function sparseSearch(
  _args: SparseSearchArgs,
): Promise<SparseHit[]> {
  throw new Error('not implemented');
}
