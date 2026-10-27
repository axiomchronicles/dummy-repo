import { Readable } from 'node:stream';
import { parse } from 'csv-parse';
import ExcelJS from 'exceljs';
import {
  parsePhoneNumberWithError,
  type CountryCode,
  isSupportedCountry,
} from 'libphonenumber-js/max';
import { pool, transaction } from '@outreach/database';
export class ImportValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
export type SourceRow = { sourceRow: number; cells: Record<string, string> };
export function normalizePhone(value: string, region?: string | null): string {
  const input = value.trim();
  if (!input.startsWith('+') && !region)
    throw new ImportValidationError('REGION_REQUIRED');
  if (region && !isSupportedCountry(region))
    throw new ImportValidationError('INVALID_REGION');
  try {
    const number = parsePhoneNumberWithError(input, {
      defaultCountry: region as CountryCode | undefined,
      extract: false,
    });
    if (!number.isValid() || number.ext) throw new Error();
    return number.number;
  } catch {
    throw new ImportValidationError('INVALID_PHONE');
  }
}
export function validateXlsxArchive(bytes: Buffer) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new ImportValidationError('INVALID_XLSX');
  const count = bytes.readUInt16LE(end + 10),
    size = bytes.readUInt32LE(end + 12),
    offset = bytes.readUInt32LE(end + 16);
  if (count > 1000 || count === 65535 || offset + size > bytes.length)
    throw new ImportValidationError('XLSX_ARCHIVE_LIMIT');
  let position = offset,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (
      position + 46 > bytes.length ||
      bytes.readUInt32LE(position) !== 0x02014b50
    )
      throw new ImportValidationError('INVALID_XLSX');
    const expanded = bytes.readUInt32LE(position + 24);
    total += expanded;
    if (total > 50 * 1024 * 1024 || expanded === 0xffffffff)
      throw new ImportValidationError('XLSX_EXPANDED_LIMIT');
    position +=
      46 +
      bytes.readUInt16LE(position + 28) +
      bytes.readUInt16LE(position + 30) +
      bytes.readUInt16LE(position + 32);
  }
}
function validateHeaders(headers: string[]) {
  if (
    !headers.length ||
    headers.length > 50 ||
    headers.some((h) => !h || h.length > 100) ||
    new Set(headers).size !== headers.length
  )
    throw new ImportValidationError('INVALID_COLUMNS');
}
function cellsFromValues(
  headers: string[],
  values: string[],
): Record<string, string> {
  if (values.length > 50 || values.length !== headers.length)
    throw new ImportValidationError('COLUMN_COUNT');
  const cells: Record<string, string> = {};
  headers.forEach((h, i) => {
    const value = values[i] ?? '';
    if (value.length > 2000) throw new ImportValidationError('CELL_LIMIT');
    cells[h] = value;
  });
  return cells;
}
export async function parseContactFile(
  bytes: Buffer,
  filename: string,
): Promise<SourceRow[]> {
  if (bytes.length > 5 * 1024 * 1024)
    throw new ImportValidationError('FILE_LIMIT');
  const rows: SourceRow[] = [];
  let headers: string[] = [];
  if (filename.toLowerCase().endsWith('.csv')) {
    const parser = Readable.from([bytes]).pipe(
      parse({ bom: true, skip_empty_lines: true, max_record_size: 105000 }),
    );
    let sourceRow = 0;
    try {
      for await (const value of parser) {
        sourceRow++;
        const values = (value as string[]).map((v) => String(v));
        if (sourceRow === 1) {
          headers = values.map((v) => v.trim());
          validateHeaders(headers);
          continue;
        }
        if (rows.length >= 10000) throw new ImportValidationError('ROW_LIMIT');
        rows.push({ sourceRow, cells: cellsFromValues(headers, values) });
      }
    } catch (error) {
      if (error instanceof ImportValidationError) throw error;
      throw new ImportValidationError('MALFORMED_CSV');
    }
  } else if (filename.toLowerCase().endsWith('.xlsx')) {
    validateXlsxArchive(bytes);
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(
        bytes as unknown as Parameters<typeof workbook.xlsx.load>[0],
      );
    } catch {
      throw new ImportValidationError('MALFORMED_XLSX');
    }
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.rowCount > 10001 || sheet.columnCount > 50)
      throw new ImportValidationError('XLSX_DIMENSION_LIMIT');
    for (let number = 1; number <= sheet.rowCount; number++) {
      const row = sheet.getRow(number);
      const values: string[] = [];
      for (
        let column = 1;
        column <= (number === 1 ? sheet.columnCount : headers.length);
        column++
      ) {
        const cell = row.getCell(column);
        values.push(
          cell.type === ExcelJS.ValueType.Formula
            ? `=${cell.formula}`
            : cell.text,
        );
      }
      if (number === 1) {
        let lastNonEmpty = values.length - 1;
        while (lastNonEmpty >= 0 && !values[lastNonEmpty]?.trim()) {
          lastNonEmpty--;
        }
        headers = values.slice(0, lastNonEmpty + 1).map((v) => v.trim());
        validateHeaders(headers);
        continue;
      }
      if (values.every((v) => v === '')) continue;
      rows.push({ sourceRow: number, cells: cellsFromValues(headers, values) });
    }
  } else throw new ImportValidationError('UNSUPPORTED_FILE');
  if (!rows.length) throw new ImportValidationError('EMPTY_FILE');
  return rows;
}
const suspicious = (value: string) =>
  /^[\s\p{Cc}]*[=+\-@＝＋－＠]/u.test(value) || /^[\t\r\n]/.test(value);
export async function processImport(id: string) {
  const job = (await pool.query('SELECT * FROM imports WHERE id=$1', [id]))
    .rows[0];
  if (!job || !['uploaded', 'validating'].includes(job.status)) return;
  try {
    const parsed = await parseContactFile(job.source_bytes, job.filename);
    await transaction(async (client) => {
      const current = (
        await client.query('SELECT * FROM imports WHERE id=$1 FOR UPDATE', [id])
      ).rows[0];
      if (!current || !['uploaded', 'validating'].includes(current.status))
        return;
      await client.query(
        "UPDATE imports SET status='validating',failure_code=NULL,updated_at=now() WHERE id=$1",
        [id],
      );
      await client.query('DELETE FROM import_rows WHERE import_id=$1', [id]);
      const mapping = { ...(current.mapping as Record<string, string>) };
      const availableKeys = Object.keys(parsed[0]?.cells ?? {});
      if (mapping.phone && !Object.hasOwn(parsed[0]?.cells ?? {}, mapping.phone)) {
        const found = availableKeys.find(
          (k) =>
            k.toLowerCase() === mapping.phone.toLowerCase() ||
            /phone|mobile|contact|cell|number/i.test(k),
        );
        if (found) mapping.phone = found;
      }
      if (mapping.name && !Object.hasOwn(parsed[0]?.cells ?? {}, mapping.name)) {
        const found = availableKeys.find(
          (k) =>
            k.toLowerCase() === mapping.name.toLowerCase() ||
            /name|candidate|student|client|person/i.test(k),
        );
        if (found) mapping.name = found;
      }
      if (
        !parsed[0]?.cells ||
        !Object.hasOwn(parsed[0].cells, mapping.phone ?? '')
      )
        throw new ImportValidationError('MAPPING_MISSING_COLUMN');
      const seen = new Set<string>();
      let valid = 0,
        errors = 0,
        blocking = 0;
      const suppressed = new Set(
        (
          await client.query(
            'SELECT phone FROM suppressions WHERE workspace_id=$1',
            [current.workspace_id],
          )
        ).rows.map((r) => r.phone as string),
      );
      for (const source of parsed) {
        const cells: Record<string, string> = {
          ...source.cells,
          ...(current.corrections as Record<string, Record<string, string>>)[
            String(source.sourceRow)
          ],
        };
        const issues: { code: string; message: string; field?: string }[] = [];
        let phone: string | null = null,
          contactId: string | null = null,
          status = 'valid';
        try {
          phone = normalizePhone(cells[mapping.phone!] ?? '', current.region);
        } catch (error) {
          issues.push({
            code:
              error instanceof ImportValidationError
                ? error.code
                : 'INVALID_PHONE',
            message: 'Provide a valid phone number and known source region.',
            field: mapping.phone,
          });
        }
        for (const [field, value] of Object.entries(cells)) {
          if (
            suspicious(value) &&
            !(field === mapping.phone && phone && value.trim().startsWith('+'))
          ) {
            issues.push({
              code: 'SPREADSHEET_FORMULA',
              message: 'Formula-like input must be corrected to plain text.',
              field,
            });
          }
        }
        if (phone && seen.has(phone)) {
          status = 'duplicate';
          issues.push({
            code: 'DUPLICATE',
            message: 'Duplicate phone within this import.',
            field: mapping.phone,
          });
        } else if (phone) seen.add(phone);
        if (issues.length && status !== 'duplicate') status = 'invalid';
        if (phone && status === 'valid') {
          const consent = ['true', 'yes', '1'].includes(
            (cells[mapping.consent ?? ''] ?? '').trim().toLowerCase(),
          );
          const synthetic = !!current.synthetic;
          if (synthetic && !/^\+1[2-9]\d{2}55501\d{2}$/.test(phone)) {
            status = 'invalid';
            issues.push({
              code: 'SYNTHETIC_RANGE',
              message:
                'Synthetic imports must use reserved 555-01xx destinations.',
              field: mapping.phone,
            });
          } else {
            const attributes: Record<string, string> = {};
            for (const [key, value] of Object.entries(cells)) {
              if (
                key !== mapping.phone &&
                key !== mapping.name &&
                key !== mapping.consent
              )
                attributes[key] = value;
            }
            if (mapping.outcome)
              attributes.mockOutcome = cells[mapping.outcome] ?? '';
            const contact = (
              await client.query(
                'INSERT INTO contacts(workspace_id,phone,name,attributes,consent,synthetic) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(workspace_id,phone) DO UPDATE SET name=EXCLUDED.name,attributes=EXCLUDED.attributes RETURNING id,consent,synthetic',
                [
                  current.workspace_id,
                  phone,
                  cells[mapping.name ?? ''] ?? 'Unnamed contact',
                  JSON.stringify(attributes),
                  consent,
                  synthetic,
                ],
              )
            ).rows[0];
            contactId = contact.id;
            if (consent && !suppressed.has(phone)) {
              await client.query(
                'UPDATE contacts SET consent=true WHERE id=$1 AND workspace_id=$2',
                [contactId, current.workspace_id],
              );
              await client.query(
                'INSERT INTO consent_records(workspace_id,contact_id,granted,source) VALUES($1,$2,true,$3)',
                [
                  current.workspace_id,
                  contactId,
                  `Explicit consent column in import ${id}, row ${source.sourceRow}`,
                ],
              );
            }
            if (suppressed.has(phone)) {
              status = 'excluded';
              issues.push({
                code: 'SUPPRESSED',
                message: 'Durable opt-out excludes this contact.',
              });
            } else if (!consent && !contact.consent) {
              status = 'excluded';
              issues.push({
                code: 'CONSENT_MISSING',
                message: 'Explicit consent evidence is required.',
              });
            }
          }
        }
        if (status === 'valid') valid++;
        else errors++;
        if (status === 'invalid') blocking++;
        await client.query(
          'INSERT INTO import_rows(workspace_id,import_id,source_row,source_cells,normalized_phone,issues,status,contact_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
          [
            current.workspace_id,
            id,
            source.sourceRow,
            JSON.stringify(cells),
            phone,
            JSON.stringify(issues),
            status,
            contactId,
          ],
        );
      }
      await client.query(
        'UPDATE imports SET status=$2,row_count=$3,valid_count=$4,error_count=$5,updated_at=now() WHERE id=$1',
        [
          id,
          blocking ? 'needs_correction' : 'ready',
          parsed.length,
          valid,
          errors,
        ],
      );
    });
  } catch (error) {
    if (!(error instanceof ImportValidationError)) throw error;
    await pool.query(
      "UPDATE imports SET status='failed',failure_code=$2,updated_at=now() WHERE id=$1",
      [id, error.code],
    );
  }
}
