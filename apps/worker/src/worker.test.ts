import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  parseContactFile,
  normalizePhone,
  validateXlsxArchive,
} from './imports';
import { makeReport, csvCell, type ReportRecord } from './reports';
describe('bounded contact input', () => {
  it('parses quoted multiline CSV with header mapping source indexes', async () => {
    const rows = await parseContactFile(
      Buffer.from(
        'name,phone,consent\r\n"Doe, Jane","+12025550101",true\r\n"Line\nName",+12025550102,true\r\n',
      ),
      'sample.csv',
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.cells.name).toBe('Doe, Jane');
    expect(rows[1]?.cells.name).toBe('Line\nName');
    expect(rows[0]?.sourceRow).toBe(2);
  });
  it('does not guess a region and uses strict phone validation', () => {
    expect(() => normalizePhone('2025550101')).toThrow('REGION_REQUIRED');
    expect(normalizePhone('2025550101', 'US')).toBe('+12025550101');
    expect(() => normalizePhone('+1202555')).toThrow('INVALID_PHONE');
  });
  it.each(['a,a\n1,2', 'a,b\n"unterminated,2'])(
    'rejects malformed columns or CSV',
    async (text) => {
      await expect(
        parseContactFile(Buffer.from(text), 'x.csv'),
      ).rejects.toThrow();
    },
  );
  it('rejects expanded input limits', async () => {
    await expect(
      parseContactFile(Buffer.alloc(5 * 1024 * 1024 + 1), 'x.csv'),
    ).rejects.toThrow('FILE_LIMIT');
    await expect(
      parseContactFile(
        Buffer.from(
          'a,b\n' + Array.from({ length: 10001 }, () => '1,2').join('\n'),
        ),
        'x.csv',
      ),
    ).rejects.toThrow('ROW_LIMIT');
  });
  it('reads xlsx formulas as unsafe source text for correction', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Contacts');
    sheet.addRow(['name', 'phone']);
    sheet.addRow([{ formula: '1+1', result: 2 }, '+12025550101']);
    const rows = await parseContactFile(
      Buffer.from(await wb.xlsx.writeBuffer()),
      'sample.xlsx',
    );
    expect(rows[0]?.cells.name).toBe('=1+1');
  });
  it('rejects archive expansion metadata exceeding the memory ceiling', () => {
    const wb = Buffer.alloc(68);
    wb.writeUInt32LE(0x02014b50, 0);
    wb.writeUInt32LE(51 * 1024 * 1024, 24);
    wb.writeUInt32LE(0x06054b50, 46);
    wb.writeUInt16LE(1, 56);
    wb.writeUInt32LE(46, 58);
    wb.writeUInt32LE(0, 62);
    expect(() => validateXlsxArchive(wb)).toThrow('XLSX_EXPANDED_LIMIT');
  });
});
describe('report exports', () => {
  const row: ReportRecord = {
    name: '=HYPERLINK("evil")',
    phone: '+12025550101',
    mode: 'simulation',
    status: 'completed',
    outcome: 'connected',
    duration_seconds: 42,
    extracted_fields: {
      interest: 'interested',
      followUpRequested: true,
      preferredTime: null,
    },
  };
  it('quotes CSV and neutralizes executable prefixes while preserving unknown', async () => {
    expect(csvCell('=1+1')).toBe('"\t=1+1"');
    const output = (await makeReport('csv', [row])).toString();
    expect(output).toContain('\t=HYPERLINK');
    expect(output).toContain('\t+12025550101');
    expect(output).toContain('"unknown"');
    expect(output).toContain('"simulation"');
  });
  it('xlsx emits literal string cells with accurate outcome and nulls', async () => {
    const bytes = await makeReport('xlsx', [row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const sheet = wb.worksheets[0]!;
    expect(sheet.getCell('A2').type).toBe(ExcelJS.ValueType.String);
    expect(sheet.getCell('A2').text).toBe('\'=HYPERLINK("evil")');
    expect(sheet.getCell('E2').text).toBe('connected');
    expect(sheet.getCell('I2').text).toBe('unknown');
  });
});
