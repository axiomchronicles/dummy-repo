import ExcelJS from 'exceljs';
import { sanitizeSpreadsheetCell } from '@outreach/contracts';
import { transaction, appendCampaignEvent } from '@outreach/database';
export function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  const protectedText =
    sanitizeSpreadsheetCell(value) === text ? text : `\t${text}`;
  return `"${protectedText.replaceAll('"', '""')}"`;
}
export const reportHeaders = [
  'Name',
  'Phone',
  'Mode',
  'Contact status',
  'Outcome',
  'Duration seconds',
  'Interest',
  'Follow-up requested',
  'Preferred time',
];
export type ReportRecord = {
  name: string;
  phone: string;
  mode: string;
  status: string;
  outcome: string | null;
  duration_seconds: number | null;
  extracted_fields: Record<string, unknown> | null;
};
export function reportValues(row: ReportRecord): unknown[] {
  const data = row.extracted_fields;
  return [
    row.name,
    row.phone,
    row.mode,
    row.status,
    row.outcome ?? 'unknown',
    row.duration_seconds ?? '',
    data?.interest ?? 'unknown',
    data?.followUpRequested ?? 'unknown',
    data?.preferredTime ?? 'unknown',
  ];
}
export async function makeReport(
  format: 'csv' | 'xlsx',
  rows: ReportRecord[],
): Promise<Buffer> {
  if (rows.length > 10000) throw new Error('REPORT_ROW_LIMIT');
  if (format === 'csv')
    return Buffer.from(
      [
        reportHeaders.map(csvCell).join(','),
        ...rows.map((row) => reportValues(row).map(csvCell).join(',')),
      ].join('\r\n') + '\r\n',
      'utf8',
    );
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Campaign outcomes');
  sheet.addRow(reportHeaders);
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of rows)
    sheet.addRow(reportValues(row).map(sanitizeSpreadsheetCell));
  sheet.columns.forEach((column) => {
    column.width = 24;
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
export async function processReport(id: string) {
  await transaction(async (client) => {
    const report = (
      await client.query('SELECT * FROM reports WHERE id=$1 FOR UPDATE', [id])
    ).rows[0];
    if (!report || !['pending', 'processing'].includes(report.status)) return;
    await client.query(
      "UPDATE reports SET status='processing',failure_code=NULL WHERE id=$1",
      [id],
    );
    const rows = (
      await client.query(
        'SELECT c.name,c.phone,ca.mode,cc.status,a.outcome,a.duration_seconds,an.extracted_fields FROM campaign_contacts cc JOIN contacts c ON c.id=cc.contact_id AND c.workspace_id=cc.workspace_id JOIN campaigns ca ON ca.id=cc.campaign_id LEFT JOIN call_attempts a ON a.campaign_contact_id=cc.id LEFT JOIN analyses an ON an.call_attempt_id=a.id WHERE cc.campaign_id=$1 AND cc.workspace_id=$2 ORDER BY cc.position,cc.id LIMIT 10001',
        [report.campaign_id, report.workspace_id],
      )
    ).rows as ReportRecord[];
    const artifact = await makeReport(report.format, rows);
    if (artifact.length > 20 * 1024 * 1024)
      throw new Error('REPORT_ARTIFACT_LIMIT');
    const filename = `outreach-${report.campaign_id}.${report.format}`;
    const contentType =
      report.format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    await client.query(
      "UPDATE reports SET status='completed',artifact=$2,filename=$3,content_type=$4,row_count=$5 WHERE id=$1",
      [id, artifact, filename, contentType, rows.length],
    );
    await appendCampaignEvent(
      client,
      report.workspace_id,
      report.campaign_id,
      'report.completed',
      { reportId: id, format: report.format, rowCount: rows.length },
    );
  });
}
