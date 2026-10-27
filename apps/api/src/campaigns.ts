import { Injectable, Inject } from '@nestjs/common';
import type { PoolClient } from 'pg';
import {
  pool,
  transaction,
  appendCampaignEvent,
  appendAudit,
  enqueueOutbox,
} from '@outreach/database';
import {
  CampaignInputSchema,
  CampaignPatchSchema,
  CampaignPlanSchema,
  ModelContentProposalSchema,
  ConfirmLaunchSchema,
  PolicySchema,
  canTransition,
  type ModelContentProposal,
} from '@outreach/contracts';
import { allowedLiveDestinations, liveReady } from '@outreach/config';
import { config } from './auth';
import { CampaignContentPlanner } from '@outreach/voice-provider';
import {
  planningSnapshot,
  assertPlanningSnapshot,
  buildCampaignPlan,
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
  type SessionIdentity,
} from './common';
@Injectable()
export class CampaignsService {
  constructor(
    @Inject(CampaignContentPlanner)
    private readonly planner: CampaignContentPlanner,
  ) {}
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
    return paged(result.rows, limit, offset);
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
    const input = parse(CampaignInputSchema, body);
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
          JSON.stringify(input.policy || existing.policy),
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
        'SELECT cc.id,c.consent,c.synthetic,s.id suppression_id FROM campaign_contacts cc JOIN contacts c ON c.id=cc.contact_id AND c.workspace_id=cc.workspace_id LEFT JOIN suppressions s ON s.workspace_id=c.workspace_id AND s.phone=c.phone WHERE cc.campaign_id=$1 AND cc.workspace_id=$2 ORDER BY cc.position FOR UPDATE OF cc,c',
        [campaignId, identity.workspaceId],
      )
    ).rows;
    let eligible = 0;
    const reasons = new Map<string, number>();
    for (const row of rows) {
      const reason = row.suppression_id
        ? 'suppressed'
        : !row.consent
          ? 'consent_missing'
          : mode === 'live' && row.synthetic
            ? 'synthetic_destination'
            : null;
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
    parse(ConfirmLaunchSchema, body);
    await transaction(async (client) => {
      const row = await owned(
        client,
        'campaigns',
        id,
        identity.workspaceId,
        true,
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
          'Live provider configuration and acknowledged webhook security are required',
          403,
        );
      const plan = parse(CampaignPlanSchema, row.plan);
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
    return clean({ ...row, analysis, events });
  }
}
