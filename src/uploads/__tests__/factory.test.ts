import { describe, expect, it, vi } from 'vitest';
import { createFileParser } from '../factory.js';
import { FileParseError } from '../parse.js';
import type { LLMProvider } from '../../providers/llm.js';

// Stub LLMProvider — factory tests don't exercise the Anthropic API path
const stubLlm = {} as LLMProvider;

function pdfFile(): import('../parse.js').UploadedFile {
  return { filename: 'report.pdf', mimeType: 'application/pdf', bytes: new Uint8Array(4) };
}

function xlsxFile(): import('../parse.js').UploadedFile {
  return {
    filename: 'data.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: new Uint8Array(4),
  };
}

describe('createFileParser — local', () => {
  it('canParse returns true for PDF', () => {
    const parser = createFileParser('local', stubLlm);
    expect(parser.canParse(pdfFile())).toBe(true);
  });

  it('canParse returns true for XLSX', () => {
    const parser = createFileParser('local', stubLlm);
    expect(parser.canParse(xlsxFile())).toBe(true);
  });
});

describe('createFileParser — anthropic', () => {
  it('canParse delegates to AnthropicNativeFileParser (same formats as local)', () => {
    const parser = createFileParser('anthropic', stubLlm);
    expect(parser.canParse(pdfFile())).toBe(true);
    expect(parser.canParse(xlsxFile())).toBe(true);
  });

  it('falls back to LocalFileParser when Anthropic throws too_large', async () => {
    // Mock AnthropicNativeFileParser to throw too_large, then verify the
    // factory wrapper catches it and retries with LocalFileParser.
    const { AnthropicNativeFileParser } = await import('../anthropic.js');
    const parseSpy = vi
      .spyOn(AnthropicNativeFileParser.prototype, 'parse')
      .mockRejectedValueOnce(new FileParseError('too big', 'too_large'));

    // LocalFileParser.parse will also be called — mock it to return a known value
    const { LocalFileParser } = await import('../local.js');
    const localSpy = vi
      .spyOn(LocalFileParser.prototype, 'parse')
      .mockResolvedValueOnce({ text: 'local fallback', truncated: false });

    const parser = createFileParser('anthropic', stubLlm);
    const result = await parser.parse(pdfFile());

    expect(parseSpy).toHaveBeenCalledOnce();
    expect(localSpy).toHaveBeenCalledOnce();
    expect(result.text).toBe('local fallback');

    parseSpy.mockRestore();
    localSpy.mockRestore();
  });

  it('does not fall back for other error reasons', async () => {
    const { AnthropicNativeFileParser } = await import('../anthropic.js');
    const parseSpy = vi
      .spyOn(AnthropicNativeFileParser.prototype, 'parse')
      .mockRejectedValueOnce(new FileParseError('corrupt', 'corrupted'));

    const parser = createFileParser('anthropic', stubLlm);
    await expect(parser.parse(pdfFile())).rejects.toMatchObject({ reason: 'corrupted' });

    parseSpy.mockRestore();
  });
});
