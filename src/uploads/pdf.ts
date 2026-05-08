import { extractText } from 'unpdf';
import { FileParseError } from './parse.js';

export type PdfParseResult = {
  text: string;
  pageCount: number;
};

export async function parsePdf(bytes: Uint8Array): Promise<PdfParseResult> {
  try {
    const { text, totalPages } = await extractText(bytes, { mergePages: true });
    if (!text || text.trim().length === 0) {
      throw new FileParseError(
        'PDF contains no extractable text (possibly scanned or image-only)',
        'extraction_failed',
      );
    }
    return { text, pageCount: totalPages };
  } catch (err) {
    if (err instanceof FileParseError) throw err;
    throw new FileParseError(
      `PDF extraction failed: ${err instanceof Error ? err.message : String(err)}`,
      'corrupted',
      err,
    );
  }
}
