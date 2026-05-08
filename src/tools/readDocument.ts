import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/index.js';
import { documents } from '../db/schema.js';
import { tool } from '../providers/llm.js';

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

export const readDocumentTool = tool({
  description: readDocumentDescription,
  parameters: readDocumentInputSchema,
  execute: async ({ document_id }): Promise<ReadDocumentResult> => {
    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        language: documents.language,
        content: documents.contentMd,
      })
      .from(documents)
      .where(eq(documents.id, document_id))
      .limit(1);
    const row = rows[0];
    if (!row) return { error: `Document ${document_id} not found.` };
    return row;
  },
});
