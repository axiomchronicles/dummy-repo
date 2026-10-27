import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getProviderBinding, pool } from '@outreach/database';
import {
  CallTargetSchema,
  ChatDraftSchema,
  ModeSchema,
  TranscriptTurnSchema,
  VoiceSelectionSchema,
  CallStateSchema,
  ToolErrorCategorySchema,
  callState,
  hadConversation,
  maskDestination,
  type ToolExecutionMode,
  type ToolErrorCategory,
} from '@outreach/contracts';
import { liveConfigurationIssues } from '@outreach/config';
import { config } from './auth';
import {
  resolveContact,
  contactFacts,
  eligibility,
  safeContact,
} from './recipients';
import { planSnapshotHash } from './planning';
import { DomainError, requireWrite, type SessionIdentity } from './common';
import type { CampaignsService } from './campaigns';

const PHONE = /(?:\+?\d[\d ()-]{7,}\d|\b\d{10,15}\b)/;
const ContactQuery = z.strictObject({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  contactId: z.uuid().optional(),
});
const ContactResult = z.object({
  contactId: z.uuid(),
  name: z.string(),
  destinationMasked: z.string(),
  eligible: z.boolean(),
  blockers: z.array(z.string()),
  consent: z.object({
    granted: z.boolean(),
    source: z.string().nullable(),
    scope: z.string().nullable(),
    recordedAt: z.string().nullable(),
  }),
});
const Empty = z.strictObject({});
const Campaign = z.strictObject({ campaignId: z.uuid() });
const Readiness = z.object({
  ready: z.boolean(),
  blockers: z.array(z.string()),
  callerIdMasked: z.string().nullable(),
});
const Artifacts = z.object({
  attemptId: z.uuid(),
  operationId: z.uuid(),
  mode: ModeSchema,
  attemptStatus: z.string(),
  state: CallStateSchema,
  disposition: z.string().nullable(),
  conversation: z.boolean(),
  transcriptStatus: z.enum(['available', 'processing', 'unavailable']),
  transcript: z.array(TranscriptTurnSchema),
  recordingStatus: z.enum(['available', 'processing', 'unavailable']),
  summaryStatus: z.string(),
  summary: z.string().nullable(),
  simulated: z.boolean(),
});
const Preview = z.object({
  operationId: z.uuid(),
  mode: ModeSchema,
  status: z.string(),
  planSnapshotHash: z.string(),
  eligibleCount: z.number().int().nonnegative(),
  excludedCount: z.number().int().nonnegative(),
  targets: z.array(
    z.object({
      contactId: z.uuid(),
      name: z.string(),
      destinationMasked: z.string(),
      eligible: z.boolean(),
      reasons: z.array(z.string()),
    }),
  ),
  destinationRole: z.literal('recipient'),
  callerIdRole: z.literal('outbound_caller_id'),
  callerIdMasked: z.string().nullable(),
  providerReady: z.boolean(),
  provider: z.enum(['mock', 'sarvam']),
  blockers: z.array(z.string()),
  confirmationRequired: z.boolean(),
});
export type ToolDefinition = {
  description: string;
  schema: z.ZodType;
  output: z.ZodType;
  mode: ToolExecutionMode;
  execute: (args: unknown) => Promise<unknown>;
};
function define<I extends z.ZodType, O extends z.ZodType>(
  description: string,
  schema: I,
  output: O,
  mode: ToolExecutionMode,
  execute: (input: z.infer<I>) => Promise<z.infer<O>>,
): ToolDefinition {
  return {
    description,
    schema,
    output,
    mode,
    execute: (args) => execute(schema.parse(args)),
  };
}
/** Audit copy: destinations masked, conversation text replaced by a count. */
export function redact(value: unknown, key = ''): unknown {
  if (typeof value === 'string')
    return value.replace(new RegExp(PHONE.source, 'g'), (m) =>
      maskDestination(m.replace(/[^\d+]/g, '')),
    );
  if (Array.isArray(value))
    return /transcript|segments/i.test(key)
      ? { redactedItems: value.length }
      : value.map((item) => redact(item));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /summary|objective/i.test(k) && typeof v === 'string'
          ? `[redacted ${v.length} chars]`
          : redact(v, k),
      ]),
    );
  return value;
}
/** Idempotency key for chat-initiated simulation: same thread+operation+mode always replays. */
export function simulationKey(threadId: string, campaignId: string) {
  return (
    'chat-' +
    createHash('sha256')
      .update(`${threadId}:${campaignId}:simulation`)
      .digest('hex')
      .slice(0, 48)
  );
}
const AGENT_SQL = `SELECT v.id FROM agents a JOIN agent_versions v ON v.agent_id=a.id AND v.workspace_id=a.workspace_id AND v.version=a.current_version WHERE a.workspace_id=$1 AND ($2::uuid IS NULL OR a.id=$2) ORDER BY CASE WHEN a.name ILIKE '%appointment%' THEN 0 ELSE 1 END,a.name LIMIT 1`;
/** Current live readiness. Presence is not proof of a committed deployment. */
export async function liveReadiness(workspaceId: string, agentId?: string) {
  const version = (
    await pool.query<{ id: string }>(AGENT_SQL, [workspaceId, agentId ?? null])
  ).rows[0];
  const binding = version
    ? await getProviderBinding(workspaceId, version.id)
    : undefined;
  const blockers = [
    ...(!version ? ['AGENT_MISSING'] : []),
    ...(!config.LIVE_CALLS_ENABLED ? ['LIVE_CALLS_ENABLED'] : []),
    ...liveConfigurationIssues(config),
    ...(version && !binding && !config.SARVAM_APP_ID
      ? ['AGENT_DEPLOYMENT_NOT_SYNCHRONIZED']
      : []),
    ...(config.SARVAM_LOCAL_WORKSPACE_ID &&
    config.SARVAM_LOCAL_WORKSPACE_ID !== workspaceId
      ? ['SARVAM_LOCAL_WORKSPACE_ID']
      : []),
  ];
  return {
    ready: blockers.length === 0,
    blockers,
    callerIdMasked: config.SARVAM_AGENT_PHONE_NUMBER
      ? maskDestination(config.SARVAM_AGENT_PHONE_NUMBER)
      : null,
  };
}
const AgentList = z.object({
  agents: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      versionId: z.uuid(),
      language: z.string(),
      voice: VoiceSelectionSchema.nullable(),
    }),
  ),
  voiceCatalogStatus: z.string(),
});
export function createCallTools(context: {
  identity: SessionIdentity;
  threadId: string;
  objective: string;
  mode: z.infer<typeof ModeSchema>;
  agentId?: string;
  campaigns: CampaignsService;
  onDraft: (draft: z.infer<typeof ChatDraftSchema>) => void;
}) {
  const { identity, mode } = context;
  const resolved = new Set<string>();
  let prepared: z.infer<typeof ChatDraftSchema> | undefined;
  /** Only the plan prepared in this turn or the thread's own plan may be acted on. */
  const ownPlan = async (campaignId: string) => {
    if (prepared?.campaignId === campaignId) return;
    const linked = (
      await pool.query<{ campaign_id: string | null }>(
        'SELECT campaign_id FROM chat_threads WHERE id=$1 AND workspace_id=$2 AND user_id=$3',
        [context.threadId, identity.workspaceId, identity.userId],
      )
    ).rows[0];
    if (linked?.campaign_id !== campaignId)
      throw new DomainError(
        'UNREQUESTED_OPERATION',
        'Only the plan prepared in this conversation can be used.',
        409,
      );
  };
  /** Read-only, fresh eligibility of the exact persisted target set. Never mutates. */
  const preview = async (
    campaignId: string,
  ): Promise<z.infer<typeof Preview>> => {
    await ownPlan(campaignId);
    const row = (
      await pool.query<{
        mode: 'live' | 'simulation';
        status: string;
        plan: Record<string, unknown> | null;
        launch_key: string | null;
      }>(
        'SELECT mode,status,plan,launch_key FROM campaigns WHERE workspace_id=$1 AND id=$2',
        [identity.workspaceId, campaignId],
      )
    ).rows[0];
    if (!row?.plan)
      throw new DomainError(
        'PLAN_NOT_FOUND',
        'Prepare a call plan before validating it.',
        404,
      );
    const members = (
      await pool.query<{ contact_id: string }>(
        'SELECT contact_id FROM campaign_contacts WHERE workspace_id=$1 AND campaign_id=$2 ORDER BY position,id',
        [identity.workspaceId, campaignId],
      )
    ).rows;
    const targets = [];
    for (const member of members) {
      const contact = (
        await contactFacts(identity.workspaceId, member.contact_id)
      )[0];
      const reasons = contact
        ? eligibility(contact, row.mode)
        : ['contact_missing'];
      targets.push({
        contactId: member.contact_id,
        name: contact?.name ?? '',
        destinationMasked: contact ? maskDestination(contact.phone) : '',
        eligible: reasons.length === 0,
        reasons,
      });
    }
    const target = CallTargetSchema.safeParse(row.plan.target).data;
    const readiness =
      row.mode === 'live'
        ? await liveReadiness(identity.workspaceId, context.agentId)
        : null;
    const blockers = [
      ...(readiness?.blockers ?? []),
      ...(target?.blockers.filter(
        (b) => b === 'CALL_SCHEDULE_REQUIRES_REVIEW',
      ) ?? []),
      ...(row.status !== 'planned' || row.launch_key
        ? ['ALREADY_LAUNCHED']
        : []),
    ];
    const eligibleCount = targets.filter((t) => t.eligible).length;
    return {
      operationId: campaignId,
      mode: row.mode,
      status: row.status,
      planSnapshotHash: planSnapshotHash(
        row.plan as Parameters<typeof planSnapshotHash>[0],
      ),
      eligibleCount,
      excludedCount: targets.length - eligibleCount,
      targets,
      destinationRole: 'recipient' as const,
      callerIdRole: 'outbound_caller_id' as const,
      callerIdMasked:
        row.mode === 'live'
          ? (readiness?.callerIdMasked ?? null)
          : (target?.callerIdMasked ?? null),
      providerReady: row.mode === 'simulation' ? true : !!readiness?.ready,
      provider:
        row.mode === 'simulation' ? ('mock' as const) : ('sarvam' as const),
      blockers,
      // A real call always needs explicit operator confirmation; a simulation only when not requested in chat.
      confirmationRequired: row.mode === 'live' || mode !== 'simulation',
    };
  };
  const tools: Record<string, ToolDefinition> = {
    resolve_contact: define(
      'Resolve the exact person by name and/or number. Never replace a person with a cohort.',
      ContactQuery,
      ContactResult,
      'read',
      async (query) => {
        const sourcePhone = context.objective.match(PHONE)?.[0];
        if (
          query.name &&
          !context.objective
            .toLocaleLowerCase()
            .includes(query.name.toLocaleLowerCase())
        )
          throw new DomainError(
            'UNREQUESTED_RECIPIENT',
            'The resolved name must be explicitly present in the operator request.',
          );
        if (
          query.contactId &&
          !context.objective.includes(query.contactId) &&
          !resolved.has(query.contactId)
        )
          throw new DomainError(
            'UNREQUESTED_RECIPIENT',
            'A contact ID cannot be invented by the model.',
          );
        if (query.phone && !sourcePhone)
          throw new DomainError(
            'UNREQUESTED_DESTINATION',
            'The model cannot invent a destination number.',
          );
        const contact = await resolveContact(identity.workspaceId, {
          ...query,
          ...(sourcePhone ? { phone: query.phone || sourcePhone } : {}),
        });
        resolved.add(contact.id);
        return safeContact(contact, mode);
      },
    ),
    get_eligibility: define(
      'Read consent evidence and suppression for the resolved contact only. Another contact cannot satisfy this gate.',
      z.strictObject({ contactId: z.uuid() }),
      ContactResult,
      'read',
      async ({ contactId }) => {
        if (!resolved.has(contactId))
          throw new DomainError(
            'CONTACT_NOT_RESOLVED',
            'Resolve the intended recipient first.',
          );
        const contact = (
          await contactFacts(identity.workspaceId, contactId)
        )[0];
        if (!contact)
          throw new DomainError(
            'CONTACT_NOT_FOUND',
            'The resolved contact no longer exists.',
            404,
          );
        return safeContact(contact, mode);
      },
    ),
    get_telephony_configuration: define(
      'Read live-call readiness and the outbound caller ID (masked). Presence is not proof of a committed deployment.',
      Empty,
      Readiness,
      'read',
      () => liveReadiness(identity.workspaceId, context.agentId),
    ),
    list_agents: define(
      'List persisted local personas and their saved voice. These are not synchronized provider deployments.',
      Empty,
      AgentList,
      'read',
      async () => ({
        agents: (
          await pool.query<{
            id: string;
            name: string;
            versionId: string;
            language: string;
            voice: unknown;
          }>(
            `SELECT a.id,a.name,v.id "versionId",v.language,v.voice FROM agents a JOIN agent_versions v ON v.agent_id=a.id AND v.workspace_id=a.workspace_id AND v.version=a.current_version WHERE a.workspace_id=$1 ORDER BY a.name`,
            [identity.workspaceId],
          )
        ).rows.map((row) => ({
          ...row,
          voice: VoiceSelectionSchema.safeParse(row.voice).data ?? null,
        })),
        voiceCatalogStatus:
          'Saved voices are local selections. Provider deployment is confirmed only by a synchronized binding (see get_telephony_configuration).',
      }),
    ),
    list_operations: define(
      'List persisted workspace operations. No metrics or statuses are generated.',
      Empty,
      z.object({
        items: z.array(
          z.object({
            id: z.uuid(),
            name: z.string(),
            mode: ModeSchema,
            status: z.string(),
          }),
        ),
      }),
      'read',
      async () => ({
        items: (
          await pool.query<{
            id: string;
            name: string;
            mode: 'live' | 'simulation';
            status: string;
          }>(
            'SELECT id,name,mode,status FROM campaigns WHERE workspace_id=$1 ORDER BY updated_at DESC LIMIT 30',
            [identity.workspaceId],
          )
        ).rows,
      }),
    ),
    get_attempt_state: define(
      'Read the attempts of an operation with call state. Ringing/accepted is not a connected conversation. Use get_call_artifacts for transcript and summary.',
      Campaign,
      z.object({
        operationId: z.uuid(),
        mode: ModeSchema,
        status: z.string(),
        attempts: z.array(
          z.object({
            attemptId: z.uuid(),
            status: z.string(),
            state: CallStateSchema,
            disposition: z.string().nullable(),
          }),
        ),
      }),
      'read',
      async ({ campaignId }) => {
        const operation = (
          await pool.query<{ mode: 'live' | 'simulation'; status: string }>(
            'SELECT mode,status FROM campaigns WHERE workspace_id=$1 AND id=$2',
            [identity.workspaceId, campaignId],
          )
        ).rows[0];
        if (!operation)
          throw new DomainError(
            'OPERATION_NOT_FOUND',
            'No authorized operation matches this ID.',
            404,
          );
        const rows = (
          await pool.query<{
            id: string;
            status: string;
            outcome: string | null;
          }>(
            'SELECT id,status,outcome FROM call_attempts WHERE workspace_id=$1 AND campaign_id=$2 ORDER BY started_at,id',
            [identity.workspaceId, campaignId],
          )
        ).rows;
        return {
          operationId: campaignId,
          ...operation,
          attempts: rows.map((row) => ({
            attemptId: row.id,
            status: row.status,
            state: callState(row),
            disposition: row.outcome,
          })),
        };
      },
    ),
    prepare_call_plan: define(
      'Persist a single-recipient plan for the original request. Does not dial. The server preserves the requested mode and selected agent.',
      z.strictObject({ contactId: z.uuid() }),
      ChatDraftSchema,
      'draft',
      async ({ contactId }) => {
        if (!resolved.has(contactId))
          throw new DomainError(
            'CONTACT_NOT_RESOLVED',
            'Resolve the intended recipient before preparing a plan.',
          );
        if (prepared) return prepared;
        const draft = ChatDraftSchema.parse(
          await context.campaigns.prepareSingle(identity, {
            contactId,
            objective: context.objective,
            mode,
            agentId: context.agentId,
            threadId: context.threadId,
          }),
        );
        prepared = draft;
        context.onDraft(draft);
        return draft;
      },
    ),
    validate_call_plan: define(
      'Preview the exact prepared target set: fresh eligible/excluded counts, per-target reasons, masked destination, caller ID, provider readiness and whether operator confirmation is required. Does not dial.',
      Campaign,
      Preview,
      'read',
      ({ campaignId }) => preview(campaignId),
    ),
    run_simulation: define(
      'Run the prepared plan as a SIMULATION through the mock provider. Only available when the operator explicitly asked to simulate. Never dials a telephone.',
      Campaign,
      z.object({
        operationId: z.uuid(),
        status: z.string(),
        mode: z.literal('simulation'),
      }),
      'simulation',
      async ({ campaignId }) => {
        if (mode !== 'simulation')
          throw new DomainError(
            'SIMULATION_NOT_REQUESTED',
            'The operator did not ask for a simulation. A real-call request is never rewritten to simulation.',
            409,
          );
        const check = await preview(campaignId);
        if (check.mode !== 'simulation')
          throw new DomainError(
            'MODE_MISMATCH',
            'This plan is a real call; it cannot be run as a simulation.',
            409,
          );
        const result = z
          .object({ status: z.string() })
          .parse(
            await context.campaigns.launch(
              identity,
              campaignId,
              { confirmed: true, planSnapshotHash: check.planSnapshotHash },
              simulationKey(context.threadId, campaignId),
              'simulation',
            ),
          );
        return {
          operationId: campaignId,
          status: result.status,
          mode: 'simulation' as const,
        };
      },
    ),
    request_live_launch: define(
      'Report what stands between this plan and a REAL call. Never places a call: only the operator confirmation in the review UI can launch it.',
      Campaign,
      z.object({
        confirmationRequired: z.literal(true),
        blockers: z.array(z.string()),
      }),
      'read',
      async ({ campaignId }) => {
        const check = await preview(campaignId);
        if (mode !== 'live' || check.mode !== 'live')
          throw new DomainError(
            'LIVE_NOT_REQUESTED',
            'This request is a simulation; it is never rewritten to a real call.',
            409,
          );
        return {
          confirmationRequired: true as const,
          blockers: [
            ...new Set([
              ...check.blockers,
              ...check.targets.flatMap((t) => t.reasons),
            ]),
          ],
        };
      },
    ),
    get_call_artifacts: define(
      'Read persisted transcript, recording status, summary and disposition for one attempt. Not-connected attempts never have conversation content.',
      z.strictObject({ attemptId: z.uuid() }),
      Artifacts,
      'read',
      ({ attemptId }) => callArtifacts(identity.workspaceId, attemptId),
    ),
    control_operation: define(
      'Pause, resume or cancel this conversation’s operation. Resuming a real-call operation requires the review UI.',
      z.strictObject({
        campaignId: z.uuid(),
        action: z.enum(['pause', 'resume', 'cancel']),
      }),
      z.object({ operationId: z.uuid(), status: z.string() }),
      'side_effect',
      async ({ campaignId, action }) => {
        await ownPlan(campaignId);
        const row = (
          await pool.query<{ mode: string }>(
            'SELECT mode FROM campaigns WHERE workspace_id=$1 AND id=$2',
            [identity.workspaceId, campaignId],
          )
        ).rows[0];
        if (action === 'resume' && row?.mode === 'live')
          throw new DomainError(
            'LIVE_CONFIRMATION_REQUIRED',
            'Resuming real calls requires operator confirmation in the review UI.',
            409,
          );
        const result = z
          .object({ status: z.string() })
          .parse(await context.campaigns.action(identity, campaignId, action));
        return { operationId: campaignId, status: result.status };
      },
    ),
  };
  return tools;
}
/** Persisted artifacts only. A not-connected attempt never carries conversation content. */
export async function callArtifacts(workspaceId: string, attemptId: string) {
  const row = (
    await pool.query<{
      id: string;
      campaign_id: string;
      status: string;
      outcome: string | null;
      mode: 'live' | 'simulation';
      analysis_status: string | null;
      summary: string | null;
      transcript: unknown;
      synthetic: boolean | null;
      transcript_status: string | null;
      recording_status: string | null;
    }>(
      `SELECT c.id,c.campaign_id,c.status,c.outcome,c.mode,n.status analysis_status,n.summary,n.transcript,n.synthetic,a.transcript_status,a.recording_status
       FROM call_attempts c LEFT JOIN analyses n ON n.call_attempt_id=c.id AND n.workspace_id=c.workspace_id AND n.expires_at>now()
       LEFT JOIN call_artifacts a ON a.call_attempt_id=c.id AND a.workspace_id=c.workspace_id WHERE c.workspace_id=$1 AND c.id=$2`,
      [workspaceId, attemptId],
    )
  ).rows[0];
  if (!row)
    throw new DomainError(
      'ATTEMPT_NOT_FOUND',
      'No authorized attempt matches this ID.',
      404,
    );
  const state = callState(row);
  const conversation = hadConversation(state);
  const terminal = !['queued', 'dialing', 'ringing', 'connected'].includes(
    state,
  );
  const transcript = conversation
    ? (z.array(TranscriptTurnSchema).safeParse(row.transcript).data ?? [])
    : [];
  const status = (value: string | null, has: boolean) =>
    has
      ? ('available' as const)
      : conversation && (value === 'processing' || !terminal || !value)
        ? ('processing' as const)
        : ('unavailable' as const);
  return {
    attemptId: row.id,
    operationId: row.campaign_id,
    mode: row.mode,
    attemptStatus: row.status,
    state,
    disposition: row.outcome,
    conversation,
    transcriptStatus:
      row.mode === 'simulation' && conversation && terminal
        ? transcript.length
          ? ('available' as const)
          : ('unavailable' as const)
        : status(row.transcript_status, transcript.length > 0),
    transcript,
    // Simulations never produce audio; live audio exists only once the artifact poller stored it.
    recordingStatus:
      row.mode === 'simulation' || !conversation
        ? ('unavailable' as const)
        : status(row.recording_status, row.recording_status === 'available'),
    summaryStatus: !conversation
      ? 'unavailable'
      : row.analysis_status === 'completed' && row.summary
        ? 'available'
        : row.analysis_status === 'failed'
          ? 'unavailable'
          : 'processing',
    summary:
      conversation && row.analysis_status === 'completed' ? row.summary : null,
    simulated: row.mode === 'simulation',
  };
}
const CATEGORY: [RegExp, ToolErrorCategory][] = [
  [
    /CONSENT|POLICY|SUPPRESS|DESTINATION_NOT_AUTHORIZED|SYNTHETIC/,
    'consent/policy',
  ],
  [/FORBIDDEN|AUTH|UNAUTHORIZED/, 'auth'],
  [/RATE_LIMIT/, 'rate limit'],
  [/TIMEOUT/, 'timeout'],
  [/RECORDING_UNAVAILABLE|ARTIFACT|TRANSCRIPT/, 'unavailable artifact'],
  [
    /CONFIG|LIVE_DISABLED|AGENT|PROVIDER_DEPLOYMENT|SARVAM|CALLER_ID|LIVE_CALLS/,
    'configuration',
  ],
  [/PROVIDER/, 'provider'],
];
function categorize(code: string, status?: number): ToolErrorCategory {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate limit';
  return CATEGORY.find(([pattern]) => pattern.test(code))?.[1] ?? 'validation';
}
export function toolFailure(error: unknown): {
  code: string;
  message: string;
  category: ToolErrorCategory;
} {
  if (error instanceof DomainError) {
    const parsed = z
      .object({ error: z.object({ code: z.string(), message: z.string() }) })
      .parse(error.getResponse()).error;
    return {
      ...parsed,
      category: ToolErrorCategorySchema.parse(
        categorize(parsed.code, error.getStatus() === 403 ? 403 : undefined),
      ),
    };
  }
  if (error instanceof z.ZodError)
    return {
      code: 'TOOL_VALIDATION',
      message: 'The tool input or result did not match its contract.',
      category: 'validation',
    };
  if (error instanceof Error && /timeout|abort/i.test(error.name))
    return {
      code: 'MODEL_TIMEOUT',
      message: 'The request timed out. Saved progress remains available.',
      category: 'timeout',
    };
  const status = z.object({ status: z.number() }).safeParse(error);
  if (status.success) {
    const code = status.data.status;
    const category = categorize('', code);
    return {
      code:
        category === 'auth'
          ? 'MODEL_AUTH'
          : category === 'rate limit'
            ? 'MODEL_RATE_LIMIT'
            : 'MODEL_PROVIDER',
      message:
        category === 'auth'
          ? 'The configured model credentials or permissions were rejected. Check the selected model API configuration.'
          : category === 'rate limit'
            ? 'The model rate limit was reached. Retry after the provider limit resets.'
            : 'The model provider could not complete the request. Saved progress remains available.',
      category: category === 'validation' ? 'provider' : category,
    };
  }
  return {
    code: 'TOOL_INTERNAL',
    message: 'The tool failed. Check service health before retrying.',
    category: 'internal',
  };
}
export async function executeCallTool(
  tools: Record<string, ToolDefinition>,
  name: string,
  args: unknown,
  context: { identity: SessionIdentity; threadId: string },
  emit: (event: string, data: unknown) => Promise<void>,
) {
  const tool = tools[name];
  if (!tool)
    return {
      error: {
        code: 'TOOL_UNAVAILABLE',
        message: 'This tool is not available in chat.',
        category: 'validation' as const,
      },
    };
  const execution = (
    await pool.query<{ id: string }>(
      `INSERT INTO tool_executions(workspace_id,actor_id,thread_id,name,execution_mode,status,input_redacted) VALUES($1,$2,$3,$4,$5,'running',$6) RETURNING id`,
      [
        context.identity.workspaceId,
        context.identity.userId,
        context.threadId,
        name,
        tool.mode,
        JSON.stringify(redact(args) ?? null),
      ],
    )
  ).rows[0]!;
  await emit('tool.started', {
    name,
    executionId: execution.id,
    mode: tool.mode,
  });
  try {
    if (tool.mode !== 'read') requireWrite(context.identity);
    // Output validation failures surface as TOOL_VALIDATION; they are never swallowed.
    const output = tool.output.parse(
      await tool.execute(tool.schema.parse(args)),
    );
    await pool.query(
      "UPDATE tool_executions SET status='completed',output_redacted=$2,completed_at=now() WHERE id=$1",
      [execution.id, JSON.stringify(redact(output) ?? null)],
    );
    await emit('tool.result', { name, executionId: execution.id, ok: true });
    return { result: output };
  } catch (error) {
    const failure = toolFailure(error);
    await pool.query(
      "UPDATE tool_executions SET status='failed',error_code=$2,error_category=$3,completed_at=now() WHERE id=$1",
      [execution.id, failure.code, failure.category],
    );
    await emit('tool.result', {
      name,
      executionId: execution.id,
      ok: false,
      error: failure,
    });
    return { error: failure };
  }
}
