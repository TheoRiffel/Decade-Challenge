import { generateText, type LLMProvider } from '../providers/llm.js';
import { FileParseError, type FileParser, type ParsedContent, type UploadedFile } from './parse.js';
import { LocalFileParser, truncate } from './local.js';

/** Anthropic's documented limit for the native PDF document block. */
const ANTHROPIC_PDF_MAX_BYTES = 32 * 1024 * 1024;

const EXTRACT_PROMPT =
  'Extract all text content from this PDF. Return the raw text preserving ' +
  'logical reading order, headings, and table structure. Output only the ' +
  'extracted text — no commentary, no preamble.';

/**
 * Sends PDFs to Anthropic's native document understanding (FilePart, type
 * 'file'). Excel falls back to LocalFileParser since SheetJS in-process
 * parsing is strictly better for structured spreadsheet data.
 *
 * Throws FileParseError('too_large') when the PDF exceeds Anthropic's 32 MB
 * or 100-page cap. The factory in config catches this and retries with
 * LocalFileParser.
 */
export class AnthropicNativeFileParser implements FileParser {
  private readonly localFallback = new LocalFileParser();

  constructor(private readonly llm: LLMProvider) {}

  canParse(file: UploadedFile): boolean {
    return this.localFallback.canParse(file);
  }

  async parse(file: UploadedFile): Promise<ParsedContent> {
    const isPdf =
      file.mimeType === 'application/pdf' ||
      file.filename.toLowerCase().endsWith('.pdf');

    return isPdf ? this.parsePdfNative(file) : this.localFallback.parse(file);
  }

  private async parsePdfNative(file: UploadedFile): Promise<ParsedContent> {
    if (file.bytes.length > ANTHROPIC_PDF_MAX_BYTES) {
      const mb = (file.bytes.length / 1024 / 1024).toFixed(1);
      throw new FileParseError(
        `PDF is ${mb} MB — exceeds Anthropic's 32 MB native-parsing limit`,
        'too_large',
      );
    }

    let rawText: string;
    try {
      const result = await generateText({
        model: this.llm.classifierModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: file.bytes,
                mimeType: 'application/pdf',
              },
              { type: 'text', text: EXTRACT_PROMPT },
            ],
          },
        ],
      });
      rawText = result.text.trim();
    } catch (err) {
      if (err instanceof FileParseError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      // Surface Anthropic's own limit errors as too_large so the factory
      // can fall back to LocalFileParser rather than hard-failing.
      if (/too large|exceeds|limit|100 page/i.test(msg)) {
        throw new FileParseError(
          `PDF rejected by Anthropic native parsing: ${msg}`,
          'too_large',
          err,
        );
      }
      throw new FileParseError(
        `Anthropic PDF extraction failed: ${msg}`,
        'extraction_failed',
        err,
      );
    }

    if (!rawText) {
      throw new FileParseError(
        'Anthropic returned empty text for PDF',
        'extraction_failed',
      );
    }

    const { text, truncated } = truncate(rawText);
    return { text, truncated };
  }
}
