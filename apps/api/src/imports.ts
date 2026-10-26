import { Injectable } from '@nestjs/common';
import {
  pool,
  transaction,
  enqueueOutbox,
  appendAudit,
} from '@outreach/database';
import {
  ImportInputSchema,
  ImportCorrectionSchema,
  SuppressionSchema,
  canTransition,
} from '@outreach/contracts';
import {
  clean,
  owned,
  parse,
  requireWrite,
  pagination,
  paged,
  offsetCursor,
  DomainError,
  type SessionIdentity,
} from './common';
@Injectable()
export class ImportsService {
  async list(
    identity: SessionIdentity,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    const rows = await pool.query(
      'SELECT id,status,filename,mapping,region,row_count,valid_count,error_count,failure_code,created_at,updated_at FROM imports WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3',
      [identity.workspaceId, limit + 1, offset],
    );
    return paged(rows.rows, limit, offset);
  }
  async create(identity: SessionIdentity, body: unknown): Promise<unknown> {
    requireWrite(identity);
    const input = parse(ImportInputSchema, body);
    const bytes = Buffer.from(input.contentBase64, 'base64');
    if (bytes.length > 5242880 || !bytes.length)
      throw new DomainError(
        'FILE_SIZE_LIMIT',
        'Upload a nonempty file no larger than 5 MiB',
      );
    return clean(
      await transaction(async (client) => {
        const row = (
          await client.query(
            'INSERT INTO imports(workspace_id,filename,media_type,source_bytes,mapping,region,synthetic) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
            [
              identity.workspaceId,
              input.filename.replace(/[\\/\r\n]/g, '_'),
              input.filename.toLowerCase().endsWith('.csv')
                ? 'text/csv'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              bytes,
              JSON.stringify(input.mapping),
              input.region || null,
              input.synthetic,
            ],
          )
        ).rows[0];
        await enqueueOutbox(
          client,
          'imports',
          { id: row.id },
          identity.workspaceId,
        );
        await appendAudit(
          client,
          identity.workspaceId,
          identity.userId,
          'import.created',
          row.id,
          { format: row.media_type, bytes: bytes.length },
        );
        return row;
      }),
    );
  }
  async detail(identity: SessionIdentity, id: string): Promise<unknown> {
    return clean(await owned(pool, 'imports', id, identity.workspaceId));
  }
  async rows(
    identity: SessionIdentity,
    id: string,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    await owned(pool, 'imports', id, identity.workspaceId);
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    const result = await pool.query(
      'SELECT * FROM import_rows WHERE workspace_id=$1 AND import_id=$2 ORDER BY source_row,id LIMIT $3 OFFSET $4',
      [identity.workspaceId, id, limit + 1, offset],
    );
    return paged(result.rows, limit, offset);
  }
  async validate(
    identity: SessionIdentity,
    id: string,
    body: unknown,
  ): Promise<unknown> {
    requireWrite(identity);
    const input = parse(ImportCorrectionSchema, body);
    return clean(
      await transaction(async (client) => {
        const row = await owned(
          client,
          'imports',
          id,
          identity.workspaceId,
          true,
        );
        if (
          row.failure_code === 'SOURCE_EXPIRED' ||
          row.source_bytes.length === 0
        )
          throw new DomainError(
            'IMPORT_SOURCE_EXPIRED',
            'The source file expired; upload a new import to make corrections',
            410,
          );
        if (['uploaded', 'validating'].includes(row.status))
          throw new DomainError(
            'IMPORT_BUSY',
            'Import is currently validating',
            409,
          );
        if (!canTransition('import', row.status, 'uploaded'))
          throw new DomainError(
            'INVALID_TRANSITION',
            'This import cannot be revalidated',
            409,
          );
        const used = await client.query(
          'SELECT id FROM campaigns WHERE import_id=$1 AND workspace_id=$2 LIMIT 1',
          [id, identity.workspaceId],
        );
        if (used.rowCount)
          throw new DomainError(
            'IMPORT_IN_USE',
            'Create a new import revision after a campaign has selected this import',
            409,
          );
        if (input.corrections.length) {
          const correctedRows = await client.query<{
            source_row: number;
            source_cells: Record<string, string>;
          }>(
            'SELECT source_row,source_cells FROM import_rows WHERE import_id=$1 AND workspace_id=$2 AND source_row=ANY($3::int[])',
            [
              id,
              identity.workspaceId,
              input.corrections.map((correction) => correction.sourceRow),
            ],
          );
          const allowedColumns = new Map(
            correctedRows.rows.map((source) => [
              source.source_row,
              new Set(Object.keys(source.source_cells)),
            ]),
          );
          const seenRows = new Set<number>();
          for (const correction of input.corrections) {
            const columns = allowedColumns.get(correction.sourceRow);
            if (
              !columns ||
              seenRows.has(correction.sourceRow) ||
              Object.keys(correction.cells).length > 50 ||
              Object.keys(correction.cells).some(
                (column) => !columns.has(column),
              )
            )
              throw new DomainError(
                'INVALID_CORRECTION',
                'Correct only existing rows and column names, with at most 50 columns per row',
              );
            seenRows.add(correction.sourceRow);
          }
        }
        const corrections = { ...row.corrections };
        for (const correction of input.corrections)
          corrections[String(correction.sourceRow)] = correction.cells;
        const updated = (
          await client.query(
            "UPDATE imports SET mapping=$1,region=$2,corrections=$3,status='uploaded',failure_code=NULL,updated_at=now() WHERE id=$4 AND workspace_id=$5 RETURNING *",
            [
              JSON.stringify(input.mapping || row.mapping),
              input.region || row.region,
              JSON.stringify(corrections),
              id,
              identity.workspaceId,
            ],
          )
        ).rows[0];
        await enqueueOutbox(client, 'imports', { id }, identity.workspaceId);
        await appendAudit(
          client,
          identity.workspaceId,
          identity.userId,
          'import.revalidated',
          id,
          { correctedRows: input.corrections.length },
        );
        return updated;
      }),
    );
  }
  async contacts(
    identity: SessionIdentity,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    const result = await pool.query(
      'SELECT c.*,s.reason suppression_reason,(s.id IS NOT NULL) suppressed FROM contacts c LEFT JOIN suppressions s ON s.workspace_id=c.workspace_id AND s.phone=c.phone WHERE c.workspace_id=$1 ORDER BY c.created_at DESC,c.id DESC LIMIT $2 OFFSET $3',
      [identity.workspaceId, limit + 1, offset],
    );
    return paged(result.rows, limit, offset);
  }
  async suppress(
    identity: SessionIdentity,
    id: string,
    body: unknown,
  ): Promise<unknown> {
    requireWrite(identity);
    const input = parse(SuppressionSchema, body);
    return clean(
      await transaction(async (client) => {
        const row = await owned(
          client,
          'contacts',
          id,
          identity.workspaceId,
          true,
        );
        await client.query(
          'INSERT INTO suppressions(workspace_id,phone,reason) VALUES($1,$2,$3) ON CONFLICT(workspace_id,phone) DO UPDATE SET reason=excluded.reason',
          [identity.workspaceId, row.phone, input.reason],
        );
        await client.query(
          'UPDATE contacts SET consent=false WHERE id=$1 AND workspace_id=$2',
          [id, identity.workspaceId],
        );
        await client.query(
          "INSERT INTO consent_records(workspace_id,contact_id,granted,source) VALUES($1,$2,false,'operator-opt-out')",
          [identity.workspaceId, id],
        );
        await appendAudit(
          client,
          identity.workspaceId,
          identity.userId,
          'contact.suppressed',
          id,
          { reason: input.reason },
        );
        return { id, suppressed: true };
      }),
    );
  }
}
