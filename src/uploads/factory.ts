import type { LLMProvider } from '../providers/llm.js';
import { AnthropicNativeFileParser } from './anthropic.js';
import { LocalFileParser } from './local.js';
import { FileParseError, type FileParser, type ParsedContent, type UploadedFile } from './parse.js';

/**
 * Builds the FileParser selected by config.uploads.parser.
 *
 * 'local'     — LocalFileParser only (unpdf + SheetJS, no API calls).
 * 'anthropic' — AnthropicNativeFileParser for PDFs, with automatic fallback
 *               to LocalFileParser when Anthropic rejects the file as too
 *               large (>32 MB / >100 pages). Excel always goes to local.
 *
 * Called once at startup via config.ts; the result is injected everywhere else.
 */
export function createFileParser(parserType: 'local' | 'anthropic', llm: LLMProvider): FileParser {
  if (parserType === 'local') {
    return new LocalFileParser();
  }

  const anthropic = new AnthropicNativeFileParser(llm);
  const local = new LocalFileParser();

  return {
    canParse(file: UploadedFile): boolean {
      return anthropic.canParse(file);
    },

    async parse(file: UploadedFile): Promise<ParsedContent> {
      try {
        return await anthropic.parse(file);
      } catch (err) {
        if (err instanceof FileParseError && err.reason === 'too_large') {
          return local.parse(file);
        }
        throw err;
      }
    },
  };
}
