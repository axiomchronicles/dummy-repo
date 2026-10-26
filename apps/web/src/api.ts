import { z } from 'zod';
import {
  AgentSchema,
  AttemptSchema,
  AuditSchema,
  CampaignContactSchema,
  CampaignEventSchema,
  CampaignSchema,
  ContactSchema,
  IdentitySchema,
  ImportRowSchema,
  ImportSchema,
  IntegrationSchema,
  OverviewSchema,
  ReportSchema,
  WorkspaceSchema,
  type CampaignPlan,
  type CampaignPolicy,
  type Mode as SharedMode,
} from '@outreach/contracts';
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      body?.error?.code || 'REQUEST_FAILED',
      body?.error?.message || 'The request could not be completed.',
      body?.error?.details,
    );
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const command = <T>(
  path: string,
  body: unknown = {},
  idempotent = false,
  method = 'POST',
) =>
  api<T>(path, {
    method,
    body: JSON.stringify(body),
    headers: idempotent ? { 'Idempotency-Key': crypto.randomUUID() } : {},
  });

export type Page<T> = { items: T[]; nextCursor: string | null };
export type Mode = SharedMode;
export type Workspace = z.infer<typeof WorkspaceSchema>;
export type Identity = z.infer<typeof IdentitySchema> & {
  workspace: Workspace;
};
export type Agent = z.infer<typeof AgentSchema>;
export type ImportRow = z.infer<typeof ImportRowSchema>;
export type ContactImport = z.infer<typeof ImportSchema>;
export type Policy = CampaignPolicy;
export type Plan = CampaignPlan;
export type Campaign = z.infer<typeof CampaignSchema>;
export type Attempt = z.infer<typeof AttemptSchema>;
export type CampaignContact = z.infer<typeof CampaignContactSchema>;
export type EventRecord = Pick<
  z.infer<typeof CampaignEventSchema>,
  'id' | 'createdAt'
> &
  Partial<z.infer<typeof CampaignEventSchema> & z.infer<typeof AuditSchema>>;
export type Report = z.infer<typeof ReportSchema>;
export type Contact = z.infer<typeof ContactSchema>;
export type OverviewData = z.infer<typeof OverviewSchema>;
export type IntegrationStatus = z.infer<typeof IntegrationSchema>;

export const label = (value: string | undefined | null) =>
  value
    ? value.replace(/[_-]/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
    : 'Unknown';
export const date = (value?: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(value))
    : '—';
export const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
