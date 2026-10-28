import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  parseAttachmentFile,
  formatCellValue,
  parseXlsxBuffer,
  parseCsvBuffer,
  parseTxtBuffer,
} from './file-parser';

describe('file-parser', () => {
  it('formats cell values safely for various types', () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Test');
    const row = sheet.addRow(['plain text', 12345, null, { text: 'rich' }]);
    expect(formatCellValue(row.getCell(1))).toBe('plain text');
    expect(formatCellValue(row.getCell(2))).toBe('12345');
    expect(formatCellValue(row.getCell(3))).toBe('');
    expect(formatCellValue(row.getCell(4))).toBe('rich');
  });

  it('parses XLSX buffer with full column data and rows', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Contacts');
    sheet.addRow(['User ID', 'Fake Name', 'Indian Mobile Number']);
    sheet.addRow(['U001', 'Aarav Sharma', '00000 00001']);
    sheet.addRow(['U002', 'Meera Verma', '00000 00002']);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await parseXlsxBuffer(buffer, 'fake_indian_users.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    expect(res.parsedSuccessfully).toBe(true);
    expect(res.format).toBe('xlsx');
    expect(res.metadata.rowCount).toBe(2);
    expect(res.metadata.columnNames).toEqual(['User ID', 'Fake Name', 'Indian Mobile Number']);
    expect(res.detailsMarkdown).toContain('User ID: U001');
    expect(res.detailsMarkdown).toContain('Fake Name: Aarav Sharma');
    expect(res.detailsMarkdown).toContain('Indian Mobile Number: 00000 00001');
  });

  it('parses CSV buffer accurately', async () => {
    const csvContent = 'name,phone,role\nAlice,9876543210,admin\nBob,9876543211,user\n';
    const buffer = Buffer.from(csvContent, 'utf8');

    const res = await parseCsvBuffer(buffer, 'users.csv', 'text/csv');
    expect(res.parsedSuccessfully).toBe(true);
    expect(res.format).toBe('csv');
    expect(res.metadata.rowCount).toBe(2);
    expect(res.detailsMarkdown).toContain('Alice');
    expect(res.detailsMarkdown).toContain('9876543210');
  });

  it('parses plain text buffer cleanly', async () => {
    const textContent = 'This is an outreach meeting transcript with notes.\nAction items:\n- Call vendor';
    const buffer = Buffer.from(textContent, 'utf8');

    const res = await parseTxtBuffer(buffer, 'notes.txt', 'text/plain');
    expect(res.parsedSuccessfully).toBe(true);
    expect(res.format).toBe('txt');
    expect(res.detailsMarkdown).toContain('Call vendor');
  });

  it('reports verified reason on empty file', async () => {
    const res = await parseAttachmentFile('empty.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', Buffer.alloc(0));
    expect(res.parsedSuccessfully).toBe(false);
    expect(res.metadata.errorReason).toContain('empty (0 bytes)');
    expect(res.detailsMarkdown).toContain('contains no data');
  });

  it('reports verified error on corrupted file', async () => {
    const corrupted = Buffer.from('not a real zip or xlsx file at all');
    const res = await parseAttachmentFile('corrupted.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', corrupted);
    expect(res.parsedSuccessfully).toBe(false);
    expect(res.metadata.errorReason).toBeDefined();
    expect(res.detailsMarkdown).toContain('could not be parsed');
  });
});
