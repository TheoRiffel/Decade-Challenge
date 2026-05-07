import type { Language } from '../pipeline/detectLanguage.js';

export type ParsedDocument = {
  id: string;
  filename: string;
  title: string | null;
  language: Language;
  contentMd: string;
  chunks: ParsedChunk[];
};

export type ParsedChunk = {
  id: string;
  chunkIndex: number;
  content: string;
  metadata: {
    headings: string[];
    section?: string;
  };
};

export async function parseMarkdown(
  _filename: string,
  _markdown: string,
): Promise<ParsedDocument> {
  throw new Error('not implemented');
}
