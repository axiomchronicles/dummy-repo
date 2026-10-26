import { z } from 'zod';

export const IdSchema = z.uuid();
export const ModeSchema = z.enum(['simulation', 'live']);
export const CampaignStatusSchema = z.enum([
  'draft',
  'planned',
  'running',
  'paused',
  'completed',
  'cancelled',
  'failed',
]);
export const ContactStatusSchema = z.enum([
  'pending',
  'queued',
  'calling',
  'completed',
  'excluded',
  'unknown',
  'cancelled',
]);
export const AttemptStatusSchema = z.enum([
  'created',
  'dispatching',
  'accepted',
  'connected',
  'completed',
  'failed',
  'unknown',
  'cancelled',
]);
export const ImportStatusSchema = z.enum([
  'uploaded',
  'validating',
  'ready',
  'needs_correction',
  'failed',
  'cancelled',
]);
export const AnalysisStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);
export const ReportStatusSchema = AnalysisStatusSchema;
export const OutcomeSchema = z.enum([
  'connected',
  'no_answer',
  'busy',
  'failed',
  'unknown',
  'cancelled',
]);
export const PhoneSchema = z
  .string()
  .regex(
    /^\+[1-9]\d{7,14}$/,
    'Use an E.164 number or select a known source region',
  );
export const TimezoneSchema = z
  .string()
  .max(80)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Invalid IANA timezone');
export const PolicySchema = z.strictObject({
  timezone: TimezoneSchema.default('Asia/Kolkata'),
  windowStart: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('00:00'),
  windowEnd: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .default('23:59'),
  concurrency: z.number().int().min(1).max(10).default(2),
  budgetMinor: z.number().int().min(0).max(10000000).default(10000),
  currency: z.literal('INR').default('INR'),
  estimatedCostPerCallMinor: z.number().int().min(1).max(100000).default(500),
});
export type CampaignPolicy = z.infer<typeof PolicySchema>;
export const DemoSignInSchema = z.strictObject({
  email: z.email().max(200),
  name: z.string().trim().min(1).max(80).optional(),
});
export const AgentInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(1000).default(''),
  prompt: z.string().trim().min(1).max(10000),
  questions: z.array(z.string().min(1).max(300)).max(20).default([]),
  language: z.string().min(1).max(50).default('English'),
});
export const ImportMappingSchema = z.strictObject({
  phone: z.string().min(1).max(100),
  name: z.string().max(100).optional(),
  email: z.string().max(100).optional(),
  consent: z.string().max(100).optional(),
  outcome: z.string().max(100).optional(),
});
export const ImportInputSchema = z.strictObject({
  filename: z
    .string()
    .min(1)
    .max(160)
    .regex(/\.(csv|xlsx)$/i),
  contentBase64: z
    .string()
    .min(1)
    .max(6990508)
    .regex(/^[A-Za-z0-9+/]*={0,2}$/),
  mapping: ImportMappingSchema,
  region: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  synthetic: z.boolean().default(false),
});
export const ImportCorrectionSchema = z.strictObject({
  mapping: ImportMappingSchema.optional(),
  region: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .optional(),
  corrections: z
    .array(
      z.strictObject({
        sourceRow: z.number().int().min(1).max(10001),
        cells: z.record(z.string().max(100), z.string().max(2000)),
      }),
    )
    .max(10000)
    .default([]),
});
export const ImportIssueSchema = z.strictObject({
  code: z.string().max(80),
  message: z.string().max(300),
  column: z.string().max(100).optional(),
  field: z.string().max(100).optional(),
});
export const ImportRowSchema = z.object({
  id: IdSchema,
  sourceRow: z.number().int(),
  sourceCells: z.record(z.string(), z.unknown()),
  normalizedPhone: z.string().nullable(),
  issues: z.array(ImportIssueSchema),
  status: z.string(),
  contactId: IdSchema.nullable(),
});
export const CampaignInputSchema = z.strictObject({
  name: z.string().trim().min(1).max(120),
  objective: z.string().trim().min(3).max(3000),
  importId: IdSchema,
  agentId: IdSchema,
  mode: ModeSchema.default('simulation'),
  policy: PolicySchema.default(() => PolicySchema.parse({})),
});
export const CampaignPatchSchema = CampaignInputSchema.partial();
export const ConfirmLaunchSchema = z.strictObject({
  confirmed: z.literal(true),
});
export const ReportRequestSchema = z.strictObject({
  format: z.enum(['csv', 'xlsx']),
});
export const SuppressionSchema = z.strictObject({
  reason: z.string().trim().min(1).max(300).default('Contact opted out'),
});
export const SettingsSchema = z.strictObject({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: TimezoneSchema.optional(),
  defaultRegion: z
    .string()
    .regex(/^[A-Z]{2}$/)
    .nullable()
    .optional(),
});
export const ModelContentSchema = z.strictObject({
  steps: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(80),
        description: z.string().min(1).max(500),
      }),
    )
    .min(1)
    .max(10),
  questions: z.array(z.string().min(1).max(300)).max(20),
});
export const ModelContentProposalSchema = ModelContentSchema.extend({
  source: z.enum(['local', 'sarvam']),
  model: z.string().max(100).nullable(),
});
export type ModelContent = z.infer<typeof ModelContentSchema>;
export type ModelContentProposal = z.infer<typeof ModelContentProposalSchema>;
export const CampaignPlanSchema = z.strictObject({
  version: z.literal(1),
  planner: z.enum(['deterministic-local', 'sarvam-sdk']),
  model: z.string().max(100).nullable().optional(),
  mode: ModeSchema,
  objective: z.string(),
  agentId: IdSchema,
  agentVersionId: IdSchema,
  eligibleCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
  exclusions: z.array(
    z.strictObject({
      reason: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  steps: z.array(z.strictObject({ name: z.string(), description: z.string() })),
  questions: z.array(z.string()),
  policy: PolicySchema,
  cost: z.strictObject({
    currency: z.literal('INR'),
    estimatedTotalMinor: z.number().int().nonnegative(),
    isEstimate: z.boolean(),
    assumptions: z.array(z.string()),
  }),
  createdAt: z.iso.datetime(),
});
export const JobPayloadSchema = z.strictObject({ id: IdSchema });
export const TranscriptTurnSchema = z.strictObject({
  role: z.enum(['agent', 'user']),
  text: z.string().max(20000),
});
export const NormalizedCallEventSchema = z.strictObject({
  provider: z.enum(['mock', 'sarvam']),
  providerAttemptId: z.string().max(200).nullable(),
  localAttemptId: IdSchema.optional(),
  outcome: OutcomeSchema,
  durationSeconds: z.number().nonnegative().nullable(),
  interactionId: z.string().nullable(),
  failureCode: z.string().nullable(),
  extractedFields: z.record(z.string(), z.unknown()).nullable(),
  transcript: z.array(TranscriptTurnSchema).max(1000).nullable(),
  simulated: z.boolean(),
});
export type NormalizedCallEvent = z.infer<typeof NormalizedCallEventSchema>;
export const SarvamRequestSchema = z.strictObject({
  app_config: z.strictObject({
    app_id: z.string().min(1),
    app_version: z.number().int().min(1),
    connection_config: z.strictObject({
      connection_id: z.string().min(1),
      agent_phone_number: z.string().min(1),
    }),
  }),
  user_config: z.strictObject({ user_phone_number: z.string().min(1) }),
  webhook_config: z
    .strictObject({
      url: z.url(),
      metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .nullable()
    .optional(),
});
export const SarvamResponseSchema = z.object({
  attempt_id: z.string().min(1).max(200),
});
export const SarvamWebhookSchema = z.object({
  attempt_id: z.string().min(1).max(200),
  status: z.enum(['connected', 'no_answer', 'busy', 'failed']),
  channel_info: z.object({
    channel_type: z.enum(['v2v', 'whatsapp']),
    channel_provider: z.string().max(200),
    agent_phone_number: z.string().max(30),
  }),
  duration: z.number().nonnegative().nullable().optional(),
  interaction_id: z.string().max(200).nullable().optional(),
  failure_reason: z.string().max(2000).nullable().optional(),
  final_agent_variables: z
    .record(z.string(), z.unknown())
    .nullable()
    .optional(),
  webhook_config: z
    .object({
      url: z.string().max(2000),
      metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    })
    .nullable()
    .optional(),
  interaction_transcript: z
    .array(
      z.object({
        role: z.enum(['agent', 'user']),
        en_text: z.string().max(20000),
      }),
    )
    .max(1000)
    .nullable()
    .optional(),
});
export const SarvamValidationErrorSchema = z.object({
  detail: z
    .array(
      z.object({
        loc: z.array(z.union([z.string(), z.number().int()])),
        msg: z.string(),
        type: z.string(),
      }),
    )
    .optional(),
});
export const CampaignEventSchema = z.object({
  id: z.string().regex(/^\d+$/),
  workspaceId: IdSchema,
  campaignId: IdSchema,
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});
export const ErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export const PaginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(200).optional(),
});
export type CampaignPlan = z.infer<typeof CampaignPlanSchema>;
export type CampaignInput = z.infer<typeof CampaignInputSchema>;
export type AgentInput = z.infer<typeof AgentInputSchema>;
export type ImportInput = z.infer<typeof ImportInputSchema>;
export type Mode = z.infer<typeof ModeSchema>;

export const transitions = {
  campaign: {
    draft: ['planned', 'cancelled'],
    planned: ['draft', 'running', 'cancelled'],
    running: ['paused', 'completed', 'cancelled', 'failed'],
    paused: ['running', 'completed', 'cancelled'],
    completed: [],
    cancelled: [],
    failed: [],
  },
  contact: {
    pending: ['queued', 'excluded', 'cancelled'],
    queued: ['calling', 'excluded', 'cancelled'],
    calling: ['completed', 'unknown', 'cancelled'],
    completed: [],
    excluded: [],
    unknown: ['completed'],
    cancelled: [],
  },
  attempt: {
    created: ['dispatching', 'cancelled', 'failed'],
    dispatching: ['accepted', 'completed', 'failed', 'unknown'],
    accepted: ['connected', 'completed', 'failed', 'unknown', 'cancelled'],
    connected: ['completed', 'failed', 'unknown', 'cancelled'],
    unknown: ['completed', 'failed', 'cancelled'],
    completed: [],
    failed: [],
    cancelled: [],
  },
  import: {
    uploaded: ['validating', 'cancelled'],
    validating: ['ready', 'needs_correction', 'failed', 'cancelled'],
    needs_correction: ['uploaded', 'validating', 'cancelled'],
    ready: ['uploaded'],
    failed: ['uploaded', 'validating', 'cancelled'],
    cancelled: [],
  },
  analysis: {
    pending: ['processing', 'cancelled'],
    processing: ['completed', 'failed', 'pending'],
    failed: ['pending', 'cancelled'],
    completed: [],
    cancelled: [],
  },
  report: {
    pending: ['processing', 'cancelled'],
    processing: ['completed', 'failed', 'pending'],
    failed: ['pending', 'cancelled'],
    completed: [],
    cancelled: [],
  },
} as const;
export function canTransition(
  entity: keyof typeof transitions,
  from: string,
  to: string,
): boolean {
  const graph = transitions[entity] as Record<string, readonly string[]>;
  return graph[from]?.includes(to) ?? false;
}
export function assertTransition(
  entity: keyof typeof transitions,
  from: string,
  to: string,
): void {
  if (!canTransition(entity, from, to))
    throw new Error(`Invalid ${entity} transition ${from} -> ${to}`);
}
export function isWithinCallingWindow(
  policy: CampaignPolicy,
  now = new Date(),
): boolean {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: policy.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const current = `${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`;
  return policy.windowStart <= policy.windowEnd
    ? current >= policy.windowStart && current <= policy.windowEnd
    : current >= policy.windowStart || current <= policy.windowEnd;
}
export function sanitizeSpreadsheetCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /^[=+\-@＝＋－＠]/.test(text.trimStart()) ||
    (text.length > 0 && text.charCodeAt(0) < 32)
    ? `'${text}`
    : text;
}

const DateSchema = z.iso.datetime();
const RecordSchema = z.record(z.string(), z.unknown());
export const AgentSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,
  name: z.string(),
  description: z.string(),
  currentVersion: z.number().int(),
  createdAt: DateSchema,
  versionId: IdSchema,
  prompt: z.string(),
  questions: z.array(z.string()),
  language: z.string(),
});
export const AgentVersionSchema = z.object({
  id: IdSchema,
  version: z.number().int(),
  prompt: z.string(),
  questions: z.array(z.string()),
  language: z.string(),
  createdAt: DateSchema,
});
export const ImportSchema = z.object({
  id: IdSchema,
  status: ImportStatusSchema,
  filename: z.string(),
  mapping: ImportMappingSchema,
  region: z.string().nullable(),
  rowCount: z.number().int(),
  validCount: z.number().int(),
  errorCount: z.number().int(),
  failureCode: z.string().nullable(),
  createdAt: DateSchema,
  updatedAt: DateSchema,
  synthetic: z.boolean().optional(),
});
export const ContactSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,
  name: z.string(),
  phone: PhoneSchema,
  attributes: RecordSchema,
  consent: z.boolean(),
  synthetic: z.boolean(),
  createdAt: DateSchema,
  suppressionReason: z.string().nullable().optional(),
});
export const CampaignSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,
  name: z.string(),
  objective: z.string(),
  mode: ModeSchema,
  status: CampaignStatusSchema,
  agentVersionId: IdSchema,
  importId: IdSchema,
  policy: PolicySchema,
  plan: CampaignPlanSchema.nullable(),
  launchKey: z.string().nullable(),
  reservedMinor: z.number().int(),
  createdAt: DateSchema,
  updatedAt: DateSchema,
  agentId: IdSchema,
  agentName: z.string(),
  progress: z.record(z.string(), z.number().int()).optional(),
  outcomes: z.record(z.string(), z.number().int()).optional(),
  totalContacts: z.number().int().optional(),
  completedContacts: z.number().int().optional(),
  activeCallsMayContinue: z.boolean().optional(),
});
export const CampaignContactSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,
  campaignId: IdSchema,
  contactId: IdSchema,
  status: ContactStatusSchema,
  reason: z.string().nullable(),
  position: z.number().int(),
  createdAt: DateSchema,
  name: z.string(),
  phone: PhoneSchema,
  synthetic: z.boolean(),
  attemptId: IdSchema.nullable(),
  outcome: OutcomeSchema.nullable(),
  durationSeconds: z.number().nullable(),
  attemptStatus: AttemptStatusSchema.nullable(),
});
export const AnalysisSchema = z.object({
  id: IdSchema,
  status: AnalysisStatusSchema,
  transcript: z.array(TranscriptTurnSchema).nullable(),
  extractedFields: RecordSchema.nullable(),
  summary: z.string().nullable(),
  summarySource: z.enum(['local', 'sarvam-sdk']).optional(),
  summaryModel: z.string().max(100).nullable().optional(),
  summaryFailureCode: z.string().nullable().optional(),
  synthetic: z.boolean(),
  failureCode: z.string().nullable(),
  expiresAt: DateSchema,
  createdAt: DateSchema,
});
export const AttemptSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,
  campaignId: IdSchema,
  campaignContactId: IdSchema,
  provider: z.enum(['mock', 'sarvam']),
  mode: ModeSchema,
  status: AttemptStatusSchema,
  outcome: OutcomeSchema.nullable(),
  agentVersionId: IdSchema,
  startedAt: DateSchema,
  completedAt: DateSchema.nullable(),
  durationSeconds: z.number().nullable(),
  failureCode: z.string().nullable(),
  interactionId: z.string().nullable().optional(),
  estimatedCostMinor: z.number().int().nullable(),
  createdAt: DateSchema,
  analysis: AnalysisSchema.nullable().optional(),
  events: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        payload: RecordSchema,
        createdAt: DateSchema,
      }),
    )
    .optional(),
});
export const ReportSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema.optional(),
  campaignId: IdSchema,
  format: z.enum(['csv', 'xlsx']),
  status: ReportStatusSchema,
  filename: z.string().nullable(),
  contentType: z.string().nullable(),
  rowCount: z.number().int().nullable(),
  failureCode: z.string().nullable(),
  expiresAt: DateSchema,
  createdAt: DateSchema,
  campaignName: z.string().optional(),
});
export const WorkspaceSchema = z.object({
  id: IdSchema,
  name: z.string(),
  timezone: TimezoneSchema,
  settings: RecordSchema,
  createdAt: DateSchema.optional(),
});
export const IdentitySchema = z.object({
  userId: IdSchema,
  workspaceId: IdSchema,
  role: z.enum(['owner', 'operator', 'viewer']),
  email: z.email(),
  name: z.string(),
  workspaceName: z.string(),
  development: z.boolean(),
  workspace: WorkspaceSchema.optional(),
});
export const IntegrationSchema = z.object({
  provider: z.enum(['mock', 'sarvam']),
  simulationReady: z.boolean(),
  liveReady: z.boolean(),
  liveEnabled: z.boolean(),
  missingConfiguration: z.array(z.string()),
  capabilities: z.strictObject({
    termination: z.boolean(),
    recordings: z.boolean(),
  }),
  webhookSecurity: z.string(),
  costNote: z.string(),
  planner: z
    .strictObject({
      provider: z.enum(['local', 'sarvam']),
      configurationReady: z.boolean(),
      model: z.string().nullable(),
      simulationProvider: z.literal('local'),
      requiresLiveCampaign: z.literal(true),
    })
    .optional(),
});
export const AuditSchema = z.object({
  id: z.string(),
  workspaceId: IdSchema,
  actorId: IdSchema.nullable(),
  action: z.string(),
  entityId: z.string(),
  metadata: RecordSchema,
  createdAt: DateSchema,
});
export const OverviewSchema = z.object({
  campaignCount: z.number().int(),
  contactCount: z.number().int(),
  simulationAttempts: z.number().int(),
  liveAttempts: z.number().int(),
  campaignCounts: z.array(
    z.object({
      mode: ModeSchema,
      status: CampaignStatusSchema,
      count: z.number().int(),
    }),
  ),
  contacts: z.object({ total: z.number().int(), consented: z.number().int() }),
  reportCounts: z.array(
    z.object({ status: ReportStatusSchema, count: z.number().int() }),
  ),
  attemptCounts: z.array(
    z.object({
      mode: ModeSchema,
      outcome: OutcomeSchema.nullable(),
      count: z.number().int(),
    }),
  ),
  recentEvents: z.array(CampaignEventSchema),
});
export function ListSchema<T extends z.ZodType>(schema: T) {
  return z.object({
    items: z.array(schema),
    nextCursor: z.string().nullable(),
  });
}
