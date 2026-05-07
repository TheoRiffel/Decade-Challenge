import { z } from 'zod';

export const listDocumentsDescription =
  'List all available conviction documents with their titles and one-line ' +
  'summaries. Use to orient yourself on what topics Decade has convictions ' +
  'about, especially when you suspect a topic may be out of scope.';

export const listDocumentsInputSchema = z.object({
  topic_filter: z
    .string()
    .optional()
    .describe('Optional keyword filter applied to titles and summaries.'),
});

export type ListDocumentsInput = z.infer<typeof listDocumentsInputSchema>;

export type ListDocumentsEntry = {
  id: string;
  title: string | null;
  language: string;
  summary: string | null;
};

export async function executeListDocuments(
  _input: ListDocumentsInput,
): Promise<ListDocumentsEntry[]> {
  throw new Error('not implemented');
}
