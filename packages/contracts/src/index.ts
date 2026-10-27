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
    .regex(/\.(csv|xlsx|xls|tsv|txt|vcf)$/i),
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
  planSnapshotHash: z.string().optional(),
  confirmed: z.literal(true),
});
export const ReportRequestSchema = z.strictObject({
  format: z.enum(['csv', 'xlsx']),
});
export const SuppressionSchema = z.strictObject({
  reason: z.string().trim().min(1).max(300).default('Contact opted out'),
});
const ClockSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
export const RegionSchema = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .refine((value) => {
    const name = new Intl.DisplayNames('en', {
      type: 'region',
      fallback: 'none',
    }).of(value);
    return !!name && value !== 'ZZ';
  }, 'Use an ISO-3166 alpha-2 region');
const BudgetSchema = z.number().int().min(0).max(10000000);
const CallCostSchema = z.number().int().min(1).max(100000);
export const SettingsSchema = z.strictObject({
  name: z.string().trim().min(1).max(100).optional(),
  timezone: TimezoneSchema.optional(),
  defaultRegion: RegionSchema.nullable().optional(),
  defaultAgentId: IdSchema.nullable().optional(),
  callWindowStart: ClockSchema.optional(),
  callWindowEnd: ClockSchema.optional(),
  budgetMinor: BudgetSchema.optional(),
  estimatedCostPerCallMinor: CallCostSchema.optional(),
});
export const ResolvedSettingsSchema = z.object({
  defaultRegion: z.string().nullable(),
  defaultAgentId: IdSchema.nullable(),
  callWindowStart: ClockSchema,
  callWindowEnd: ClockSchema,
  budgetMinor: z.number().int(),
  estimatedCostPerCallMinor: z.number().int(),
  currency: z.literal('INR'),
});
export type ResolvedSettings = z.infer<typeof ResolvedSettingsSchema>;
/** Stored workspace settings with PolicySchema defaults for anything unset or invalid. */
export function resolveSettings(stored: unknown): ResolvedSettings {
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<
    string,
    unknown
  >;
  const policy = PolicySchema.parse({});
  const pick = <T>(schema: z.ZodType<T>, value: unknown, fallback: T): T => {
    const result = schema.safeParse(value);
    return result.success ? result.data : fallback;
  };
  const start = pick(ClockSchema, raw.callWindowStart, policy.windowStart);
  const end = pick(ClockSchema, raw.callWindowEnd, policy.windowEnd);
  const ordered = start < end;
  return {
    defaultRegion: pick(RegionSchema.nullable(), raw.defaultRegion, null),
    defaultAgentId: pick(IdSchema.nullable(), raw.defaultAgentId, null),
    callWindowStart: ordered ? start : policy.windowStart,
    callWindowEnd: ordered ? end : policy.windowEnd,
    budgetMinor: pick(BudgetSchema, raw.budgetMinor, policy.budgetMinor),
    estimatedCostPerCallMinor: pick(
      CallCostSchema,
      raw.estimatedCostPerCallMinor,
      policy.estimatedCostPerCallMinor,
    ),
    currency: 'INR',
  };
}
export const WorkspaceSettingsSchema = z.object({
  id: IdSchema,
  name: z.string(),
  timezone: TimezoneSchema,
  settings: ResolvedSettingsSchema,
  role: z.enum(['owner', 'operator', 'viewer']),
});
export const ProfileUpdateSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
});
export const UserSessionListSchema = z.object({
  items: z.array(
    z.object({
      id: IdSchema,
      createdAt: z.iso.datetime(),
      expiresAt: z.iso.datetime(),
      current: z.boolean(),
    }),
  ),
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
  source: z.enum(['local', 'sarvam', 'openai', 'anthropic']),
  model: z.string().max(100).nullable(),
});
export type ModelContent = z.infer<typeof ModelContentSchema>;
export type ModelContentProposal = z.infer<typeof ModelContentProposalSchema>;
export const CampaignPlanSchema = z.strictObject({
  version: z.literal(1),
  planner: z.enum([
    'deterministic-local',
    'sarvam-sdk',
    'openai',
    'openai-compatible',
    'anthropic',
  ]),
  model: z.string().max(100).nullable().optional(),
  mode: ModeSchema,
  objective: z.string(),
  agentId: IdSchema,
  agentVersionId: IdSchema,
  target: z.record(z.string(), z.unknown()).optional(),
  recipientFingerprint: z.string().optional(),
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
    agent_variables: z.record(z.string(), z.unknown()).optional(),
    app_overrides: z
      .strictObject({
        initial_bot_message: z.string().nullable().optional(),
        initial_state_name: z.string().nullable().optional(),
        initial_language_name: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
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
export const DisplayPhoneSchema = z.union([
  PhoneSchema,
  z.string().regex(/^•+\d{4}$/),
]);
export const ContactSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,
  name: z.string(),
  phone: DisplayPhoneSchema,
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
  /** Set when a stored plan no longer matches the plan contract; plan is then null and must be re-planned. */
  planIssue: z.literal('LEGACY_PLAN_INVALID').optional(),
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
  phone: DisplayPhoneSchema,
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
  summarySource: z
    .enum(['local', 'sarvam-sdk', 'openai', 'openai-compatible', 'anthropic'])
    .optional(),
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
  artifacts: z
    .object({
      transcriptStatus: z.string(),
      recordingStatus: z.string(),
      updatedAt: DateSchema,
      failureCode: z.string().nullable(),
    })
    .nullable()
    .optional(),
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
  mfaEnabled: z.boolean(),
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
      provider: z.enum([
        'local',
        'sarvam',
        'openai',
        'openai-compatible',
        'anthropic',
      ]),
      configurationReady: z.boolean(),
      model: z.string().nullable(),
      simulationProvider: z.enum([
        'local',
        'sarvam',
        'openai',
        'openai-compatible',
        'anthropic',
      ]),
      requiresLiveCampaign: z.boolean(),
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

// ── V3 Rebuild Schemas ──────────────────────────────────────────────────────────

export const UserStatusSchema = z.enum([
  'invited',
  'active',
  'disabled',
  'locked',
]);
export type UserStatus = z.infer<typeof UserStatusSchema>;

export const UserRoleSchema = z.enum([
  'superadmin',
  'admin',
  'operator',
  'viewer',
  'owner',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const LoginRequestSchema = z.strictObject({
  email: z.string().email().max(200),
  password: z.string().min(8).max(128).optional(),
  googleIdToken: z.string().max(4096).optional(),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const MfaChallengeResponseSchema = z.strictObject({
  mfaRequired: z.literal(true),
  mfaToken: z.string(),
  enrolled: z.boolean(),
});
export type MfaChallengeResponse = z.infer<typeof MfaChallengeResponseSchema>;

export const MfaVerifyRequestSchema = z.strictObject({
  mfaToken: z.string(),
  code: z.string().trim().min(6).max(16),
  isRecoveryCode: z.boolean().default(false),
});
export type MfaVerifyRequest = z.infer<typeof MfaVerifyRequestSchema>;

export const AuthSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  user: z.object({
    id: IdSchema,
    email: z.string().email(),
    name: z.string(),
    role: UserRoleSchema,
    workspaceId: IdSchema,
    mfaEnabled: z.boolean().optional(),
  }),
  workspace: z
    .object({
      id: IdSchema,
      name: z.string(),
    })
    .optional(),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

export const MfaEnrollResponseSchema = z.strictObject({
  secret: z.string(),
  qrCodeUri: z.string(),
  recoveryCodes: z.array(z.string()),
});
export type MfaEnrollResponse = z.infer<typeof MfaEnrollResponseSchema>;

export const UserInviteRequestSchema = z.strictObject({
  email: z.string().email().max(200),
  name: z.string().trim().min(1).max(100),
  role: z.enum(['admin', 'operator', 'viewer']).default('operator'),
});
export type UserInviteRequest = z.infer<typeof UserInviteRequestSchema>;

export const AdminUserSchema = z.object({
  id: IdSchema,
  email: z.string().email(),
  name: z.string(),
  role: UserRoleSchema,
  status: UserStatusSchema,
  mfaEnabled: z.boolean(),
  createdAt: DateSchema,
});
export type AdminUser = z.infer<typeof AdminUserSchema>;

export const KillSwitchRequestSchema = z.strictObject({
  active: z.boolean(),
  reason: z.string().trim().min(3).max(500),
});
export type KillSwitchRequest = z.infer<typeof KillSwitchRequestSchema>;

export const ChatThreadSchema = z.object({
  id: IdSchema,
  workspaceId: IdSchema,
  userId: IdSchema,
  title: z.string(),
  campaignId: IdSchema.nullable().optional(),
  messageCount: z.number().optional(),
  createdAt: DateSchema,
  updatedAt: DateSchema,
});
export type ChatThread = z.infer<typeof ChatThreadSchema>;

export const ChatMessageSchema = z.object({
  id: IdSchema,
  threadId: IdSchema,
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  attachments: z.array(z.unknown()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: DateSchema,
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatThreadSearchSchema = z.string().trim().max(100).optional();
export const RenameChatThreadRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
});
export type RenameChatThreadRequest = z.infer<
  typeof RenameChatThreadRequestSchema
>;
export const ChatFeedbackRequestSchema = z.strictObject({
  rating: z.enum(['up', 'down']).nullable(),
  reason: z.string().trim().max(500).optional(),
});
export type ChatFeedbackRequest = z.infer<typeof ChatFeedbackRequestSchema>;
/** Stored at chat_messages.metadata.feedback; absent when cleared. */
export const ChatFeedbackSchema = z.object({
  rating: z.enum(['up', 'down']),
  reason: z.string().optional(),
  at: DateSchema,
});
/** SSE `thread.updated` payload, emitted right after `user_message` when a thread is auto-titled. */
export const ChatThreadUpdatedEventSchema = z.object({
  id: IdSchema,
  title: z.string(),
});
export type ChatThreadUpdatedEvent = z.infer<
  typeof ChatThreadUpdatedEventSchema
>;
/** Every event name the chat stream emits (POST /chat/threads/{id}/stream). */
export const ChatStreamEventSchema = z.enum([
  'user_message',
  'thread.updated',
  'tool.started',
  'tool.result',
  'draft',
  'operation.updated',
  'delta',
  'done',
  'error',
  'reconnect',
]);
export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;

export const SendMessageRequestSchema = z.strictObject({
  content: z.string().trim().min(1).max(5000),
  attachmentIds: z.array(IdSchema).default([]),
  agentId: IdSchema.optional(),
});
export type SendMessageRequest = z.infer<typeof SendMessageRequestSchema>;

export const ConfirmCampaignRequestSchema = z.strictObject({
  planSnapshotHash: z.string().min(16).max(128),
  executionMode: ModeSchema.default('simulation'),
  scheduledAt: DateSchema.optional(),
});
export type ConfirmCampaignRequest = z.infer<
  typeof ConfirmCampaignRequestSchema
>;

export { readSse, type ServerEvent } from './sse';
export const CallTargetSchema = z.strictObject({
  contactId: IdSchema,
  name: z.string(),
  destinationMasked: z.string(),
  callerIdMasked: z.string().nullable(),
  timezone: TimezoneSchema,
  eventDate: z.string().nullable(),
  scheduledAt: z.string().nullable(),
  language: z.string(),
  voiceId: z.string().nullable(),
  voiceModel: z.string().nullable(),
  providerFingerprint: z.string().nullable(),
  providerAppId: z.string().nullable(),
  providerAppVersion: z.number().int().positive().nullable(),
  recordingNotice: z.string(),
  blockers: z.array(z.string()),
});
export const ChatDraftSchema = z.object({
  campaignId: IdSchema,
  objective: z.string(),
  mode: ModeSchema,
  eligibleCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
  planSnapshotHash: z.string(),
  agentName: z.string(),
  agentLanguage: z.string(),
  agentVersionId: IdSchema,
  target: CallTargetSchema.nullable(),
  steps: z.array(z.string()),
  questions: z.array(z.string()),
  estimatedCostMinor: z.number().int().nonnegative(),
});
export type ChatDraft = z.infer<typeof ChatDraftSchema>;
export {
  normalizeDestination,
  maskDestination,
  recipientBlockers,
  type RecipientFacts,
} from './recipient';
export const ProviderBindingInputSchema = z.strictObject({
  readArguments: z.record(z.string(), z.unknown()),
  fields: z.strictObject({
    appId: z.string(),
    version: z.string(),
    prompt: z.string(),
    voiceId: z.string(),
    voiceModel: z.string(),
    language: z.string(),
    objectiveVariable: z.string(),
    objectiveInContext: z.string(),
  }),
});
export const ProviderBindingFactsSchema = z.strictObject({
  appId: z.string().min(1),
  version: z.number().int().positive(),
  prompt: z.string().min(1),
  voiceId: z.string().min(1),
  voiceModel: z.string().min(1),
  language: z.string().min(1),
  objectiveVariable: z.literal('objective'),
  objectiveInContext: z.literal(true),
});
export * from './voices';

/** Chat tool execution modes. Live telephony is never a model-executable mode. */
export const ToolExecutionModeSchema = z.enum([
  'read',
  'draft',
  'simulation',
  'side_effect',
]);
export type ToolExecutionMode = z.infer<typeof ToolExecutionModeSchema>;
export const ToolErrorCategorySchema = z.enum([
  'validation',
  'consent/policy',
  'configuration',
  'auth',
  'rate limit',
  'provider',
  'timeout',
  'unavailable artifact',
  'internal',
]);
export type ToolErrorCategory = z.infer<typeof ToolErrorCategorySchema>;

/** Operator-facing call state. Provider acceptance (ringing) is not a connected conversation. */
export const CallStateSchema = z.enum([
  'queued',
  'dialing',
  'ringing',
  'connected',
  'no_answer',
  'busy',
  'failed',
  'cancelled',
  'completed',
  'unknown',
]);
export type CallState = z.infer<typeof CallStateSchema>;
export function callState(
  attempt: { status: string; outcome: string | null } | null | undefined,
): CallState {
  if (!attempt || attempt.status === 'created') return 'queued';
  switch (attempt.status) {
    case 'dispatching':
      return 'dialing';
    case 'accepted':
      return 'ringing';
    case 'connected':
      return 'connected';
    case 'cancelled':
      return 'cancelled';
    case 'unknown':
      return 'unknown';
  }
  switch (attempt.outcome) {
    case 'connected':
      return 'completed';
    case 'no_answer':
    case 'busy':
    case 'cancelled':
    case 'unknown':
      return attempt.outcome;
    default:
      return 'failed';
  }
}
/** Only a connected conversation may carry a transcript, recording or summary. */
export function hadConversation(state: CallState): boolean {
  return state === 'connected' || state === 'completed';
}

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];
const MONTH = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
/** Extracts an explicit calendar date (no relative-date guessing). Returns YYYY-MM-DD or null. */
export function extractEventDate(text: string): string | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const dayFirst = text.match(
    new RegExp(
      `\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH},?\\s+(\\d{4})\\b`,
      'i',
    ),
  );
  const monthFirst = text.match(
    new RegExp(
      `\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`,
      'i',
    ),
  );
  const [y, m, d] = iso
    ? [+iso[1]!, +iso[2]!, +iso[3]!]
    : dayFirst
      ? [
          +dayFirst[3]!,
          MONTHS.indexOf(dayFirst[2]!.toLowerCase()) + 1,
          +dayFirst[1]!,
        ]
      : monthFirst
        ? [
            +monthFirst[3]!,
            MONTHS.indexOf(monthFirst[1]!.toLowerCase()) + 1,
            +monthFirst[2]!,
          ]
        : [0, 0, 0];
  if (!y) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}
