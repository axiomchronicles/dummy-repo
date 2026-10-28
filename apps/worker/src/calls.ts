import {
  contactFacts,
  eligibility as recipientEligibility,
} from '@outreach/database';
import { randomUUID } from 'node:crypto';
import {
  transaction,
  verifyProviderBinding,
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
  if (
    event.outcome === 'connected' &&
    event.interactionId &&
    !event.simulated
  ) {
    const artifact = (
      await client.query<{ id: string }>(
        `INSERT INTO call_artifacts(workspace_id,call_attempt_id,interaction_id,transcript_status) VALUES($1,$2,$3,$4) ON CONFLICT(call_attempt_id) DO NOTHING RETURNING id`,
        [
          attempt.workspace_id,
          attemptId,
          event.interactionId,
          event.transcript?.length ? 'available' : 'processing',
        ],
      )
    ).rows[0];
    if (artifact)
      await enqueueOutbox(
        client,
        'artifacts',
        { id: artifact.id },
        attempt.workspace_id,
      );
  }
  const analysis = (
    await client.query(
      "INSERT INTO analyses(workspace_id,call_attempt_id,status,transcript,extracted_fields,synthetic,expires_at) VALUES($1,$2,'pending',$3,$4,$5,now()+($6::int*interval '1 day')) ON CONFLICT(call_attempt_id) DO NOTHING RETURNING id",
      [
        attempt.workspace_id,
        attemptId,
        // A not-connected attempt never carries conversation content, whatever the provider sent.
        JSON.stringify(event.outcome === 'connected' ? event.transcript : null),
        JSON.stringify(
          event.outcome === 'connected' ? event.extractedFields : null,
        ),
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
export function buildInitialBotMessage(
  recipientName: string,
  objective: string,
  language?: string | null,
): string {
  const name = recipientName?.trim() || 'there';
  let clean = (objective || '').trim();

  // Strip phone numbers
  clean = clean.replace(/\+?\d[\d\s-]{8,}\d/g, '').trim();

  // Strip conversational prefixes
  clean = clean
    .replace(
      /^(?:hey\s+|hi\s+|hello\s+|please\s+)?(?:call|dial|reach\s+out\s+to|contact)\s+[a-zA-Z]+(?:\s+[a-zA-Z]+)?\s+(?:and\s+)?/i,
      '',
    )
    .trim();
  clean = clean
    .replace(/^(?:tell|inform|notify)\s+(?:him|her|them)\s+that\s+/i, '')
    .trim();

  // Convert 3rd person to 2nd person
  clean = clean
    .replace(/\b(?:his|her|their)\s+interview\b/gi, 'your interview')
    .replace(/\b(?:his|her|their)\s+appointment\b/gi, 'your appointment')
    .replace(/\b(?:his|her|their)\s+request\b/gi, 'your request')
    .replace(/\b(?:his|her|their)\s+application\b/gi, 'your application')
    .replace(/\b(?:is\s+he|is\s+she|are\s+they)\s+coming\b/gi, 'will you be coming')
    .replace(/\b(?:is\s+he|is\s+she|are\s+they)\s+attending\b/gi, 'will you be attending')
    .replace(/\b(?:he|she|they)\s+is\b/gi, 'you are')
    .replace(/\b(?:him|her|them)\b/gi, 'you');

  const isInterview = /\binterview\b/i.test(objective);
  const isAppointment = /\bappointment\b/i.test(objective);
  const isFollowUp = /\bfollow[- ]?up\b|\bticket\b|\bissue\b/i.test(objective);
  const isHindi =
    language === 'Hindi' ||
    /hindi/i.test(language || '') ||
    /\bhindi\b/i.test(objective);

  const timeMatch = clean.match(
    /\b(?:to+m+o+r+o+w|today|tonight|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b(?:\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?(?:\s*sharp)?)?/i,
  );
  let timeStr = timeMatch ? timeMatch[0].trim() : null;
  if (timeStr) {
    // Normalize spelling of tomorrow
    timeStr = timeStr.replace(/\bto+m+o+r+o+w\b/gi, 'tomorrow');
  }

  if (isInterview) {
    const when = timeStr ? `for ${timeStr}` : 'for tomorrow at 9:00 AM sharp';
    if (isHindi) {
      return `नमस्ते ${name}, मैं यह सूचित करने के लिए कॉल कर रहा हूँ कि आपका इंटरव्यू ${timeStr ? timeStr : 'कल सुबह 9:00 बजे'} निर्धारित है। क्या आप पुष्टि कर सकते हैं कि क्या आप उपस्थित होंगे?`;
    }
    return `Hello ${name}, I am an automated assistant calling to inform you that your interview is scheduled ${when}. Could you please confirm if you will be attending?`;
  }

  if (isAppointment) {
    const when = timeStr ? `for ${timeStr}` : 'for tomorrow at 9:00 AM sharp';
    if (isHindi) {
      return `नमस्ते ${name}, मैं आपके अपॉइंटमेंट की पुष्टि के लिए कॉल कर रहा हूँ जो ${timeStr ? timeStr : 'कल सुबह 9:00 बजे'} निर्धारित है। क्या यह समय आपके लिए सही है?`;
    }
    return `Hello ${name}, I am an automated assistant calling to confirm your appointment scheduled ${when}. Could you please let me know if this time still works for you?`;
  }

  if (isFollowUp) {
    if (isHindi) {
      return `नमस्ते ${name}, मैं आपके हालिया अनुरोध के संबंध में फॉलो-अप के लिए कॉल कर रहा हूँ। क्या आपकी समस्या हल हो गई है, या आपको अतिरिक्त सहायता चाहिए?`;
    }
    return `Hello ${name}, I am calling to follow up on your recent request. Has your issue been resolved, or do you still need assistance?`;
  }

  clean = clean.replace(/\band\s+ask\s+(?:that\s+)?/i, 'and to check ').trim();
  if (isHindi) {
    return `नमस्ते ${name}, मैं एक स्वचालित सहायक हूँ और आपके विवरण की पुष्टि के लिए कॉल कर रहा हूँ। क्या आप उपलब्ध हैं?`;
  }
  return `Hello ${name}, I am an automated assistant calling regarding ${clean}. Could you please confirm your availability?`;
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
        'SELECT cc.*,c.phone,c.name,c.consent,c.synthetic,c.attributes FROM campaign_contacts cc JOIN contacts c ON c.id=cc.contact_id AND c.workspace_id=cc.workspace_id WHERE cc.id=$1 FOR UPDATE OF cc,c',
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
      await client.query(
        "SELECT value FROM system_settings WHERE key = 'telephony_kill_switch'",
      )
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
          agentVariables: {
            user_name: contact.name,
            recipient_name: contact.name,
            objective: campaign.objective,
            event_date: campaign.plan?.target?.eventDate ?? null,
            call_purpose: campaign.plan?.steps?.[1]?.description ?? campaign.objective,
          },
          synthetic: contact.synthetic,
          mode: campaign.mode,
          workspaceId: campaign.workspace_id,
          agentVersionId: campaign.agent_version_id,
          providerFingerprint: campaign.plan?.target?.providerFingerprint,
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
        (!allowedLiveDestinations(config).includes('*') &&
          !allowedLiveDestinations(config).includes(contact.phone)))
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
    const consentFacts = (
      await contactFacts(campaign.workspace_id, contact.contact_id)
    )[0];
    if (
      !consentFacts ||
      recipientEligibility(consentFacts, campaign.mode).length
    ) {
      await client.query(
        "UPDATE campaign_contacts SET status='excluded',reason='consent_evidence_changed' WHERE id=$1",
        [id],
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
          "SELECT count(*) FILTER(WHERE status IN ('dispatching','accepted','connected') OR (status='unknown' AND started_at>now()-interval '10 minutes'))::int in_flight,count(*) FILTER(WHERE started_at>now()-interval '1 minute')::int recent FROM call_attempts WHERE provider='sarvam'",
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
      agentVariables: {
        // user_name is the primary personalization variable; the Sarvam agent
        // binding is verified to have `objectiveVariable = 'objective'` so the
        // objective is also injected as a runtime variable into the agent context.
        user_name: contact.name,
        recipient_name: contact.name,
        objective: campaign.objective,
        event_date: campaign.plan?.target?.eventDate ?? null,
        call_purpose: campaign.plan?.steps?.[1]?.description ?? campaign.objective,
      },
      initialBotMessage: buildInitialBotMessage(
        contact.name,
        campaign.objective,
        campaign.plan?.target?.language,
      ),
      initialLanguageName:
        /\bhindi\b/i.test(campaign.objective) ||
        /hindi/i.test(campaign.plan?.target?.language || '')
          ? 'Hindi'
          : campaign.plan?.target?.language || 'English',
      synthetic: contact.synthetic,
      mode: campaign.mode,
      workspaceId: campaign.workspace_id,
      agentVersionId: campaign.agent_version_id,
      providerFingerprint: campaign.plan?.target?.providerFingerprint,
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
    agentVariables: selected.agentVariables,
    initialBotMessage: selected.initialBotMessage,
    initialLanguageName: selected.initialLanguageName,
  };
  if (['connected', 'no_answer', 'busy', 'failed'].includes(selected.scenario))
    request.scenario = selected.scenario;
  let deploymentVerified = true;
  if (selected.mode === 'live') {
    try {
      await verifyProviderBinding(
        config,
        selected.workspaceId,
        selected.agentVersionId,
        selected.providerFingerprint,
      );
    } catch {
      deploymentVerified = false;
    }
  }
  const result = deploymentVerified
    ? await provider.initiate(request)
    : {
        kind: 'rejected' as const,
        failureCode: 'PROVIDER_DEPLOYMENT_UNVERIFIED',
      };
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
      ? work.transcript?.length
        ? `${work.synthetic ? 'SIMULATION FIXTURE. ' : ''}Conversation connected. Recorded response: ${
            work.transcript
              .filter((turn) => turn.role === 'user')
              .map((turn) => turn.text)
              .join(' ')
              .slice(0, 1800) ||
            'No intelligible recipient response is available.'
          }`
        : 'Connection confirmed. Transcript and recipient answer are not yet available; outcome remains unknown.'
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
    const threads = (
      await client.query<{ id: string }>(
        `SELECT t.id FROM chat_threads t JOIN campaigns c ON c.id=t.campaign_id WHERE t.workspace_id=$1 AND t.campaign_id=$2 AND c.plan->'target' IS NOT NULL FOR UPDATE OF t`,
        [work.workspace_id, work.campaign_id],
      )
    ).rows;
    for (const thread of threads) {
      const existing = (
        await client.query<{ id: string }>(
          "SELECT id FROM chat_messages WHERE thread_id=$1 AND metadata->>'attemptId'=$2 LIMIT 1",
          [thread.id, work.call_attempt_id],
        )
      ).rows[0];
      const content = `${work.synthetic ? 'SIMULATION: no telephone was dialed. ' : ''}${result.summary}`;
      const metadata = JSON.stringify({
        operationId: work.campaign_id,
        attemptId: work.call_attempt_id,
        mode: work.mode,
        callPath: `/calls/${work.call_attempt_id}`,
        campaignPath: `/campaigns/${work.campaign_id}`,
        summarySource: result.summarySource,
      });
      if (existing)
        await client.query(
          'UPDATE chat_messages SET content=$2,metadata=$3 WHERE id=$1',
          [existing.id, content, metadata],
        );
      else
        await client.query(
          "INSERT INTO chat_messages(thread_id,role,content,metadata) VALUES($1,'assistant',$2,$3)",
          [thread.id, content, metadata],
        );
      await client.query(
        'UPDATE chat_threads SET updated_at=now() WHERE id=$1',
        [thread.id],
      );
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
