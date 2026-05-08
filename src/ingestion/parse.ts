import { detectLanguage as detectLanguageShared, type Language } from '../lib/language.js';

export type { Language };

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

/**
 * Per ARCHITECTURE.md §13: chunk by H2/H3 with a sliding-window fallback for
 * sections that overflow. Targets ~600 tokens (~2400 chars), max ~800 tokens
 * (~3200 chars) at ~4 chars/token.
 */
const CHUNK_MAX_CHARS = 3200;
const CHUNK_OVERLAP_CHARS = 400;

type Section = { headings: string[]; content: string };

export async function parseMarkdown(
  filename: string,
  markdown: string,
): Promise<ParsedDocument> {
  const id = documentIdFromFilename(filename);
  const title = extractTitle(markdown);
  const language = detectLanguage(markdown);
  const sections = splitIntoSections(markdown);
  const chunks = chunkSections(sections, id);
  return { id, filename, title, language, contentMd: markdown, chunks };
}

export function documentIdFromFilename(filename: string): string {
  return filename.replace(/\.md$/i, '');
}

function extractTitle(md: string): string | null {
  for (const line of md.split('\n')) {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      return line.slice(2).trim() || null;
    }
  }
  return null;
}

function detectLanguage(md: string): Language {
  return detectLanguageShared(md);
}

function splitIntoSections(md: string): Section[] {
  const lines = md.split('\n');
  const sections: Section[] = [];
  const stack: { level: number; text: string }[] = [];
  let buffer: string[] = [];

  const flush = () => {
    const content = buffer.join('\n').trim();
    if (content.length > 0) {
      sections.push({ headings: stack.map((s) => s.text), content });
    }
    buffer = [];
  };

  for (const line of lines) {
    if (line.startsWith('## ') && !line.startsWith('### ')) {
      flush();
      while ((stack[stack.length - 1]?.level ?? 0) >= 2) stack.pop();
      stack.push({ level: 2, text: line.slice(3).trim() });
      buffer.push(line);
    } else if (line.startsWith('### ') && !line.startsWith('#### ')) {
      flush();
      while ((stack[stack.length - 1]?.level ?? 0) >= 3) stack.pop();
      stack.push({ level: 3, text: line.slice(4).trim() });
      buffer.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

function chunkSections(sections: Section[], docId: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  for (const section of sections) {
    if (section.content.length <= CHUNK_MAX_CHARS) {
      chunks.push(makeChunk(section, docId, chunks.length));
      continue;
    }
    let start = 0;
    while (start < section.content.length) {
      const end = Math.min(start + CHUNK_MAX_CHARS, section.content.length);
      chunks.push(
        makeChunk(
          { headings: section.headings, content: section.content.slice(start, end) },
          docId,
          chunks.length,
        ),
      );
      if (end >= section.content.length) break;
      start = end - CHUNK_OVERLAP_CHARS;
    }
  }
  return chunks;
}

function makeChunk(section: Section, docId: string, index: number): ParsedChunk {
  const headings = [...section.headings];
  const sectionPath = headings.length > 0 ? headings.join(' > ') : null;
  const metadata: ParsedChunk['metadata'] =
    sectionPath !== null ? { headings, section: sectionPath } : { headings };
  return {
    id: `${docId}__${index.toString().padStart(3, '0')}`,
    chunkIndex: index,
    content: section.content,
    metadata,
  };
}
