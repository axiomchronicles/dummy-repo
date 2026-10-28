import { parse as parseCsvSync } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

// Safe require for pdf-parse to avoid optional debug side-effects
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

export interface ParsedAttachment {
  filename: string;
  mediaType: string;
  sizeBytes: number;
  format: 'xlsx' | 'csv' | 'pdf' | 'txt' | 'unknown';
  parsedSuccessfully: boolean;
  summary: string;
  detailsMarkdown: string;
  metadata: {
    rowCount?: number;
    columnNames?: string[];
    sheetNames?: string[];
    pageCount?: number;
    truncated?: boolean;
    errorReason?: string;
  };
}

/**
 * Safely extracts display string from any ExcelJS cell (including formula, merged, rich text, null).
 */
export function formatCellValue(cell: ExcelJS.Cell): string {
  try {
    if (cell.value == null) return '';
    if (typeof cell.value === 'object') {
      const val = cell.value as unknown as Record<string, unknown>;
      if ('text' in val && typeof val.text === 'string') return val.text.trim();
      if ('result' in val && val.result != null) return String(val.result).trim();
      if ('richText' in val && Array.isArray(val.richText)) {
        return (val.richText as { text?: string }[])
          .map((rt) => rt.text || '')
          .join('')
          .trim();
      }
      return String(cell.text || '').trim();
    }
    return String(cell.value).trim();
  } catch {
    return '';
  }
}

/**
 * Parses XLSX / XLS spreadsheet buffer with bounded extraction.
 */
export async function parseXlsxBuffer(
  bytes: Buffer,
  filename: string,
  mediaType: string,
): Promise<ParsedAttachment> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheetNames = workbook.worksheets.map((s) => s.name);
  const lines: string[] = [];
  let totalDataRows = 0;
  let allColumns: string[] = [];
  let wasTruncated = false;

  for (const sheet of workbook.worksheets.slice(0, 5)) {
    if (sheet.rowCount === 0) continue;
    const sheetDataRows = Math.max(0, sheet.rowCount - 1);
    totalDataRows += sheetDataRows;

    lines.push(`### Sheet: "${sheet.name}" (${sheetDataRows} rows, ${sheet.columnCount} columns)`);

    // Determine header row (row 1)
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const val = formatCellValue(headerRow.getCell(c));
      headers.push(val || `Column_${c}`);
    }
    if (!allColumns.length) allColumns = headers;

    lines.push(`Columns: ${headers.join(' | ')}`);
    lines.push(`Rows:`);

    const maxRows = Math.min(sheet.rowCount, 101);
    for (let r = 2; r <= maxRows; r++) {
      const row = sheet.getRow(r);
      const rowParts: string[] = [];
      for (let c = 1; c <= headers.length; c++) {
        const val = formatCellValue(row.getCell(c));
        if (val) {
          rowParts.push(`${headers[c - 1]}: ${val}`);
        }
      }
      if (rowParts.length > 0) {
        lines.push(`  Row ${r - 1}: ${rowParts.join(' | ')}`);
      }
    }

    if (sheet.rowCount > 101) {
      wasTruncated = true;
      lines.push(`  [... and ${sheet.rowCount - 101} more rows in sheet "${sheet.name}"]`);
    }
    lines.push('');
  }

  const summary = `Excel spreadsheet with ${sheetNames.length} sheet(s) (${sheetNames.join(', ')}), ${totalDataRows} total rows, and columns: ${allColumns.join(', ')}.`;

  return {
    filename,
    mediaType,
    sizeBytes: bytes.length,
    format: 'xlsx',
    parsedSuccessfully: true,
    summary,
    detailsMarkdown: lines.join('\n').trim(),
    metadata: {
      rowCount: totalDataRows,
      columnNames: allColumns,
      sheetNames,
      truncated: wasTruncated,
    },
  };
}

/**
 * Parses CSV buffer with bounded extraction.
 */
export async function parseCsvBuffer(
  bytes: Buffer,
  filename: string,
  mediaType: string,
): Promise<ParsedAttachment> {
  const records = parseCsvSync(bytes, {
    bom: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as string[][];

  if (!records.length) {
    return {
      filename,
      mediaType,
      sizeBytes: bytes.length,
      format: 'csv',
      parsedSuccessfully: true,
      summary: 'Empty CSV file.',
      detailsMarkdown: 'The CSV file is empty.',
      metadata: { rowCount: 0, columnNames: [] },
    };
  }

  const headers = records[0].map((h, i) => (h && h.trim()) || `Column_${i + 1}`);
  const dataRows = records.slice(1);
  const lines: string[] = [
    `Columns: ${headers.join(' | ')}`,
    `Total rows: ${dataRows.length}`,
    `Rows:`,
  ];

  const maxRows = Math.min(dataRows.length, 100);
  for (let i = 0; i < maxRows; i++) {
    const row = dataRows[i];
    const rowParts: string[] = [];
    headers.forEach((h, colIdx) => {
      const val = row[colIdx]?.trim();
      if (val) rowParts.push(`${h}: ${val}`);
    });
    if (rowParts.length) {
      lines.push(`  Row ${i + 1}: ${rowParts.join(' | ')}`);
    }
  }

  const wasTruncated = dataRows.length > 100;
  if (wasTruncated) {
    lines.push(`  [... and ${dataRows.length - 100} more rows truncated for context window]`);
  }

  return {
    filename,
    mediaType,
    sizeBytes: bytes.length,
    format: 'csv',
    parsedSuccessfully: true,
    summary: `CSV file with ${dataRows.length} rows and columns: ${headers.join(', ')}.`,
    detailsMarkdown: lines.join('\n'),
    metadata: {
      rowCount: dataRows.length,
      columnNames: headers,
      truncated: wasTruncated,
    },
  };
}

/**
 * Parses PDF buffer with bounded text extraction.
 */
export async function parsePdfBuffer(
  bytes: Buffer,
  filename: string,
  mediaType: string,
): Promise<ParsedAttachment> {
  const pdfData = await pdfParse(bytes);
  const pageCount: number = pdfData.numpages || 1;
  const rawText: string = (pdfData.text || '').trim();

  const maxChars = 25000;
  const wasTruncated = rawText.length > maxChars;
  const textExcerpt = wasTruncated
    ? rawText.slice(0, maxChars) + `\n\n[... and ${rawText.length - maxChars} more characters truncated for context limits]`
    : rawText;

  const summary = `PDF document with ${pageCount} page(s) and ${rawText.length} characters.`;
  const detailsMarkdown = [
    `Page count: ${pageCount}`,
    `Character count: ${rawText.length}`,
    `Content:`,
    textExcerpt || '(No extractable text found in PDF)',
  ].join('\n');

  return {
    filename,
    mediaType,
    sizeBytes: bytes.length,
    format: 'pdf',
    parsedSuccessfully: true,
    summary,
    detailsMarkdown,
    metadata: {
      pageCount,
      truncated: wasTruncated,
    },
  };
}

/**
 * Parses plain text / Markdown / JSON buffer with bounded character extraction.
 */
export async function parseTxtBuffer(
  bytes: Buffer,
  filename: string,
  mediaType: string,
): Promise<ParsedAttachment> {
  const rawText = bytes.toString('utf8').trim();
  const maxChars = 25000;
  const wasTruncated = rawText.length > maxChars;
  const textExcerpt = wasTruncated
    ? rawText.slice(0, maxChars) + `\n\n[... and ${rawText.length - maxChars} more characters truncated for context limits]`
    : rawText;

  const summary = `Text document (${bytes.length} bytes, ${rawText.length} characters).`;
  const detailsMarkdown = [
    `Character count: ${rawText.length}`,
    `Content:`,
    textExcerpt || '(Empty text document)',
  ].join('\n');

  return {
    filename,
    mediaType,
    sizeBytes: bytes.length,
    format: 'txt',
    parsedSuccessfully: true,
    summary,
    detailsMarkdown,
    metadata: {
      truncated: wasTruncated,
    },
  };
}

/**
 * Unified entry point to reliably parse any supported format (XLSX, CSV, PDF, TXT)
 * or report a verified, actionable reason when unparseable.
 */
export async function parseAttachmentFile(
  filename: string,
  mediaType: string,
  bytes: Buffer | null | undefined,
): Promise<ParsedAttachment> {
  const size = bytes ? bytes.length : 0;
  const ext = filename.toLowerCase().split('.').pop() || '';

  if (!bytes || bytes.length === 0) {
    return {
      filename,
      mediaType,
      sizeBytes: 0,
      format: 'unknown',
      parsedSuccessfully: false,
      summary: `File "${filename}" is empty (0 bytes).`,
      detailsMarkdown: `The attached file "${filename}" contains no data (0 bytes).`,
      metadata: { errorReason: 'File is empty (0 bytes).' },
    };
  }

  try {
    if (ext === 'xlsx' || ext === 'xls' || mediaType.includes('spreadsheet') || mediaType.includes('excel')) {
      return await parseXlsxBuffer(bytes, filename, mediaType);
    }
    if (ext === 'csv' || ext === 'tsv' || mediaType.includes('csv')) {
      return await parseCsvBuffer(bytes, filename, mediaType);
    }
    if (ext === 'pdf' || mediaType.includes('pdf')) {
      return await parsePdfBuffer(bytes, filename, mediaType);
    }
    if (ext === 'txt' || ext === 'json' || ext === 'md' || mediaType.includes('text') || mediaType.includes('json')) {
      return await parseTxtBuffer(bytes, filename, mediaType);
    }

    // Attempt text decode for unknown text-like files, otherwise return unparsed binary notice
    try {
      return await parseTxtBuffer(bytes, filename, mediaType);
    } catch {
      return {
        filename,
        mediaType,
        sizeBytes: size,
        format: 'unknown',
        parsedSuccessfully: false,
        summary: `Unsupported file format for "${filename}".`,
        detailsMarkdown: `The attached file "${filename}" is in an unsupported format (${mediaType || 'binary'}). Supported formats are XLSX, CSV, PDF, and TXT.`,
        metadata: { errorReason: 'Unsupported format.' },
      };
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      filename,
      mediaType,
      sizeBytes: size,
      format: 'unknown',
      parsedSuccessfully: false,
      summary: `Failed to parse "${filename}": ${errorMsg}`,
      detailsMarkdown: `The attached file "${filename}" could not be parsed: ${errorMsg}`,
      metadata: { errorReason: errorMsg },
    };
  }
}
