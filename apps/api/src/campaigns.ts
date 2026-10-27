import { createHash } from 'node:crypto';
import {
  contactFacts,
  eligibility as recipientEligibility,
} from './recipients';
import { Injectable, Inject } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  pool,
  getProviderBinding,
  verifyProviderBinding,
  transaction,
  appendCampaignEvent,
  appendAudit,
  enqueueOutbox,
} from '@outreach/database';
import {
  CallTargetSchema,
  VoiceSelectionSchema,
  ChatDraftSchema,
  maskDestination,
  CampaignInputSchema,
  CampaignPatchSchema,
  ModelContentProposalSchema,
  ConfirmLaunchSchema,
  PolicySchema,
  canTransition,
  extractEventDate,
  type ModelContentProposal,
} from '@outreach/contracts';
import {
  allowedLiveDestinations,
  liveReady,
  liveConfigurationIssues,
} from '@outreach/config';
import { config } from './auth';
import { CampaignContentPlanner } from '@outreach/voice-provider';
import {
  planSnapshotHash,
  planningSnapshot,
  assertPlanningSnapshot,
  buildCampaignPlan,
  readablePlan,
  launchablePlan,
} from './planning';
import {
  clean,
  owned,
  parse,
  requireWrite,
  pagination,
  paged,
  offsetCursor,
  DomainError,
  settingsPolicy,
  workspaceSettings,
  type SessionIdentity,
} from './common';
@Injectable()
export class CampaignsService {
  constructor(
    @Inject(CampaignContentPlanner)
    private readonly planner: CampaignContentPlanner,
  ) {}
  /** The direct-call path uses the same plan contract, launch gate, outbox and worker as campaigns. */
  async prepareSingle(
    identity: SessionIdentity,
    input: {
      contactId: string;
      objective: string;
      mode: 'live' | 'simulation';
      agentId?: string;
      threadId?: string;
      campaignId?: string;
    },
  ) {
    requireWrite(identity);
    return transaction(async (client) => {
      const workspace = await workspaceSettings(client, identity.workspaceId);
      const agentId = input.agentId ?? workspace.settings.defaultAgentId;
      if (input.campaignId) {
        const previous = await owned(
          client,
          'campaigns',
          input.campaignId,
          identity.workspaceId,
          true,
        );
        if (
          !['draft', 'planned'].includes(previous.status) ||
          CallTargetSchema.safeParse(previous.plan?.target).data?.contactId !==
            input.contactId
        )
          throw new DomainError(
            'PLAN_IMMUTABLE',
            'Only an unlaunched plan for the same recipient can be edited.',
            409,
          );
      }
      const contact = (
        await contactFacts(identity.workspaceId, input.contactId)
      )[0];
      if (!contact)
        throw new DomainError(
          'CONTACT_NOT_FOUND',
          'The selected contact no longer exists.',
          404,
        );
      const agents = (
        await client.query<{
          id: string;
          agent_id: string;
          name: string;
          language: string;
          questions: string[];
          voice: unknown;
        }>(
          `SELECT v.id,v.agent_id,a.name,v.language,v.questions,v.voice FROM agents a JOIN agent_versions v ON v.agent_id=a.id AND v.workspace_id=a.workspace_id AND v.version=a.current_version
         WHERE a.workspace_id=$1 AND ($2::uuid IS NULL OR a.id=$2) ORDER BY CASE WHEN a.name ILIKE '%appointment%' THEN 0 ELSE 1 END,a.name`,
          [identity.workspaceId, agentId],
        )
      ).rows;
      const agent = agents[0];
      if (!agent)
        throw new DomainError(
          'AGENT_MISSING',
          'Select a persisted voice agent before preparing a call.',
          409,
        );
      const source = (
        await client.query<{ import_id: string }>(
          'SELECT import_id FROM import_rows WHERE workspace_id=$1 AND contact_id=$2 ORDER BY created_at DESC LIMIT 1',
          [identity.workspaceId, contact.id],
        )
      ).rows[0];
      if (!source)
        throw new DomainError(
          'CONTACT_SOURCE_MISSING',
          'The contact has no persisted import/source. Import its evidence before planning.',
          409,
        );
      const blockers = recipientEligibility(contact, input.mode);
      const policy = settingsPolicy(workspace, { concurrency: 1 });
      const eventDate = extractEventDate(input.objective);
      const binding = await getProviderBinding(identity.workspaceId, agent.id);
      const savedVoice = VoiceSelectionSchema.safeParse(agent.voice).data;
      const scheduleUnresolved =
        /\b(?:call|dial)\b.{0,60}\b(?:tomorrow|today at|at \d|in \d+ (?:minutes|hours)|next week)\b/i.test(
          input.objective,
        );
      const target = CallTargetSchema.parse({
        contactId: contact.id,
        name: contact.name,
        destinationMasked: maskDestination(contact.phone),
        callerIdMasked: config.SARVAM_AGENT_PHONE_NUMBER
          ? maskDestination(config.SARVAM_AGENT_PHONE_NUMBER)
          : null,
        timezone: workspace.timezone,
        eventDate,
        scheduledAt: null,
        language: agent.language,
        // Provider-verified voice wins; otherwise the operator's saved selection.
        // Live dialing stays blocked until a binding exists, so an unapplied voice never dials.
        voiceId: binding?.voice_id ?? savedVoice?.speaker ?? null,
        voiceModel: binding?.voice_model ?? savedVoice?.model ?? null,
        providerFingerprint: binding?.fingerprint ?? null,
        providerAppId: config.SARVAM_APP_ID ?? null,
        providerAppVersion: config.SARVAM_APP_VERSION ?? null,
        recordingNotice:
          input.mode === 'simulation'
            ? 'SIMULATION. No telephone is dialed; any dialogue is a test fixture.'
            : 'REAL CALL. The AI must identify itself and disclose recording/transcription according to the committed agent configuration.',
        blockers:
          input.mode === 'live'
            ? [
                ...blockers,
                ...(!config.LIVE_CALLS_ENABLED ? ['LIVE_CALLS_ENABLED'] : []),
                ...liveConfigurationIssues(config),
                ...(!binding && !config.SARVAM_APP_ID
                  ? ['AGENT_DEPLOYMENT_NOT_SYNCHRONIZED']
                  : []),
              ]
            : blockers,
      });
      if (scheduleUnresolved)
        target.blockers.push('CALL_SCHEDULE_REQUIRES_REVIEW');
      const questions = [
        /interview|attend/i.test(input.objective)
          ? 'Will you attend the interview on the stated date? Do you need any follow-up?'
          : input.objective.slice(0, 300),
      ];
      const plan = buildCampaignPlan(
        {
          mode: input.mode,
          objective: input.objective,
          agentId: agent.agent_id,
          agentVersionId: agent.id,
          eligibleCount: blockers.length ? 0 : 1,
          exclusions: blockers.length
            ? [{ reason: blockers.join(', '), count: 1 }]
            : [],
          policy,
        },
        {
          source: 'local',
          model: null,
          questions,
          steps: [
            {
              name: 'Introduction',
              description:
                'Identify yourself as an AI assistant calling on behalf of the configured organization and explain the purpose.',
            },
            {
              name: 'Conversation',
              description: input.objective.slice(0, 1000),
            },
            {
              name: 'Outcome',
              description:
                'Listen to the actual response. Respect requests to end the call; record only supported answers and requested follow-up.',
            },
          ],
        },
      );
      plan.target = target;
      plan.recipientFingerprint = createHash('sha256')
        .update(contact.id + ':' + contact.phone)
        .digest('hex');
      const campaign = input.campaignId
        ? (
            await client.query<{ id: string }>(
              `UPDATE campaigns SET objective=$2,mode=$3,agent_version_id=$4,policy=$5,plan=$6,status='planned',updated_at=now() WHERE id=$1 RETURNING id`,
              [
                input.campaignId,
                input.objective,
                input.mode,
                agent.id,
                JSON.stringify(policy),
                JSON.stringify(plan),
              ],
            )
          ).rows[0]!
        : (
            await client.query<{ id: string }>(
              `INSERT INTO campaigns(workspace_id,name,objective,mode,status,agent_version_id,import_id,policy,plan)
        VALUES($1,$2,$3,$4,'planned',$5,$6,$7,$8) RETURNING id`,
              [
                identity.workspaceId,
                `Call ${contact.name}`,
                input.objective,
                input.mode,
                agent.id,
                source.import_id,
                JSON.stringify(policy),
                JSON.stringify(plan),
              ],
            )
          ).rows[0]!;
      await client.query(
        `INSERT INTO campaign_contacts(workspace_id,campaign_id,contact_id,status,reason,position) VALUES($1,$2,$3,$4,$5,1) ON CONFLICT(campaign_id,contact_id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason`,
        [
          identity.workspaceId,
          campaign.id,
          contact.id,
          blockers.length ? 'excluded' : 'pending',
          blockers.join(', ') || null,
        ],
      );
      if (input.threadId)
        await client.query(
          'UPDATE chat_threads SET campaign_id=$1,updated_at=now() WHERE id=$2 AND workspace_id=$3 AND user_id=$4',
          [campaign.id, input.threadId, identity.workspaceId, identity.userId],
        );
      await appendCampaignEvent(
        client,
        identity.workspaceId,
        campaign.id,
        'call.planned',
        {
          mode: input.mode,
          contactId: contact.id,
          eligibleCount: plan.eligibleCount,
        },
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        'call.planned',
        campaign.id,
        { mode: input.mode, contactId: contact.id, agentVersionId: agent.id },
      );
      return ChatDraftSchema.parse({
        campaignId: campaign.id,
        objective: input.objective,
        mode: input.mode,
        eligibleCount: plan.eligibleCount,
        excludedCount: plan.excludedCount,
        planSnapshotHash: planSnapshotHash(plan),
        agentName: agent.name,
        agentLanguage: agent.language,
        agentVersionId: agent.id,
        target,
        steps: plan.steps.map((s) => s.description),
        questions: plan.questions,
        estimatedCostMinor: plan.cost.estimatedTotalMinor,
      });
    });
  }
  async review(identity: SessionIdentity, id: string) {
    const row = await owned(pool, 'campaigns', id, identity.workspaceId);
    const plan = launchablePlan(row.plan);
    const target = CallTargetSchema.parse(plan.target);
    const agent = (
      await pool.query<{ name: string; language: string }>(
        'SELECT a.name,v.language FROM agent_versions v JOIN agents a ON a.id=v.agent_id WHERE v.id=$1',
        [row.agent_version_id],
      )
    ).rows[0]!;
    return ChatDraftSchema.parse({
      campaignId: id,
      objective: row.objective,
      mode: row.mode,
      eligibleCount: plan.eligibleCount,
      excludedCount: plan.excludedCount,
      planSnapshotHash: planSnapshotHash(plan),
      agentName: agent.name,
      agentLanguage: agent.language,
      agentVersionId: row.agent_version_id,
      target,
      steps: plan.steps.map((s) => s.description),
      questions: plan.questions,
      estimatedCostMinor: plan.cost.estimatedTotalMinor,
    });
  }
  async list(
    identity: SessionIdentity,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    const status = typeof query.status === 'string' ? query.status : null;
    const mode = typeof query.mode === 'string' ? query.mode : null;
    const result = await pool.query(
      "SELECT c.*,a.name agent_name,v.agent_id,(SELECT count(*)::int FROM campaign_contacts cc WHERE cc.campaign_id=c.id) total_contacts,(SELECT count(*)::int FROM campaign_contacts cc WHERE cc.campaign_id=c.id AND cc.status='completed') completed_contacts FROM campaigns c JOIN agent_versions v ON v.id=c.agent_version_id AND v.workspace_id=c.workspace_id JOIN agents a ON a.id=v.agent_id AND a.workspace_id=c.workspace_id WHERE c.workspace_id=$1 AND ($2::text IS NULL OR c.status=$2) AND ($3::text IS NULL OR c.mode=$3) ORDER BY c.created_at DESC,c.id DESC LIMIT $4 OFFSET $5",
      [identity.workspaceId, status, mode, limit + 1, offset],
    );
    return paged(
      result.rows.map((row) => ({ ...row, ...readablePlan(row.plan) })),
      limit,
      offset,
    );
  }
  async detail(identity: SessionIdentity, id: string): Promise<unknown> {
    const row = await owned(pool, 'campaigns', id, identity.workspaceId);
    const agent = (
      await pool.query(
        'SELECT v.agent_id,a.name agent_name FROM agent_versions v JOIN agents a ON a.id=v.agent_id AND a.workspace_id=v.workspace_id WHERE v.id=$1 AND v.workspace_id=$2',
        [row.agent_version_id, identity.workspaceId],
      )
    ).rows[0];
    const progress: Record<string, number> = {
      total: 0,
      pending: 0,
      queued: 0,
      calling: 0,
      completed: 0,
      excluded: 0,
      unknown: 0,
      cancelled: 0,
    };
    for (const item of (
      await pool.query(
        'SELECT status,count(*)::int count FROM campaign_contacts WHERE campaign_id=$1 AND workspace_id=$2 GROUP BY status',
        [id, identity.workspaceId],
      )
    ).rows) {
      progress[item.status] = item.count;
      progress.total += item.count;
    }
    const outcomes: Record<string, number> = {
      connected: 0,
      no_answer: 0,
      busy: 0,
      failed: 0,
      unknown: 0,
    };
    for (const item of (
      await pool.query(
        'SELECT outcome,count(*)::int count FROM call_attempts WHERE campaign_id=$1 AND workspace_id=$2 AND outcome IS NOT NULL GROUP BY outcome',
        [id, identity.workspaceId],
      )
    ).rows)
      outcomes[item.outcome] = item.count;
    return clean({
      ...row,
      ...readablePlan(row.plan),
      operationId: row.id,
      ...agent,
      progress,
      outcomes,
      activeCallsMayContinue:
        ['paused', 'cancelled'].includes(row.status) && progress.calling > 0,
    });
  }
  private async selection(
    client: PoolClient,
    identity: SessionIdentity,
    importId: string,
    agentId: string,
  ): Promise<string> {
    const imported = await owned(
      client,
      'imports',
      importId,
      identity.workspaceId,
    );
    if (imported.status !== 'ready')
      throw new DomainError(
        'IMPORT_NOT_READY',
        'Wait for import validation and correct blocking rows before selecting it',
        409,
      );
    const agent = await owned(client, 'agents', agentId, identity.workspaceId);
    return (
      await client.query(
        'SELECT id FROM agent_versions WHERE workspace_id=$1 AND agent_id=$2 AND version=$3',
        [identity.workspaceId, agentId, agent.current_version],
      )
    ).rows[0].id;
  }
  private async populate(
    client: PoolClient,
    identity: SessionIdentity,
    campaignId: string,
    importId: string,
  ): Promise<void> {
    await client.query(
      'DELETE FROM campaign_contacts WHERE campaign_id=$1 AND workspace_id=$2',
      [campaignId, identity.workspaceId],
    );
    await client.query(
      'INSERT INTO campaign_contacts(workspace_id,campaign_id,contact_id,position) SELECT $1,$2,contact_id,row_number() OVER(ORDER BY first_row)::int FROM (SELECT contact_id,min(source_row) first_row FROM import_rows WHERE import_id=$3 AND workspace_id=$1 AND contact_id IS NOT NULL GROUP BY contact_id) rows',
      [identity.workspaceId, campaignId, importId],
    );
  }
  async create(identity: SessionIdentity, body: unknown): Promise<unknown> {
    requireWrite(identity);
    // Policy fields the wizard omits default to the workspace settings, not PolicySchema constants.
    const defaults = settingsPolicy(
      await workspaceSettings(pool, identity.workspaceId),
    );
    const raw = body && typeof body === 'object' ? body : {};
    const supplied = (raw as { policy?: unknown }).policy;
    const input = parse(CampaignInputSchema, {
      ...raw,
      policy:
        supplied === undefined
          ? defaults
          : supplied && typeof supplied === 'object' && !Array.isArray(supplied)
            ? { ...defaults, ...supplied }
            : supplied,
    });
    const id = await transaction(async (client) => {
      const versionId = await this.selection(
        client,
        identity,
        input.importId,
        input.agentId,
      );
      const row = (
        await client.query(
          'INSERT INTO campaigns(workspace_id,name,objective,mode,agent_version_id,import_id,policy) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [
            identity.workspaceId,
            input.name,
            input.objective,
            input.mode,
            versionId,
            input.importId,
            JSON.stringify(input.policy),
          ],
        )
      ).rows[0];
      await this.populate(client, identity, row.id, input.importId);
      await appendCampaignEvent(
        client,
        identity.workspaceId,
        row.id,
        'campaign.created',
        { mode: input.mode },
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        'campaign.created',
        row.id,
        { mode: input.mode },
      );
      return row.id;
    });
    return this.detail(identity, id);
  }
  async edit(
    identity: SessionIdentity,
    id: string,
    body: unknown,
  ): Promise<unknown> {
    requireWrite(identity);
    const input = parse(CampaignPatchSchema, body);
    const current = await owned(pool, 'campaigns', id, identity.workspaceId);
    if (current.plan?.target) {
      const target = CallTargetSchema.parse(current.plan.target);
      if (input.importId)
        throw new DomainError(
          'RECIPIENT_IMMUTABLE',
          'A direct plan cannot be changed to a roster.',
          409,
        );
      const agentId = (
        await pool.query<{ agent_id: string }>(
          'SELECT agent_id FROM agent_versions WHERE id=$1',
          [current.agent_version_id],
        )
      ).rows[0]!.agent_id;
      await this.prepareSingle(identity, {
        campaignId: id,
        contactId: target.contactId,
        objective: input.objective ?? current.objective,
        mode: input.mode ?? current.mode,
        agentId: input.agentId ?? agentId,
      });
      return this.detail(identity, id);
    }

    await transaction(async (client) => {
      const existing = await owned(
        client,
        'campaigns',
        id,
        identity.workspaceId,
        true,
      );
      if (!['draft', 'planned'].includes(existing.status))
        throw new DomainError(
          'CAMPAIGN_IMMUTABLE',
          'Only draft or planned campaigns can be edited',
          409,
        );
      const originalAgent = (
        await client.query(
          'SELECT agent_id FROM agent_versions WHERE id=$1 AND workspace_id=$2',
          [existing.agent_version_id, identity.workspaceId],
        )
      ).rows[0].agent_id;
      const importId = input.importId || existing.import_id;
      const versionId = await this.selection(
        client,
        identity,
        importId,
        input.agentId || originalAgent,
      );
      await client.query(
        "UPDATE campaigns SET name=$1,objective=$2,mode=$3,agent_version_id=$4,import_id=$5,policy=$6,status='draft',plan=NULL,updated_at=now() WHERE id=$7 AND workspace_id=$8",
        [
          input.name || existing.name,
          input.objective || existing.objective,
          input.mode || existing.mode,
          versionId,
          importId,
          // CampaignPatchSchema.partial() still applies the policy default; only an explicit policy replaces it.
          JSON.stringify(
            (body as { policy?: unknown } | null)?.policy === undefined
              ? existing.policy
              : input.policy,
          ),
          id,
          identity.workspaceId,
        ],
      );
      await this.populate(client, identity, id, importId);
      await appendCampaignEvent(
        client,
        identity.workspaceId,
        id,
        'campaign.updated',
        { planInvalidated: true },
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        'campaign.updated',
        id,
      );
    });
    return this.detail(identity, id);
  }
  private async eligibility(
    client: PoolClient,
    identity: SessionIdentity,
    campaignId: string,
    mode: string,
  ): Promise<{
    eligible: number;
    exclusions: { reason: string; count: number }[];
  }> {
    const rows = (
      await client.query(
        'SELECT cc.id,c.id contact_id,c.consent,c.synthetic,s.id suppression_id FROM campaign_contacts cc JOIN contacts c ON c.id=cc.contact_id AND c.workspace_id=cc.workspace_id LEFT JOIN suppressions s ON s.workspace_id=c.workspace_id AND s.phone=c.phone WHERE cc.campaign_id=$1 AND cc.workspace_id=$2 ORDER BY cc.position FOR UPDATE OF cc,c',
        [campaignId, identity.workspaceId],
      )
    ).rows;
    let eligible = 0;
    const reasons = new Map<string, number>();
    for (const row of rows) {
      const facts = (
        await contactFacts(identity.workspaceId, row.contact_id)
      )[0]!;
      const reason =
        recipientEligibility(
          facts,
          mode === 'live' ? 'live' : 'simulation',
        ).join(', ') || null;
      if (reason) reasons.set(reason, (reasons.get(reason) || 0) + 1);
      else eligible++;
      await client.query(
        'UPDATE campaign_contacts SET status=$1,reason=$2 WHERE id=$3 AND workspace_id=$4',
        [reason ? 'excluded' : 'pending', reason, row.id, identity.workspaceId],
      );
    }
    return {
      eligible,
      exclusions: [...reasons].map(([reason, count]) => ({ reason, count })),
    };
  }
  async plan(identity: SessionIdentity, id: string): Promise<unknown> {
    requireWrite(identity);
    const initial = await owned(pool, 'campaigns', id, identity.workspaceId);
    if (!['draft', 'planned'].includes(initial.status))
      throw new DomainError(
        'PLANNING_BLOCKED',
        'Only drafts or unlaunched plans can be planned',
        409,
      );
    if (initial.plan?.target)
      throw new DomainError(
        'DIRECT_PLAN_REVIEW',
        'Revise this single-contact request in chat to prepare a new review.',
        409,
      );
    const initialPersona = (
      await pool.query<{ instructions: string; questions: string[] }>(
        'SELECT instructions,questions FROM agent_versions WHERE id=$1 AND workspace_id=$2',
        [initial.agent_version_id, identity.workspaceId],
      )
    ).rows[0];
    const snapshot = planningSnapshot(initial);
    let content: ModelContentProposal;
    try {
      content = ModelContentProposalSchema.parse(
        await this.planner.propose({
          mode: initial.mode,
          objective: initial.objective,
          personaPrompt: initialPersona.instructions,
          questions: initialPersona.questions,
        }),
      );
    } catch {
      throw new DomainError(
        'MODEL_UNAVAILABLE',
        'Content planning is unavailable; the campaign remains unlaunched',
        503,
      );
    }
    await transaction(async (client) => {
      const row = await owned(
        client,
        'campaigns',
        id,
        identity.workspaceId,
        true,
      );
      assertPlanningSnapshot(snapshot, row);
      if (!['draft', 'planned'].includes(row.status))
        throw new DomainError(
          'PLANNING_BLOCKED',
          'Only drafts or unlaunched plans can be planned',
          409,
        );
      const persona = (
        await client.query(
          'SELECT * FROM agent_versions WHERE id=$1 AND workspace_id=$2',
          [row.agent_version_id, identity.workspaceId],
        )
      ).rows[0];
      const imported = await owned(
        client,
        'imports',
        row.import_id,
        identity.workspaceId,
      );
      const { eligible, exclusions } = await this.eligibility(
        client,
        identity,
        id,
        row.mode,
      );
      const omittedRows = Math.max(
        0,
        imported.row_count -
          (
            await client.query(
              'SELECT count(*)::int count FROM campaign_contacts WHERE campaign_id=$1 AND workspace_id=$2',
              [id, identity.workspaceId],
            )
          ).rows[0].count,
      );
      if (omittedRows)
        exclusions.push({
          reason: 'invalid_or_duplicate_import_row',
          count: omittedRows,
        });
      const policy = parse(PolicySchema, row.policy);
      const plan = buildCampaignPlan(
        {
          mode: row.mode,
          objective: row.objective,
          agentId: persona.agent_id,
          agentVersionId: persona.id,
          eligibleCount: eligible,
          exclusions,
          policy,
        },
        content,
      );
      await client.query(
        "UPDATE campaigns SET plan=$1,status='planned',updated_at=now() WHERE id=$2 AND workspace_id=$3",
        [JSON.stringify(plan), id, identity.workspaceId],
      );
      await appendCampaignEvent(
        client,
        identity.workspaceId,
        id,
        'campaign.planned',
        {
          mode: row.mode,
          eligibleCount: eligible,
          planner: plan.planner,
          model: plan.model || null,
        },
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        'campaign.planned',
        id,
        {
          mode: row.mode,
          eligibleCount: eligible,
          planner: plan.planner,
          model: plan.model || null,
        },
      );
    });
    return this.detail(identity, id);
  }
  async launch(
    identity: SessionIdentity,
    id: string,
    body: unknown,
    key: string,
    mode: 'simulation' | 'live',
  ): Promise<unknown> {
    requireWrite(identity);
    const confirmation = parse(ConfirmLaunchSchema, body);
    await transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        identity.workspaceId + ':launch:' + key,
      ]);
      const collision = (
        await client.query<{ id: string }>(
          'SELECT id FROM campaigns WHERE workspace_id=$1 AND launch_key=$2',
          [identity.workspaceId, key],
        )
      ).rows[0];
      if (collision && collision.id !== id)
        throw new DomainError(
          'IDEMPOTENCY_CONFLICT',
          'This launch key belongs to another operation.',
          409,
        );
      const row = await owned(
        client,
        'campaigns',
        id,
        identity.workspaceId,
        true,
      );
      if (
        row.plan?.target &&
        confirmation.planSnapshotHash !== planSnapshotHash(row.plan)
      )
        throw new DomainError(
          'PLAN_STALE',
          'Review the current recipient, mode and plan before confirming.',
          409,
        );
      if (row.launch_key === key) {
        if (row.mode !== mode)
          throw new DomainError(
            'IDEMPOTENCY_CONFLICT',
            'This key belongs to another launch mode',
            409,
          );
        return;
      }
      if (row.launch_key || row.status !== 'planned')
        throw new DomainError(
          'LAUNCH_BLOCKED',
          'Plan the campaign before launch; launched campaigns cannot be launched again',
          409,
        );
      if (row.mode !== mode)
        throw new DomainError(
          'MODE_MISMATCH',
          'Campaign mode differs from the selected launch action',
          409,
        );
      if (mode === 'live' && !liveReady(config))
        throw new DomainError(
          'LIVE_DISABLED',
          `Live calling is blocked: ${[...(!config.LIVE_CALLS_ENABLED ? ['LIVE_CALLS_ENABLED'] : []), ...liveConfigurationIssues(config)].join(', ')}`,
          403,
        );
      const plan = launchablePlan(row.plan);
      if (row.plan?.target) {
        const target = CallTargetSchema.parse(row.plan.target);
        if (target.blockers.includes('CALL_SCHEDULE_REQUIRES_REVIEW'))
          throw new DomainError(
            'CALL_SCHEDULE_REQUIRES_REVIEW',
            'This request contains an unresolved call schedule. Specify an immediate call explicitly or use the campaign scheduling policy.',
            409,
          );
        const contact = (
          await contactFacts(identity.workspaceId, target.contactId)
        )[0];
        if (
          !contact ||
          row.plan.recipientFingerprint !==
            createHash('sha256')
              .update(contact.id + ':' + contact.phone)
              .digest('hex')
        )
          throw new DomainError(
            'DESTINATION_CHANGED',
            'Recipient identity or destination changed. Prepare a new plan.',
            409,
          );
        if (mode === 'live' && !target.providerFingerprint)
          throw new DomainError(
            'AGENT_DEPLOYMENT_NOT_SYNCHRONIZED',
            'Synchronize the committed Sarvam agent, prompt and voice before confirming a real call.',
            409,
          );
      }
      const { eligible } = await this.eligibility(client, identity, id, mode);
      if (!eligible)
        throw new DomainError(
          'NO_ELIGIBLE_CONTACTS',
          'No eligible contacts are available',
          409,
        );
      if (eligible !== plan.eligibleCount)
        throw new DomainError(
          'PLAN_STALE',
          'Eligibility changed; review a refreshed plan before launching',
          409,
        );
      if (mode === 'live') {
        const destinations = allowedLiveDestinations(config);
        const contacts = (
          await client.query(
            "SELECT c.phone FROM contacts c JOIN campaign_contacts cc ON cc.contact_id=c.id AND cc.workspace_id=c.workspace_id WHERE cc.campaign_id=$1 AND cc.workspace_id=$2 AND cc.status='pending'",
            [id, identity.workspaceId],
          )
        ).rows;
        if (contacts.some((contact) => !destinations.includes(contact.phone)))
          throw new DomainError(
            'DESTINATION_NOT_AUTHORIZED',
            'Every live destination must be explicitly allowlisted',
            403,
          );
        if (plan.policy.concurrency > 1)
          throw new DomainError(
            'LIVE_CONCURRENCY_LIMIT',
            'First live integration permits one concurrent call',
          );
        if (plan.cost.estimatedTotalMinor > plan.policy.budgetMinor)
          throw new DomainError(
            'BUDGET_EXCEEDED',
            'Configured reservation estimate exceeds the campaign cap',
          );
      }
      if (mode === 'live') {
        try {
          await verifyProviderBinding(
            config,
            identity.workspaceId,
            row.agent_version_id,
            plan.target
              ? (CallTargetSchema.parse(plan.target).providerFingerprint ??
                  undefined)
              : undefined,
          );
        } catch {
          throw new DomainError(
            'PROVIDER_DEPLOYMENT_UNVERIFIED',
            'The selected provider agent, version, prompt, language or voice could not be reverified. Refresh its binding before a real call.',
            409,
          );
        }
      }
      await client.query(
        "UPDATE campaigns SET status='running',launch_key=$1,updated_at=now() WHERE id=$2 AND workspace_id=$3",
        [key, id, identity.workspaceId],
      );
      const pending = (
        await client.query(
          "UPDATE campaign_contacts SET status='queued' WHERE campaign_id=$1 AND workspace_id=$2 AND status='pending' RETURNING id",
          [id, identity.workspaceId],
        )
      ).rows;
      for (const contact of pending)
        await enqueueOutbox(
          client,
          'dispatch',
          { id: contact.id },
          identity.workspaceId,
        );
      await appendCampaignEvent(
        client,
        identity.workspaceId,
        id,
        'campaign.launched',
        { mode, eligibleCount: pending.length },
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        'campaign.launched',
        id,
        { mode, confirmed: true, eligibleCount: pending.length },
      );
    });
    return this.detail(identity, id);
  }
  async action(
    identity: SessionIdentity,
    id: string,
    action: 'pause' | 'resume' | 'cancel',
  ): Promise<unknown> {
    requireWrite(identity);
    const target = { pause: 'paused', resume: 'running', cancel: 'cancelled' }[
      action
    ];
    await transaction(async (client) => {
      const row = await owned(
        client,
        'campaigns',
        id,
        identity.workspaceId,
        true,
      );
      if (row.status === target) return;
      if (!canTransition('campaign', row.status, target))
        throw new DomainError(
          'INVALID_TRANSITION',
          `Campaign cannot ${action} from ${row.status}`,
          409,
        );
      if (action === 'resume' && row.mode === 'live' && !liveReady(config))
        throw new DomainError('LIVE_DISABLED', 'Live calling is disabled', 403);
      await client.query(
        'UPDATE campaigns SET status=$1,updated_at=now() WHERE id=$2 AND workspace_id=$3',
        [target, id, identity.workspaceId],
      );
      if (action === 'cancel')
        await client.query(
          "UPDATE campaign_contacts SET status='cancelled',reason='campaign_cancelled' WHERE campaign_id=$1 AND workspace_id=$2 AND status IN ('pending','queued')",
          [id, identity.workspaceId],
        );
      if (action === 'resume') {
        for (const item of (
          await client.query(
            "SELECT id FROM campaign_contacts WHERE campaign_id=$1 AND workspace_id=$2 AND status='queued'",
            [id, identity.workspaceId],
          )
        ).rows)
          await enqueueOutbox(
            client,
            'dispatch',
            { id: item.id },
            identity.workspaceId,
          );
      }
      await appendCampaignEvent(
        client,
        identity.workspaceId,
        id,
        `campaign.${target}`,
        { mode: row.mode, activeCallsMayContinue: action !== 'resume' },
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        `campaign.${action}`,
        id,
        { mode: row.mode },
      );
    });
    return this.detail(identity, id);
  }
  async contacts(
    identity: SessionIdentity,
    id: string,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    await owned(pool, 'campaigns', id, identity.workspaceId);
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    return paged(
      (
        await pool.query(
          'SELECT cc.*,c.name,c.phone,c.synthetic,a.id attempt_id,a.outcome,a.duration_seconds,a.status attempt_status FROM campaign_contacts cc JOIN contacts c ON c.id=cc.contact_id AND c.workspace_id=cc.workspace_id LEFT JOIN call_attempts a ON a.campaign_contact_id=cc.id AND a.workspace_id=cc.workspace_id WHERE cc.workspace_id=$1 AND cc.campaign_id=$2 ORDER BY cc.position,cc.id LIMIT $3 OFFSET $4',
          [identity.workspaceId, id, limit + 1, offset],
        )
      ).rows,
      limit,
      offset,
    );
  }
  async attempts(
    identity: SessionIdentity,
    id: string,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    await owned(pool, 'campaigns', id, identity.workspaceId);
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    return paged(
      (
        await pool.query(
          'SELECT * FROM call_attempts WHERE workspace_id=$1 AND campaign_id=$2 ORDER BY started_at,id LIMIT $3 OFFSET $4',
          [identity.workspaceId, id, limit + 1, offset],
        )
      ).rows,
      limit,
      offset,
    );
  }
  async listCalls(
    identity: SessionIdentity,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    const result = await pool.query(
      `SELECT ca.*, c.name as campaign_name, ct.name as contact_name, ct.phone as contact_phone
       FROM call_attempts ca
       JOIN campaigns c ON c.id = ca.campaign_id AND c.workspace_id = ca.workspace_id
       LEFT JOIN campaign_contacts cc ON cc.id = ca.campaign_contact_id AND cc.workspace_id = ca.workspace_id
       LEFT JOIN contacts ct ON ct.id = cc.contact_id AND ct.workspace_id = ca.workspace_id
       WHERE ca.workspace_id = $1
       ORDER BY ca.created_at DESC, ca.id DESC
       LIMIT $2 OFFSET $3`,
      [identity.workspaceId, limit + 1, offset],
    );
    return paged(result.rows, limit, offset);
  }
  async recording(
    identity: SessionIdentity,
    id: string,
    response: import('express').Response,
  ) {
    requireWrite(identity);
    await owned(pool, 'call_attempts', id, identity.workspaceId);
    const row = (
      await pool.query<{
        recording: Buffer | null;
        recording_status: string;
        recording_content_type: string | null;
      }>(
        'SELECT r.recording,r.recording_status,r.recording_content_type FROM call_artifacts r JOIN analyses n ON n.call_attempt_id=r.call_attempt_id WHERE r.workspace_id=$1 AND r.call_attempt_id=$2 AND n.expires_at>now()',
        [identity.workspaceId, id],
      )
    ).rows[0];
    if (!row?.recording)
      throw new DomainError(
        'RECORDING_UNAVAILABLE',
        row?.recording_status === 'processing'
          ? 'The provider recording is still processing.'
          : 'No recording is available for this interaction.',
        404,
      );
    await transaction((client) =>
      appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        'recording.accessed',
        id,
      ),
    );
    response.setHeader(
      'Content-Type',
      row.recording_content_type ?? 'audio/wav',
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(row.recording);
  }
  async call(identity: SessionIdentity, id: string): Promise<unknown> {
    const row = await owned(pool, 'call_attempts', id, identity.workspaceId);
    const analysis =
      (
        await pool.query(
          'SELECT * FROM analyses WHERE workspace_id=$1 AND call_attempt_id=$2',
          [identity.workspaceId, id],
        )
      ).rows[0] || null;
    const events = (
      await pool.query(
        'SELECT * FROM attempt_events WHERE workspace_id=$1 AND call_attempt_id=$2 ORDER BY id',
        [identity.workspaceId, id],
      )
    ).rows;
    const artifacts =
      (
        await pool.query(
          'SELECT transcript_status,recording_status,updated_at,failure_code FROM call_artifacts WHERE workspace_id=$1 AND call_attempt_id=$2',
          [identity.workspaceId, id],
        )
      ).rows[0] ?? null;
    return clean({ ...row, analysis, events, artifacts });
  }
}
