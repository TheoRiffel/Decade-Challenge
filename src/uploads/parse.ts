/** Raw file as received from a multipart request. */
export type UploadedFile = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

/**
 * Text-only result of parsing a file.
 * pageCount/sheetCount are for observability; parsers populate them when
 * knowable without extra work. OCR / vision rendering is out of scope.
 */
export type ParsedContent = {
  text: string;
  truncated: boolean;
  pageCount?: number;
  sheetCount?: number;
};

/**
 * Thrown by parsers on failure. The session layer catches this and converts
 * it to a graceful tool result; callers should not swallow it silently.
 *
 * 'too_large' from AnthropicNativeFileParser triggers fallback to
 * LocalFileParser in the factory (sub-step 4).
 */
export class FileParseError extends Error {
  constructor(
    message: string,
    public readonly reason:
      | 'unsupported_format'
      | 'corrupted'
      | 'too_large'
      | 'extraction_failed',
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'FileParseError';
  }
}

/**
 * Strategy interface for file parsing.
 *
 * Implementations:
 *   LocalFileParser          — unpdf (PDF) + SheetJS (Excel), in-process
 *   AnthropicNativeFileParser — Anthropic Files API (PDF), SheetJS fallback
 *
 * canParse receives the full UploadedFile so parsers can sniff filename
 * extensions when MIME types are ambiguous (e.g., .xlsx arriving as
 * application/zip or application/octet-stream).
 *
 * Selected once at startup via config; injected everywhere else.
 * ParsedContent never crosses into the session or tool layer — those layers
 * read ParsedUpload (flat: filename, mimeType, content: string, truncated).
 */
export interface FileParser {
  canParse(file: UploadedFile): boolean;
  parse(file: UploadedFile): Promise<ParsedContent>;
}
