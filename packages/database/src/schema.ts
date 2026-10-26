import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  bigint,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
  primaryKey,
  foreignKey,
  check,
  customType,
} from 'drizzle-orm/pg-core';

const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});
const id = () => uuid('id').defaultRandom().primaryKey();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).defaultNow().notNull();
const workspaceId = () =>
  uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id);
export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});
export const workspaces = pgTable('workspaces', {
  id: id(),
  name: text('name').notNull(),
  timezone: text('timezone').notNull().default('UTC'),
  settings: jsonb('settings')
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: createdAt(),
});
export const memberships = pgTable(
  'memberships',
  {
    workspaceId: workspaceId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull().default('owner'),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    check('membership_role', sql`${t.role} IN ('owner','operator','viewer')`),
  ],
);
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    workspaceId: workspaceId(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_idx_1').on(t.expiresAt)],
);
export const agents = pgTable(
  'agents',
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    currentVersion: integer('current_version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    unique('agents_idx_1').on(t.workspaceId, t.id),
    index('agents_idx_2').on(t.workspaceId, t.createdAt, t.id),
  ],
);
export const agentVersions = pgTable(
  'agent_versions',
  {
    id: id(),
    workspaceId: workspaceId(),
    agentId: uuid('agent_id').notNull(),
    version: integer('version').notNull(),
    instructions: text('instructions').notNull(),
    language: text('language').notNull().default('English'),
    questions: jsonb('questions').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [
    unique('agent_versions_idx_1').on(t.workspaceId, t.id),
    unique('agent_versions_idx_2').on(t.agentId, t.version),
    foreignKey({
      columns: [t.workspaceId, t.agentId],
      foreignColumns: [agents.workspaceId, agents.id],
    }),
    check('agent_version_positive', sql`${t.version}>0`),
  ],
);
export const imports = pgTable(
  'imports',
  {
    id: id(),
    workspaceId: workspaceId(),
    status: text('status').notNull().default('uploaded'),
    synthetic: boolean('synthetic').notNull().default(false),
    filename: text('filename').notNull(),
    mediaType: text('media_type').notNull(),
    sourceBytes: bytes('source_bytes').notNull(),
    mapping: jsonb('mapping').$type<Record<string, string>>().notNull(),
    region: text('region'),
    corrections: jsonb('corrections')
      .$type<Record<string, Record<string, string>>>()
      .notNull()
      .default({}),
    rowCount: integer('row_count').notNull().default(0),
    validCount: integer('valid_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    failureCode: text('failure_code'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('imports_idx_1').on(t.workspaceId, t.id),
    index('imports_idx_2').on(t.workspaceId, t.createdAt, t.id),
    check('import_limit', sql`octet_length(${t.sourceBytes})<=5242880`),
    check(
      'imports_status_allowed',
      sql`${t.status} IN ('uploaded','validating','ready','needs_correction','failed','cancelled')`,
    ),
  ],
);
export const contacts = pgTable(
  'contacts',
  {
    id: id(),
    workspaceId: workspaceId(),
    phone: text('phone').notNull(),
    name: text('name').notNull(),
    attributes: jsonb('attributes')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    consent: boolean('consent').notNull().default(false),
    synthetic: boolean('synthetic').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique('contacts_idx_1').on(t.workspaceId, t.id),
    unique('contacts_idx_2').on(t.workspaceId, t.phone),
    check('phone_e164', sql`${t.phone} ~ '^\\+[1-9][0-9]{7,14}$'`),
  ],
);
export const importRows = pgTable(
  'import_rows',
  {
    id: id(),
    workspaceId: workspaceId(),
    importId: uuid('import_id').notNull(),
    sourceRow: integer('source_row').notNull(),
    sourceCells: jsonb('source_cells')
      .$type<Record<string, string>>()
      .notNull(),
    normalizedPhone: text('normalized_phone'),
    issues: jsonb('issues')
      .$type<{ code: string; message: string; field?: string }[]>()
      .notNull()
      .default([]),
    status: text('status').notNull(),
    contactId: uuid('contact_id'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('import_rows_idx_1').on(t.importId, t.sourceRow),
    foreignKey({
      columns: [t.workspaceId, t.importId],
      foreignColumns: [imports.workspaceId, imports.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }),
    index('import_rows_idx_2').on(t.importId, t.sourceRow),
    check(
      'import_rows_status_allowed',
      sql`${t.status} IN ('valid','invalid','excluded','duplicate')`,
    ),
  ],
);
export const consentRecords = pgTable(
  'consent_records',
  {
    id: id(),
    workspaceId: workspaceId(),
    contactId: uuid('contact_id').notNull(),
    granted: boolean('granted').notNull(),
    source: text('source').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }),
    index('consent_records_idx_1').on(t.workspaceId, t.contactId, t.createdAt),
  ],
);
export const suppressions = pgTable(
  'suppressions',
  {
    id: id(),
    workspaceId: workspaceId(),
    phone: text('phone').notNull(),
    reason: text('reason').notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique('suppressions_idx_1').on(t.workspaceId, t.phone)],
);
export const campaigns = pgTable(
  'campaigns',
  {
    id: id(),
    workspaceId: workspaceId(),
    name: text('name').notNull(),
    objective: text('objective').notNull(),
    mode: text('mode').notNull().default('simulation'),
    status: text('status').notNull().default('draft'),
    agentVersionId: uuid('agent_version_id').notNull(),
    importId: uuid('import_id').notNull(),
    policy: jsonb('policy').$type<Record<string, unknown>>().notNull(),
    plan: jsonb('plan').$type<Record<string, unknown>>(),
    launchKey: text('launch_key'),
    reservedMinor: integer('reserved_minor').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique('campaigns_idx_1').on(t.workspaceId, t.id),
    index('campaigns_idx_2').on(t.workspaceId, t.createdAt, t.id),
    foreignKey({
      columns: [t.workspaceId, t.agentVersionId],
      foreignColumns: [agentVersions.workspaceId, agentVersions.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.importId],
      foreignColumns: [imports.workspaceId, imports.id],
    }),
    check('campaign_mode', sql`${t.mode} IN ('simulation','live')`),
    check('campaign_reservation', sql`${t.reservedMinor}>=0`),
    check(
      'campaigns_status_allowed',
      sql`${t.status} IN ('draft','planned','running','paused','completed','cancelled','failed')`,
    ),
  ],
);
export const campaignContacts = pgTable(
  'campaign_contacts',
  {
    id: id(),
    workspaceId: workspaceId(),
    campaignId: uuid('campaign_id').notNull(),
    contactId: uuid('contact_id').notNull(),
    status: text('status').notNull().default('pending'),
    reason: text('reason'),
    position: integer('position').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('campaign_contacts_idx_1').on(t.workspaceId, t.id),
    unique('campaign_contacts_idx_2').on(t.campaignId, t.contactId),
    foreignKey({
      columns: [t.workspaceId, t.campaignId],
      foreignColumns: [campaigns.workspaceId, campaigns.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.contactId],
      foreignColumns: [contacts.workspaceId, contacts.id],
    }),
    index('campaign_contacts_idx_3').on(t.campaignId, t.status, t.position),
    check(
      'campaign_contacts_status_allowed',
      sql`${t.status} IN ('pending','queued','calling','completed','excluded','unknown','cancelled')`,
    ),
  ],
);
export const callAttempts = pgTable(
  'call_attempts',
  {
    id: id(),
    workspaceId: workspaceId(),
    campaignId: uuid('campaign_id').notNull(),
    campaignContactId: uuid('campaign_contact_id').notNull().unique(),
    provider: text('provider').notNull(),
    mode: text('mode').notNull(),
    status: text('status').notNull().default('created'),
    outcome: text('outcome'),
    providerAttemptId: text('provider_attempt_id'),
    agentVersionId: uuid('agent_version_id').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    durationSeconds: doublePrecision('duration_seconds'),
    providerConfig: jsonb('provider_config').$type<{
      appId: string;
      appVersion: number;
      connectionId: string;
      orgId?: string;
      workspaceId?: string;
    }>(),
    failureCode: text('failure_code'),
    interactionId: text('interaction_id'),
    estimatedCostMinor: integer('estimated_cost_minor').default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique('call_attempts_idx_1').on(t.workspaceId, t.id),
    unique('call_attempts_idx_2').on(t.provider, t.providerAttemptId),
    foreignKey({
      columns: [t.workspaceId, t.campaignId],
      foreignColumns: [campaigns.workspaceId, campaigns.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.campaignContactId],
      foreignColumns: [campaignContacts.workspaceId, campaignContacts.id],
    }),
    foreignKey({
      columns: [t.workspaceId, t.agentVersionId],
      foreignColumns: [agentVersions.workspaceId, agentVersions.id],
    }),
    index('call_attempts_idx_3').on(t.campaignId, t.status),
    index('call_attempts_idx_4').on(t.workspaceId, t.startedAt, t.id),
    check(
      'call_attempts_status_allowed',
      sql`${t.status} IN ('created','dispatching','accepted','connected','completed','failed','unknown','cancelled')`,
    ),
    check(
      'call_attempts_provider_allowed',
      sql`${t.provider} IN ('mock','sarvam')`,
    ),
    check(
      'call_attempts_mode_allowed',
      sql`${t.mode} IN ('simulation','live')`,
    ),
    check(
      'call_attempts_outcome_allowed',
      sql`${t.outcome} IN ('connected','no_answer','busy','failed','unknown','cancelled')`,
    ),
  ],
);
export const analyses = pgTable(
  'analyses',
  {
    id: id(),
    workspaceId: workspaceId(),
    callAttemptId: uuid('call_attempt_id').notNull().unique(),
    status: text('status').notNull().default('pending'),
    transcript: jsonb('transcript').$type<{ role: string; text: string }[]>(),
    extractedFields: jsonb('extracted_fields').$type<Record<string, unknown>>(),
    summary: text('summary'),
    summarySource: text('summary_source').notNull().default('local'),
    summaryModel: text('summary_model'),
    summaryFailureCode: text('summary_failure_code'),
    processingStartedAt: timestamp('processing_started_at', {
      withTimezone: true,
    }),
    processingToken: uuid('processing_token'),
    synthetic: boolean('synthetic').notNull(),
    failureCode: text('failure_code'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.callAttemptId],
      foreignColumns: [callAttempts.workspaceId, callAttempts.id],
    }),
    check(
      'analyses_status_allowed',
      sql`${t.status} IN ('pending','processing','completed','failed','cancelled')`,
    ),
    check(
      'analyses_summary_source_allowed',
      sql`${t.summarySource} IN ('local','sarvam-sdk')`,
    ),
  ],
);
export const webhookInbox = pgTable(
  'webhook_inbox',
  {
    id: id(),
    workspaceId: workspaceId(),
    provider: text('provider').notNull(),
    providerAttemptId: text('provider_attempt_id').notNull(),
    localAttemptId: uuid('local_attempt_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status').notNull().default('pending'),
    receivedAt: createdAt(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    failureCode: text('failure_code'),
  },
  (t) => [
    unique('webhook_inbox_idx_1').on(t.provider, t.providerAttemptId),
    foreignKey({
      columns: [t.workspaceId, t.localAttemptId],
      foreignColumns: [callAttempts.workspaceId, callAttempts.id],
    }),
    index('webhook_inbox_idx_2').on(t.status, t.receivedAt),
    check(
      'webhook_inbox_status_allowed',
      sql`${t.status} IN ('pending','completed','failed')`,
    ),
  ],
);
export const outbox = pgTable(
  'outbox',
  {
    id: id(),
    workspaceId: workspaceId(),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<{ id: string }>().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: createdAt(),
    availableAt: timestamp('available_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('outbox_idx_1').on(t.publishedAt, t.availableAt)],
);
export const campaignEvents = pgTable(
  'campaign_events',
  {
    id: bigint('id', { mode: 'bigint' })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    workspaceId: workspaceId(),
    campaignId: uuid('campaign_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.campaignId],
      foreignColumns: [campaigns.workspaceId, campaigns.id],
    }),
    index('campaign_events_idx_1').on(t.campaignId, t.id),
    index('campaign_events_idx_2').on(t.workspaceId, t.id),
  ],
);
export const attemptEvents = pgTable(
  'attempt_events',
  {
    id: bigint('id', { mode: 'bigint' })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    workspaceId: workspaceId(),
    callAttemptId: uuid('call_attempt_id').notNull(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.workspaceId, t.callAttemptId],
      foreignColumns: [callAttempts.workspaceId, callAttempts.id],
    }),
    index('attempt_events_idx_1').on(t.callAttemptId, t.id),
  ],
);
export const reports = pgTable(
  'reports',
  {
    id: id(),
    workspaceId: workspaceId(),
    campaignId: uuid('campaign_id').notNull(),
    format: text('format').notNull(),
    status: text('status').notNull().default('pending'),
    requestKey: text('request_key').notNull(),
    filename: text('filename'),
    contentType: text('content_type'),
    artifact: bytes('artifact'),
    rowCount: integer('row_count'),
    failureCode: text('failure_code'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('reports_idx_1').on(t.workspaceId, t.requestKey),
    foreignKey({
      columns: [t.workspaceId, t.campaignId],
      foreignColumns: [campaigns.workspaceId, campaigns.id],
    }),
    index('reports_idx_2').on(t.workspaceId, t.createdAt, t.id),
    check(
      'report_artifact_limit',
      sql`${t.artifact} IS NULL OR octet_length(${t.artifact})<=20971520`,
    ),
    check(
      'reports_status_allowed',
      sql`${t.status} IN ('pending','processing','completed','failed','cancelled')`,
    ),
    check('reports_format_allowed', sql`${t.format} IN ('csv','xlsx')`),
  ],
);
export const usageLedger = pgTable(
  'usage_ledger',
  {
    id: id(),
    workspaceId: workspaceId(),
    callAttemptId: uuid('call_attempt_id').notNull(),
    mode: text('mode').notNull(),
    kind: text('kind').notNull(),
    amountMinor: integer('amount_minor').notNull(),
    currency: text('currency').notNull().default('INR'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('usage_ledger_idx_1').on(t.callAttemptId, t.kind),
    foreignKey({
      columns: [t.workspaceId, t.callAttemptId],
      foreignColumns: [callAttempts.workspaceId, callAttempts.id],
    }),
    check('usage_nonnegative', sql`${t.amountMinor}>=0`),
    check('usage_ledger_mode_allowed', sql`${t.mode} IN ('simulation','live')`),
    check(
      'usage_ledger_kind_allowed',
      sql`${t.kind} IN ('reservation','estimated','verified')`,
    ),
  ],
);
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint('id', { mode: 'bigint' })
      .generatedAlwaysAsIdentity()
      .primaryKey(),
    workspaceId: workspaceId(),
    actorId: uuid('actor_id').references(() => users.id),
    action: text('action').notNull(),
    entityId: text('entity_id').notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_idx_1').on(t.workspaceId, t.id)],
);
