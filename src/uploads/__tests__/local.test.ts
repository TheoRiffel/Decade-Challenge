import * as XLSX from 'xlsx';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileParseError } from '../parse.js';
import { LocalFileParser, UPLOAD_MAX_CHARS } from '../local.js';

// Mock unpdf so PDF tests don't need a real PDF binary
vi.mock('unpdf', () => ({
  extractText: vi.fn(),
}));

// Import after mock so we get the mocked version
const { extractText } = await import('unpdf');
const mockExtractText = vi.mocked(extractText);

// --- Helpers ---

function makeFile(
  filename: string,
  mimeType: string,
  bytes: Uint8Array = new Uint8Array(8),
): import('../parse.js').UploadedFile {
  return { filename, mimeType, bytes };
}

function makeXlsxBytes(sheets: { name: string; rows: unknown[][] }[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

// --- canParse ---

describe('LocalFileParser.canParse', () => {
  const parser = new LocalFileParser();

  it('recognises application/pdf', () => {
    expect(parser.canParse(makeFile('doc.pdf', 'application/pdf'))).toBe(true);
  });

  it('recognises .pdf extension with wrong MIME', () => {
    expect(parser.canParse(makeFile('doc.pdf', 'application/octet-stream'))).toBe(true);
  });

  it('recognises xlsx MIME', () => {
    expect(
      parser.canParse(
        makeFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      ),
    ).toBe(true);
  });

  it('recognises .xlsx extension arriving as application/zip', () => {
    expect(parser.canParse(makeFile('data.xlsx', 'application/zip'))).toBe(true);
  });

  it('recognises .xls extension', () => {
    expect(parser.canParse(makeFile('data.xls', 'application/vnd.ms-excel'))).toBe(true);
  });

  it('rejects DOCX', () => {
    expect(
      parser.canParse(
        makeFile(
          'doc.docx',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ),
      ),
    ).toBe(false);
  });

  it('rejects plain text', () => {
    expect(parser.canParse(makeFile('note.txt', 'text/plain'))).toBe(false);
  });
});

// --- PDF parsing ---

describe('LocalFileParser.parse — PDF', () => {
  let parser: LocalFileParser;

  beforeEach(() => {
    parser = new LocalFileParser();
    vi.clearAllMocks();
  });

  it('returns extracted text and pageCount', async () => {
    mockExtractText.mockResolvedValue({ text: 'Hello from PDF', totalPages: 3 } as never);
    const result = await parser.parse(makeFile('doc.pdf', 'application/pdf'));
    expect(result.text).toBe('Hello from PDF');
    expect(result.pageCount).toBe(3);
    expect(result.truncated).toBe(false);
  });

  it('truncates text exceeding UPLOAD_MAX_CHARS', async () => {
    const longText = 'x'.repeat(UPLOAD_MAX_CHARS + 100);
    mockExtractText.mockResolvedValue({ text: longText, totalPages: 1 } as never);
    const result = await parser.parse(makeFile('big.pdf', 'application/pdf'));
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThan(longText.length);
    expect(result.text).toContain('[Content truncated');
  });

  it('throws FileParseError(extraction_failed) for empty text', async () => {
    mockExtractText.mockResolvedValue({ text: '   ', totalPages: 1 } as never);
    await expect(parser.parse(makeFile('empty.pdf', 'application/pdf'))).rejects.toMatchObject({
      reason: 'extraction_failed',
    });
  });

  it('wraps unpdf errors as FileParseError(corrupted)', async () => {
    mockExtractText.mockRejectedValue(new Error('PDF malformed'));
    const err = await parser.parse(makeFile('bad.pdf', 'application/pdf')).catch((e) => e);
    expect(err).toBeInstanceOf(FileParseError);
    expect(err.reason).toBe('corrupted');
  });
});

// --- XLSX parsing ---

describe('LocalFileParser.parse — XLSX', () => {
  const parser = new LocalFileParser();

  it('converts sheet rows to a markdown table', async () => {
    const bytes = makeXlsxBytes([
      { name: 'Data', rows: [['Name', 'Value'], ['Alpha', '1'], ['Beta', '2']] },
    ]);
    const result = await parser.parse(makeFile('data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes));
    expect(result.text).toContain('## Data');
    expect(result.text).toContain('| Name | Value |');
    expect(result.text).toContain('| Alpha | 1 |');
    expect(result.sheetCount).toBe(1);
    expect(result.truncated).toBe(false);
  });

  it('renders multiple sheets separated by headings', async () => {
    const bytes = makeXlsxBytes([
      { name: 'Q1', rows: [['Month', 'Sales'], ['Jan', '100']] },
      { name: 'Q2', rows: [['Month', 'Sales'], ['Apr', '200']] },
    ]);
    const result = await parser.parse(makeFile('multi.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes));
    expect(result.text).toContain('## Q1');
    expect(result.text).toContain('## Q2');
    expect(result.sheetCount).toBe(2);
  });

  it('skips empty sheets and counts only non-empty ones', async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['A', 'B'], ['1', '2']]), 'Full');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'Empty');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    const result = await parser.parse(makeFile('mixed.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes));
    expect(result.sheetCount).toBe(1);
    expect(result.text).toContain('## Full');
    expect(result.text).not.toContain('## Empty');
  });

  it('throws FileParseError(extraction_failed) when all sheets are empty', async () => {
    // SheetJS is lenient and never throws, so corrupted bytes alone don't
    // trigger a failure. The extraction_failed path fires when the workbook
    // contains only empty sheets (no rows with non-empty cells).
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([]), 'EmptySheet');
    const bytes = new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
    const err = await parser
      .parse(makeFile('empty.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes))
      .catch((e) => e);
    expect(err).toMatchObject({ reason: 'extraction_failed' });
  });
});

// --- Unsupported format ---

describe('LocalFileParser.parse — unsupported', () => {
  it('throws FileParseError(unsupported_format) when canParse would return false but parse is called anyway', async () => {
    const parser = new LocalFileParser();
    // Bypass canParse by calling parse directly with an unsupported file whose
    // MIME and extension don't match PDF or XLSX.
    const err = await parser
      .parse(makeFile('doc.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
      .catch((e) => e);
    expect(err).toBeInstanceOf(FileParseError);
    expect(err.reason).toBe('unsupported_format');
  });
});
