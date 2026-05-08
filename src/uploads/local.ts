import { FileParseError, type FileParser, type ParsedContent, type UploadedFile } from './parse.js';
import { parsePdf } from './pdf.js';
import { parseXlsx } from './xlsx.js';

/** ~50 K tokens at ~4 chars/token. Shared with AnthropicNativeFileParser. */
export const UPLOAD_MAX_CHARS = 200_000;

const PDF_MIME = 'application/pdf';
const XLSX_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  // .xlsx files sometimes arrive mislabelled
  'application/zip',
  'application/octet-stream',
]);
const XLSX_EXTS = new Set(['.xlsx', '.xls']);

function isPdf(file: UploadedFile): boolean {
  return file.mimeType === PDF_MIME || file.filename.toLowerCase().endsWith('.pdf');
}

function isXlsx(file: UploadedFile): boolean {
  if (XLSX_MIMES.has(file.mimeType)) return true;
  const lower = file.filename.toLowerCase();
  return XLSX_EXTS.has(lower.slice(lower.lastIndexOf('.')));
}

export function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= UPLOAD_MAX_CHARS) return { text, truncated: false };
  return {
    text: text.slice(0, UPLOAD_MAX_CHARS) + '\n\n[Content truncated — file exceeded the 50 K-token limit.]',
    truncated: true,
  };
}

/**
 * In-process parser: unpdf for PDFs, SheetJS for Excel.
 * No network calls; no external dependencies at runtime.
 */
export class LocalFileParser implements FileParser {
  canParse(file: UploadedFile): boolean {
    return isPdf(file) || isXlsx(file);
  }

  async parse(file: UploadedFile): Promise<ParsedContent> {
    if (isPdf(file)) {
      const { text, pageCount } = await parsePdf(file.bytes);
      const { text: finalText, truncated } = truncate(text);
      return { text: finalText, truncated, pageCount };
    }

    if (isXlsx(file)) {
      const { text, sheetCount } = parseXlsx(file.bytes);
      const { text: finalText, truncated } = truncate(text);
      return { text: finalText, truncated, sheetCount };
    }

    throw new FileParseError(
      `Unsupported file type: ${file.mimeType} (${file.filename})`,
      'unsupported_format',
    );
  }
}
