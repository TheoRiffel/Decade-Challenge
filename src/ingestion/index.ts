import type { ParsedDocument } from './parse.js';

export type IndexDocumentArgs = {
  document: ParsedDocument;
  contextualByChunkId: Map<string, string>;
  embeddingByChunkId: Map<string, number[]>;
};

export async function indexDocument(_args: IndexDocumentArgs): Promise<void> {
  throw new Error('not implemented');
}
