import { randomUUID } from 'node:crypto';
import {
  transaction,
  enqueueOutbox,
  appendCampaignEvent,
  appendAudit,
} from '@outreach/database';
import {
  PolicySchema,
  isWithinCallingWindow,
  NormalizedCallEventSchema,
  type NormalizedCallEvent,
} from '@outreach/contracts';
import {
  loadConfig,
  liveReady,
  allowedLiveDestinations,
} from '@outreach/config';
import {
  MockVoiceProvider,
  SarvamVoiceProvider,
  localRejectionEvent,
  ModelSummaryService,
  type CallRequest,
} from '@outreach/voice-provider';
import type { PoolClient } from 'pg';
const config = loadConfig();
export async function settleCampaign(
  client: PoolClient,
  campaignId: string,
  workspaceId: string,
) {
  const counts = (
    await client.query(
      "SELECT count(*) FILTER(WHERE status IN ('pending','queued','calling'))::int AS unfinished FROM campaign_contacts WHERE campaign_id=$1",
      [campaignId],
    )
  ).rows[0];
  if (counts.unfinished === 0) {
    const updated = await client.query(
      "UPDATE campaigns SET status='completed',updated_at=now() WHERE id=$1 AND status IN ('running','paused') RETURNING id",
      [campaignId],
    );
    if (updated.rowCount)
      await appendCampaignEvent(
        client,
        workspaceId,
        campaignId,
        'campaign.completed',
      );
  }
}
export async function applyTerminal(
  client: PoolClient,
  attemptId: string,
  event: NormalizedCallEvent,
) {
  const relationship = (
    await client.query('SELECT campaign_id FROM call_attempts WHERE id=$1', [
      attemptId,
    ])
  ).rows[0];
  if (!relationship) return;
  await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [
    relationship.campaign_id,
  ]);
  const attempt = (
    await client.query('SELECT * FROM call_attempts WHERE id=$1 FOR UPDATE', [
      attemptId,
    ])
  ).rows[0];
  if (!attempt) return;
  if (['completed', 'failed', 'cancelled'].includes(attempt.status)) {
    if (attempt.outcome !== event.outcome)
      await appendAudit(
        client,
        attempt.workspace_id,
        null,
        'webhook.conflicting_terminal',
        attemptId,
        { existing: attempt.outcome, incoming: event.outcome },
      );
    return;
  }
  if (
    event.provider !== attempt.provider ||
    event.simulated !== (attempt.mode === 'simulation')
  )
    throw new Error('Provider/mode mismatch');
  const duration = event.durationSeconds;
  const cost =
    attempt.mode === 'simulation' || event.outcome !== 'connected'
      ? 0
      : duration === null
        ? null
        : Math.ceil(duration / 60) * 350;
  await client.query(
    'UPDATE call_attempts SET status=$2,outcome=$3,provider_attempt_id=$4,completed_at=now(),duration_seconds=$5,failure_code=$6,interaction_id=$7,estimated_cost_minor=$8 WHERE id=$1',
    [
      attemptId,
      event.outcome === 'failed' ? 'failed' : 'completed',
      event.outcome,
      event.providerAttemptId,
      duration,
      event.failureCode,
      event.interactionId,
      cost,
    ],
  );
  await client.query(
    "UPDATE campaign_contacts SET status='completed' WHERE id=$1",
    [attempt.campaign_contact_id],
  );
  await client.query(
    'INSERT INTO attempt_events(workspace_id,call_attempt_id,type,payload) VALUES($1,$2,$3,$4)',
    [
      attempt.workspace_id,
      attemptId,
      'attempt.completed',
      JSON.stringify({ outcome: event.outcome, simulated: event.simulated }),
    ],
  );
  await appendCampaignEvent(
    client,
    attempt.workspace_id,
    attempt.campaign_id,
    'attempt.completed',
    {
      attemptId,
      campaignContactId: attempt.campaign_contact_id,
      outcome: event.outcome,
      simulated: event.simulated,
    },
  );
  const analysis = (
    await client.query(
      "INSERT INTO analyses(workspace_id,call_attempt_id,status,transcript,extracted_fields,synthetic,expires_at) VALUES($1,$2,'pending',$3,$4,$5,now()+($6::int*interval '1 day')) ON CONFLICT(call_attempt_id) DO NOTHING RETURNING id",
      [
        attempt.workspace_id,
        attemptId,
        JSON.stringify(event.transcript),
        JSON.stringify(event.extractedFields),
        event.simulated,
        config.RETENTION_DAYS,
      ],
    )
  ).rows[0];
  if (analysis)
    await enqueueOutbox(
      client,
      'analysis',
      { id: analysis.id },
      attempt.workspace_id,
    );
  if (cost !== null)
    await client.query(
      "INSERT INTO usage_ledger(workspace_id,call_attempt_id,mode,kind,amount_minor) VALUES($1,$2,$3,'estimated',$4) ON CONFLICT(call_attempt_id,kind) DO NOTHING",
      [attempt.workspace_id, attemptId, attempt.mode, cost],
    );
  await settleCampaign(client, attempt.campaign_id, attempt.workspace_id);
}
export async function processDispatch(id: string) {
  const selected = await transaction(async (client) => {
    const relationship = (
      await client.query(
        'SELECT campaign_id FROM campaign_contacts WHERE id=$1',
        [id],
      )
    ).rows[0];
    if (!relationship) return null;
    const campaign = (
      await client.query('SELECT * FROM campaigns WHERE id=$1 FOR UPDATE', [
        relationship.campaign_id,
      ])
    ).rows[0];
    const contact = (
      await client.query(
        'SELECT cc.*,c.phone,c.consent,c.synthetic,c.attributes FROM campaign_contacts cc JOIN contacts c ON c.id=cc.contact_id AND c.workspace_id=cc.workspace_id WHERE cc.id=$1 FOR UPDATE OF cc,c',
        [id],
      )
    ).rows[0];
    if (
      !campaign ||
      !contact ||
      campaign.status !== 'running' ||
      !['queued', 'calling'].includes(contact.status)
    )
      return null;

    const killSwitch = (
      await client.query("SELECT value FROM system_settings WHERE key = 'telephony_kill_switch'")
    ).rows[0];
    if (killSwitch?.value?.active && campaign.mode === 'live') {
      return null;
    }
    const existing = (
      await client.query(
        'SELECT * FROM call_attempts WHERE campaign_contact_id=$1 FOR UPDATE',
        [id],
      )
    ).rows[0];
    if (existing) {
      if (
        existing.provider === 'mock' &&
        ['dispatching', 'accepted'].includes(existing.status)
      )
        return {
          attemptId: existing.id,
          phone: contact.phone,
          scenario: contact.attributes.mockOutcome,
          synthetic: contact.synthetic,
          mode: campaign.mode,
        };
      return null;
    }
    const policy = PolicySchema.parse(campaign.policy);
    const suppressed =
      (
        await client.query(
          'SELECT 1 FROM suppressions WHERE workspace_id=$1 AND phone=$2',
          [campaign.workspace_id, contact.phone],
        )
      ).rows.length > 0;
    let reason = suppressed
      ? 'SUPPRESSED'
      : !contact.consent
        ? 'CONSENT_MISSING'
        : null;
    if (
      campaign.mode === 'live' &&
      (!liveReady(config) ||
        contact.synthetic ||
        !allowedLiveDestinations(config).includes(contact.phone))
    )
      reason = 'LIVE_POLICY_BLOCKED';
    if (reason) {
      await client.query(
        "UPDATE campaign_contacts SET status='excluded',reason=$2 WHERE id=$1",
        [id, reason],
      );
      await appendCampaignEvent(
        client,
        campaign.workspace_id,
        campaign.id,
        'contact.excluded',
        { campaignContactId: id, reason },
      );
      await settleCampaign(client, campaign.id, campaign.workspace_id);
      return null;
    }
    if (!isWithinCallingWindow(policy)) return null;
    // All live campaigns acquire the same workspace lock before checking limits, so parallel workers cannot over-reserve.
    await client.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [
      campaign.workspace_id,
    ]);
    const inFlight = (
      await client.query(
        "SELECT count(*) FILTER(WHERE campaign_id=$2)::int AS campaign_count,count(*)::int AS workspace_count FROM call_attempts WHERE workspace_id=$1 AND status IN ('dispatching','accepted','connected')",
        [campaign.workspace_id, campaign.id],
      )
    ).rows[0];
    if (
      inFlight.campaign_count >= policy.concurrency ||
      (campaign.mode === 'live' && inFlight.workspace_count >= 1)
    )
      return null;
    if (campaign.mode === 'live') {
      // One configured Sarvam organisation is shared by every tenant; unknown dials retain the global slot.
      await client.query('SELECT pg_advisory_xact_lock(78345193)');
      const globalLimits = (
        await client.query(
          "SELECT count(*) FILTER(WHERE status IN ('dispatching','accepted','connected','unknown'))::int in_flight,count(*) FILTER(WHERE started_at>now()-interval '1 minute')::int recent FROM call_attempts WHERE provider='sarvam'",
        )
      ).rows[0];
      if (globalLimits.in_flight >= 1 || globalLimits.recent >= 20) return null;
      if (
        campaign.reserved_minor + policy.estimatedCostPerCallMinor >
        policy.budgetMinor
      ) {
        await client.query(
          "UPDATE campaign_contacts SET status='excluded',reason='BUDGET_EXCEEDED' WHERE id=$1",
          [id],
        );
        await appendCampaignEvent(
          client,
          campaign.workspace_id,
          campaign.id,
          'contact.excluded',
          { campaignContactId: id, reason: 'BUDGET_EXCEEDED' },
        );
        await settleCampaign(client, campaign.id, campaign.workspace_id);
        return null;
      }
      await client.query(
        'UPDATE campaigns SET reserved_minor=reserved_minor+$2 WHERE id=$1',
        [campaign.id, policy.estimatedCostPerCallMinor],
      );
    }
    const attempt = (
      await client.query(
        "INSERT INTO call_attempts(workspace_id,campaign_id,campaign_contact_id,provider,mode,status,agent_version_id,provider_config) VALUES($1,$2,$3,$4,$5,'dispatching',$6,$7) RETURNING id",
        [
          campaign.workspace_id,
          campaign.id,
          id,
          campaign.mode === 'simulation' ? 'mock' : 'sarvam',
          campaign.mode,
          campaign.agent_version_id,
          campaign.mode === 'live'
            ? JSON.stringify({
                appId: config.SARVAM_APP_ID,
                appVersion: config.SARVAM_APP_VERSION,
                connectionId: config.SARVAM_CONNECTION_ID,
                orgId: config.SARVAM_ORG_ID,
                workspaceId: config.SARVAM_WORKSPACE_ID,
              })
            : null,
        ],
      )
    ).rows[0];
    await client.query(
      "UPDATE campaign_contacts SET status='calling' WHERE id=$1",
      [id],
    );
    await appendCampaignEvent(
      client,
      campaign.workspace_id,
      campaign.id,
      'attempt.started',
      {
        attemptId: attempt.id,
        campaignContactId: id,
        simulated: campaign.mode === 'simulation',
      },
    );
    await client.query(
      'INSERT INTO attempt_events(workspace_id,call_attempt_id,type,payload) VALUES($1,$2,$3,$4)',
      [
        campaign.workspace_id,
        attempt.id,
        'attempt.started',
        JSON.stringify({ simulated: campaign.mode === 'simulation' }),
      ],
    );
    if (campaign.mode === 'live')
      await client.query(
        "INSERT INTO usage_ledger(workspace_id,call_attempt_id,mode,kind,amount_minor) VALUES($1,$2,'live','reservation',$3)",
        [campaign.workspace_id, attempt.id, policy.estimatedCostPerCallMinor],
      );
    return {
      attemptId: attempt.id,
      phone: contact.phone,
      scenario: contact.attributes.mockOutcome,
      synthetic: contact.synthetic,
      mode: campaign.mode,
    };
  });
  if (!selected) return;
  const provider =
    selected.mode === 'simulation'
      ? new MockVoiceProvider(config.MOCK_LATENCY_MS)
      : new SarvamVoiceProvider(config);
  const request: CallRequest = {
    localAttemptId: selected.attemptId,
    phone: selected.phone,
    synthetic: selected.synthetic,
  };
  if (['connected', 'no_answer', 'busy', 'failed'].includes(selected.scenario))
    request.scenario = selected.scenario;
  const result = await provider.initiate(request);
  await transaction(async (client) => {
    const relationship = (
      await client.query('SELECT campaign_id FROM call_attempts WHERE id=$1', [
        selected.attemptId,
      ])
    ).rows[0];
    if (!relationship) return;
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [
      relationship.campaign_id,
    ]);
    const attempt = (
      await client.query('SELECT * FROM call_attempts WHERE id=$1 FOR UPDATE', [
        selected.attemptId,
      ])
    ).rows[0];
    if (!attempt || ['completed', 'failed'].includes(attempt.status)) return;
    if (result.kind === 'terminal')
      await applyTerminal(client, selected.attemptId, result.event);
    else if (result.kind === 'accepted') {
      await client.query(
        "UPDATE call_attempts SET status='accepted',provider_attempt_id=$2 WHERE id=$1",
        [selected.attemptId, result.providerAttemptId],
      );
      await appendCampaignEvent(
        client,
        attempt.workspace_id,
        attempt.campaign_id,
        'attempt.accepted',
        { attemptId: selected.attemptId },
      );
    } else if (result.kind === 'unknown') {
      await client.query(
        "UPDATE call_attempts SET status='unknown',failure_code=$2 WHERE id=$1",
        [selected.attemptId, result.failureCode],
      );
      await client.query(
        "UPDATE campaign_contacts SET status='unknown',reason=$2 WHERE id=$1",
        [attempt.campaign_contact_id, result.failureCode],
      );
      await appendCampaignEvent(
        client,
        attempt.workspace_id,
        attempt.campaign_id,
        'attempt.unknown',
        { attemptId: selected.attemptId, reason: result.failureCode },
      );
      await settleCampaign(client, attempt.campaign_id, attempt.workspace_id);
    } else
      await applyTerminal(
        client,
        selected.attemptId,
        localRejectionEvent(request, result.failureCode),
      );
  });
}
export async function processReconciliation(id: string) {
  await transaction(async (client) => {
    const inbox = (
      await client.query('SELECT * FROM webhook_inbox WHERE id=$1 FOR UPDATE', [
        id,
      ])
    ).rows[0];
    if (!inbox || inbox.status === 'completed') return;
    await applyTerminal(
      client,
      inbox.local_attempt_id,
      NormalizedCallEventSchema.parse(inbox.payload),
    );
    await client.query(
      "UPDATE webhook_inbox SET status='completed',processed_at=now() WHERE id=$1",
      [id],
    );
  });
}
type AnalysisWork = {
  id: string;
  workspace_id: string;
  call_attempt_id: string;
  campaign_id: string;
  status: string;
  attempt_status: string;
  mode: 'simulation' | 'live';
  outcome: NormalizedCallEvent['outcome'];
  transcript: NormalizedCallEvent['transcript'];
  synthetic: boolean;
  expires_at: Date;
  processing_started_at: Date | null;
  processing_token: string | null;
};
export async function processAnalysis(id: string) {
  const token = randomUUID();
  const work = await transaction(async (client) => {
    const analysis = (
      await client.query<AnalysisWork>(
        'SELECT a.*,ca.outcome,ca.campaign_id,ca.mode,ca.status attempt_status FROM analyses a JOIN call_attempts ca ON ca.id=a.call_attempt_id WHERE a.id=$1 FOR UPDATE OF a',
        [id],
      )
    ).rows[0];
    if (
      !analysis ||
      !['pending', 'processing'].includes(analysis.status) ||
      !['completed', 'failed'].includes(analysis.attempt_status)
    )
      return null;
    if (analysis.expires_at.getTime() <= Date.now()) {
      await client.query(
        "UPDATE analyses SET status='failed',failure_code='ANALYSIS_EXPIRED',processing_token=NULL WHERE id=$1",
        [id],
      );
      return null;
    }
    if (
      analysis.status === 'processing' &&
      analysis.processing_started_at &&
      Date.now() - analysis.processing_started_at.getTime() <
        Math.max(config.MODEL_TIMEOUT_MS + 5000, 10000)
    )
      return null;
    await client.query(
      "UPDATE analyses SET status='processing',processing_started_at=now(),processing_token=$2 WHERE id=$1",
      [id, token],
    );
    return analysis;
  });
  if (!work) return;
  const localSummary =
    work.outcome === 'connected'
      ? 'Call connected successfully. Conversation completed and outreach responses were recorded.'
      : `Call outcome: ${work.outcome}. No conversation transcript is available.`;
  const result = await new ModelSummaryService(config).summarize({
    mode: work.mode,
    outcome: work.outcome,
    transcript: work.transcript,
    localSummary,
  });
  await transaction(async (client) => {
    const updated = await client.query(
      "UPDATE analyses SET status='completed',summary=$2,summary_source=$3,summary_model=$4,summary_failure_code=$5,processing_token=NULL WHERE id=$1 AND status='processing' AND processing_token=$6 AND expires_at>now() RETURNING id",
      [
        id,
        result.summary,
        result.summarySource,
        result.summaryModel,
        result.summaryFailureCode,
        token,
      ],
    );
    if (!updated.rowCount) {
      await client.query(
        "UPDATE analyses SET status='failed',failure_code='ANALYSIS_EXPIRED',processing_token=NULL WHERE id=$1 AND status='processing' AND processing_token=$2 AND expires_at<=now()",
        [id, token],
      );
      return;
    }
    await appendCampaignEvent(
      client,
      work.workspace_id,
      work.campaign_id,
      'analysis.completed',
      {
        analysisId: id,
        attemptId: work.call_attempt_id,
        summarySource: result.summarySource,
        summaryFailureCode: result.summaryFailureCode,
      },
    );
  });
}
