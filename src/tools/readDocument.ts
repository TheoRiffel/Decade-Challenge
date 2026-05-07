import { z } from 'zod';

export const readDocumentDescription =
  'Read the full content of a specific conviction document. Use when search ' +
  'results are too fragmented to answer well, or when you need broader ' +
  'context than chunks provide.';

export const readDocumentInputSchema = z.object({
  document_id: z.string(),
});

export type ReadDocumentInput = z.infer<typeof readDocumentInputSchema>;

export type ReadDocumentSuccess = {
  id: string;
  title: string | null;
  language: string;
  content: string;
};

export type ReadDocumentError = { error: string };

export type ReadDocumentResult = ReadDocumentSuccess | ReadDocumentError;

export async function executeReadDocument(
  _input: ReadDocumentInput,
): Promise<ReadDocumentResult> {
  throw new Error('not implemented');
}
