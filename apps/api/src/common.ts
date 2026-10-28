import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { z } from 'zod';
import type { Request, Response } from 'express';
import type { PoolClient } from 'pg';
import { pool } from '@outreach/database';
import {
  maskDestination,
  PaginationSchema,
  IdSchema,
  PolicySchema,
  resolveSettings,
  type CampaignPolicy,
  type ResolvedSettings,
} from '@outreach/contracts';

export class DomainError extends HttpException {
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(
      {
        error: { code, message, ...(details === undefined ? {} : { details }) },
      },
      status,
    );
  }
}
export function parse<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new DomainError(
      'VALIDATION_ERROR',
      'Check the highlighted input fields',
      400,
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  return result.data;
}
export function identifier(id: string): string {
  return parse(IdSchema, id);
}
export type SessionIdentity = {
  userId: string;
  workspaceId: string;
  role: 'owner' | 'operator' | 'viewer';
  email: string;
  name: string;
  mfaEnabled?: boolean;
};
export type AuthenticatedRequest = Request & { identity: SessionIdentity };
export function requireWrite(identity: SessionIdentity): void {
  if (identity.role === 'viewer')
    throw new DomainError('FORBIDDEN', 'Operator permission is required', 403);
}
export function clean(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (
        [
          'source_bytes',
          'recording',
          'password_hash',
          'mfa_secret',
          'artifact',
          'token_hash',
          'provider_attempt_id',
          'interaction_id',
          'provider_config',
          'processing_token',
          'processing_started_at',
        ].includes(key)
      )
        continue;
      const jsonField = [
        'payload',
        'source_cells',
        'mapping',
        'corrections',
        'policy',
        'plan',
        'attributes',
        'settings',
        'extracted_fields',
        'transcript',
        'metadata',
      ].includes(key);
      result[
        key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
      ] =
        ['phone', 'contact_phone'].includes(key) && typeof item === 'string'
          ? maskDestination(item)
          : jsonField
            ? item
            : clean(item);
    }
    return result;
  }
  return value;
}
type BaseRow = { id: string; workspace_id: string; created_at: Date };
type DatabaseRows = {
  agents: BaseRow & {
    name: string;
    description: string;
    current_version: number;
  };
  imports: BaseRow & {
    source_bytes: Buffer;
    failure_code: string | null;
    status: string;
    filename: string;
    mapping: Record<string, string>;
    region: string | null;
    corrections: Record<string, Record<string, string>>;
    row_count: number;
    valid_count: number;
    error_count: number;
  };
  contacts: BaseRow & {
    phone: string;
    name: string;
    consent: boolean;
    synthetic: boolean;
  };
  campaigns: BaseRow & {
    updated_at: Date;
    name: string;
    objective: string;
    mode: 'simulation' | 'live';
    status: string;
    agent_version_id: string;
    import_id: string;
    policy: Record<string, unknown>;
    plan: Record<string, unknown> | null;
    launch_key: string | null;
  };
  call_attempts: BaseRow & {
    provider: string;
    status: string;
    campaign_id: string;
    campaign_contact_id: string;
  };
  reports: BaseRow & {
    status: string;
    artifact: Buffer | null;
    expires_at: Date;
    filename: string | null;
    content_type: string | null;
    format: 'csv' | 'xlsx';
  };
};
export async function owned<T extends keyof DatabaseRows>(
  client: PoolClient | typeof pool,
  table: T,
  id: string,
  workspaceId: string,
  lock = false,
): Promise<DatabaseRows[T]> {
  const allowed = [
    'agents',
    'imports',
    'contacts',
    'campaigns',
    'call_attempts',
    'reports',
  ];
  if (!allowed.includes(table)) throw new Error('Invalid repository table');
  const result = await client.query<DatabaseRows[T]>(
    `SELECT * FROM ${table} WHERE id=$1 AND workspace_id=$2${lock ? ' FOR UPDATE' : ''}`,
    [identifier(id), workspaceId],
  );
  if (!result.rowCount)
    throw new DomainError('NOT_FOUND', 'Record not found', 404);
  return result.rows[0];
}
export function pagination(query: Record<string, unknown>): {
  limit: number;
  cursor?: string;
} {
  return parse(PaginationSchema, { limit: query.limit, cursor: query.cursor });
}
export function offsetCursor(cursor?: string): number {
  if (!cursor) return 0;
  if (!/^\d+$/.test(cursor) || Number(cursor) > 1000000)
    throw new DomainError('INVALID_CURSOR', 'Invalid pagination cursor');
  return Number(cursor);
}
export function paged(rows: unknown[], limit: number, offset: number): unknown {
  return {
    items: clean(rows.slice(0, limit)),
    nextCursor: rows.length > limit ? String(offset + limit) : null,
  };
}
export function idempotencyKey(req: Request): string {
  const value = req.get('Idempotency-Key');
  if (!value || !/^[A-Za-z0-9_-]{8,128}$/.test(value))
    throw new DomainError(
      'IDEMPOTENCY_KEY_REQUIRED',
      'Supply an Idempotency-Key of 8–128 letters, digits, hyphens or underscores',
    );
  return value;
}
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.headersSent) {
      this.logger.error('Request failed after response headers were sent');
      if (!response.writableEnded) response.end();
      return;
    }
    if (error instanceof HttpException) {
      const body = error.getResponse();
      response
        .status(error.getStatus())
        .json(
          typeof body === 'object' && 'error' in body
            ? body
            : { error: { code: 'REQUEST_FAILED', message: error.message } },
        );
      return;
    }
    this.logger.error(`Request failed: internal service error: ${error instanceof Error ? error.stack : String(error)}`);
    response.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message:
          'The operation could not be completed; retry or check service health',
      },
    });
  }
}

export type WorkspaceSettings = {
  id: string;
  name: string;
  timezone: string;
  settings: ResolvedSettings;
};
/** The one read of workspace defaults used by settings, campaign creation and direct calls. */
export async function workspaceSettings(
  client: PoolClient | typeof pool,
  workspaceId: string,
): Promise<WorkspaceSettings> {
  const row = (
    await client.query<{
      id: string;
      name: string;
      timezone: string;
      settings: unknown;
    }>('SELECT id,name,timezone,settings FROM workspaces WHERE id=$1', [
      workspaceId,
    ])
  ).rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 'Workspace not found', 404);
  return { ...row, settings: resolveSettings(row.settings) };
}
export function settingsPolicy(
  workspace: WorkspaceSettings,
  overrides: Partial<CampaignPolicy> = {},
): CampaignPolicy {
  return PolicySchema.parse({
    timezone: workspace.timezone,
    windowStart: workspace.settings.callWindowStart,
    windowEnd: workspace.settings.callWindowEnd,
    budgetMinor: workspace.settings.budgetMinor,
    estimatedCostPerCallMinor: workspace.settings.estimatedCostPerCallMinor,
    ...overrides,
  });
}
