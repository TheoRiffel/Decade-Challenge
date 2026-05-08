import * as XLSX from 'xlsx';
import { FileParseError } from './parse.js';

export type XlsxParseResult = {
  text: string;
  sheetCount: number;
};

/**
 * Converts each sheet to a Markdown table separated by a heading.
 * Empty sheets are skipped. Rows with all-empty cells are skipped.
 */
export function parseXlsx(bytes: Uint8Array): XlsxParseResult {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: 'array' });
  } catch (err) {
    throw new FileParseError(
      `Excel file could not be parsed: ${err instanceof Error ? err.message : String(err)}`,
      'corrupted',
      err,
    );
  }

  const { SheetNames } = workbook;
  if (SheetNames.length === 0) {
    throw new FileParseError('Excel file contains no sheets', 'extraction_failed');
  }

  const parts: string[] = [];

  for (const name of SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;

    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: '',
    });

    const nonEmpty = rows.filter((row) => row.some((cell) => String(cell).trim() !== ''));
    if (nonEmpty.length === 0) continue;

    const [header, ...body] = nonEmpty;
    if (!header) continue;

    const cols = header.map((h) => String(h));
    const sep = cols.map(() => '---');

    const mdRows = [
      `| ${cols.join(' | ')} |`,
      `| ${sep.join(' | ')} |`,
      ...body.map((row) => `| ${cols.map((_, i) => String(row[i] ?? '')).join(' | ')} |`),
    ];

    parts.push(`## ${name}\n\n${mdRows.join('\n')}`);
  }

  if (parts.length === 0) {
    throw new FileParseError('Excel file has no non-empty sheets', 'extraction_failed');
  }

  return { text: parts.join('\n\n'), sheetCount: parts.length };
}
