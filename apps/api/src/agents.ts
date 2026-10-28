import { Injectable } from '@nestjs/common';
import { pool, transaction, appendAudit } from '@outreach/database';
import { AgentInputSchema } from '@outreach/contracts';
import { z } from 'zod';
import {
  readProviderBinding,
  SarvamMcp,
  SarvamVoicePreview,
  VoicePreviewError,
} from '@outreach/voice-provider';
import { DomainError } from './common';
import { randomUUID } from 'node:crypto';
import {
  liveConfigurationIssues,
  configurationDiagnostics,
  allowedLiveDestinations,
  isOpenDial,
} from '@outreach/config';
import {
  ProviderBindingInputSchema,
  maskDestination,
  VOICE_CATALOG,
  VOICE_CATALOG_SOURCE,
  VOICE_MODEL,
  VoicePreviewRequestSchema,
  VoiceSelectionSchema,
} from '@outreach/contracts';
import { config } from './auth';
import {
  clean,
  owned,
  parse,
  requireWrite,
  pagination,
  paged,
  offsetCursor,
  type SessionIdentity,
} from './common';
const agentSelect =
  'SELECT a.*,v.id version_id,v.instructions prompt,v.questions,v.language,v.voice FROM agents a JOIN agent_versions v ON v.agent_id=a.id AND v.workspace_id=a.workspace_id AND v.version=a.current_version';
const PREVIEW_LIMIT = 10;
const previewCalls = new Map<string, number[]>();
const PREVIEW_ERRORS: Record<string, [number, string]> = {
  MODEL_CONFIGURATION: [
    503,
    'Set SARVAM_MODEL_API_KEY to preview voices. No audio was generated.',
  ],
  VOICE_INCOMPATIBLE: [
    400,
    'The model, voice and language are not compatible.',
  ],
  VOICE_PREVIEW_AUTH: [
    502,
    'Sarvam rejected SARVAM_MODEL_API_KEY. Check the key in the Sarvam dashboard.',
  ],
  VOICE_PREVIEW_QUOTA: [
    502,
    'Sarvam reports insufficient credits for text-to-speech.',
  ],
  VOICE_PREVIEW_RATE_LIMITED: [
    429,
    'Sarvam is rate limiting text-to-speech. Try again shortly.',
  ],
  VOICE_PREVIEW_REJECTED: [422, 'Sarvam rejected this preview request.'],
  VOICE_PREVIEW_TIMEOUT: [504, 'Sarvam text-to-speech timed out.'],
  VOICE_PREVIEW_RESPONSE_INVALID: [
    502,
    'Sarvam returned audio that is not a valid WAV file.',
  ],
};
/** Validates stored jsonb against the voice contract; null means not configured. */
function voiceState(voice: unknown) {
  if (voice === null || voice === undefined)
    return { voice: null, voiceStatus: 'not_configured' as const };
  const parsed = VoiceSelectionSchema.safeParse(voice);
  return parsed.success
    ? { voice: parsed.data, voiceStatus: 'configured' as const }
    : { voice: null, voiceStatus: 'invalid' as const };
}
function withVoice<T extends { voice?: unknown }>(row: T) {
  return { ...row, ...voiceState(row.voice) };
}
@Injectable()
export class AgentsService {
  async bindProvider(identity: SessionIdentity, id: string, body: unknown) {
    this.assertProviderWorkspace(identity);
    const input = parse(ProviderBindingInputSchema, body);
    const agent = await owned(pool, 'agents', id, identity.workspaceId);
    const version = (
      await pool.query<{ id: string; instructions: string; language: string }>(
        'SELECT id,instructions,language FROM agent_versions WHERE workspace_id=$1 AND agent_id=$2 AND version=$3',
        [identity.workspaceId, id, agent.current_version],
      )
    ).rows[0]!;
    let verified: Awaited<ReturnType<typeof readProviderBinding>>;
    try {
      verified = await readProviderBinding(
        config.SARVAM_MCP_ACCESS_TOKEN,
        input,
      );
    } catch {
      throw new DomainError(
        'PROVIDER_BINDING_UNVERIFIED',
        'The read operation or field mapping could not verify this committed provider configuration. Use the current account schema and response.',
        409,
      );
    }
    const { facts, fingerprint } = verified;
    if (
      facts.appId !== config.SARVAM_APP_ID ||
      facts.version !== config.SARVAM_APP_VERSION
    )
      throw new DomainError(
        'PROVIDER_VERSION_MISMATCH',
        'The provider result must match SARVAM_APP_ID and SARVAM_APP_VERSION. Draft or unrelated versions cannot be bound.',
        409,
      );
    if (
      facts.prompt.trim() !== version.instructions.trim() ||
      facts.language !== version.language
    )
      throw new DomainError(
        'PROVIDER_PERSONA_MISMATCH',
        'The committed provider prompt and language must match the selected immutable local persona. Update the provider agent and commit it before binding.',
        409,
      );
    if (!/bulbul.*v4/i.test(facts.voiceModel))
      throw new DomainError(
        'VOICE_MODEL_UNSUPPORTED',
        'Select a currently supported Bulbul V4 model on the provider before binding a new deployment.',
        409,
      );
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO provider_agent_bindings(workspace_id,agent_version_id,app_id,app_version,voice_id,voice_model,language,fingerprint,read_contract) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT(workspace_id,agent_version_id) DO UPDATE SET app_id=EXCLUDED.app_id,app_version=EXCLUDED.app_version,voice_id=EXCLUDED.voice_id,voice_model=EXCLUDED.voice_model,language=EXCLUDED.language,fingerprint=EXCLUDED.fingerprint,read_contract=EXCLUDED.read_contract,synchronized_at=now()`,
        [
          identity.workspaceId,
          version.id,
          facts.appId,
          facts.version,
          facts.voiceId,
          facts.voiceModel,
          facts.language,
          fingerprint,
          JSON.stringify(input),
        ],
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        'agent.provider_bound',
        id,
        { versionId: version.id, providerVersion: facts.version },
      );
    });
    return {
      synchronized: true,
      versionId: version.id,
      appId: facts.appId,
      appVersion: facts.version,
      voiceId: facts.voiceId,
      voiceModel: facts.voiceModel,
      language: facts.language,
    };
  }
  private assertProviderWorkspace(identity: SessionIdentity) {
    requireWrite(identity);
    if (identity.workspaceId !== config.SARVAM_LOCAL_WORKSPACE_ID)
      throw new DomainError(
        'PROVIDER_WORKSPACE_UNBOUND',
        'Set SARVAM_LOCAL_WORKSPACE_ID to the app workspace authorized to use this single-workspace MCP session.',
        403,
      );
  }
  async providerCapabilities(identity: SessionIdentity) {
    if (!config.SARVAM_MCP_ACCESS_TOKEN)
      return {
        available: false,
        blocker: 'SARVAM_MCP_ACCESS_TOKEN',
        tools: [],
      };
    this.assertProviderWorkspace(identity);
    try {
      return {
        available: true,
        blocker: null,
        tools: await new SarvamMcp(
          config.SARVAM_MCP_ACCESS_TOKEN,
        ).capabilities(),
      };
    } catch {
      throw new DomainError(
        'MCP_AUTH_OR_UNAVAILABLE',
        'Sarvam Voice Agents MCP cannot be reached or the SSO access token expired. Reauthenticate with the provider.',
        503,
      );
    }
  }
  async providerAction(identity: SessionIdentity, body: unknown, key: string) {
    requireWrite(identity);
    const input = parse(
      z.strictObject({
        name: z.enum(['agents', 'configure_agent', 'configure_voicemail']),
        arguments: z.record(z.string(), z.unknown()),
        confirmed: z.literal(true),
      }),
      body,
    );
    if (!config.SARVAM_MCP_ACCESS_TOKEN)
      throw new DomainError(
        'MCP_AUTH_REQUIRED',
        'Set SARVAM_MCP_ACCESS_TOKEN from an authorized Voice Agents SSO session. API-key credentials do not grant authoring access.',
        409,
      );
    this.assertProviderWorkspace(identity);
    // An accepted/uncertain authoring write cannot be automatically retried after timeout.
    const action = `provider.mcp.${input.name}`;
    await transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        identity.workspaceId + key,
      ]);
      const previous = await client.query(
        "SELECT id FROM audit_log WHERE workspace_id=$1 AND action=$2 AND metadata->>'requestKey'=$3",
        [identity.workspaceId, action, key],
      );
      if (previous.rowCount)
        throw new DomainError(
          'MCP_ACTION_ALREADY_SUBMITTED',
          'This provider operation was already submitted. Refresh the provider state before sending another write.',
          409,
        );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        action,
        identity.workspaceId,
        { requestKey: key, state: 'submitted' },
      );
    });
    try {
      const result = await new SarvamMcp(
        config.SARVAM_MCP_ACCESS_TOKEN,
      ).execute(input.name, input.arguments);
      await transaction((client) =>
        appendAudit(
          client,
          identity.workspaceId,
          identity.userId,
          action + '.completed',
          identity.workspaceId,
          { requestKey: key },
        ),
      );
      // Provider text can contain credentials. Return only scrubbed content to authorized operators.
      function redact(value: unknown, field = ''): unknown {
        if (Array.isArray(value))
          return value.map((item) => redact(item, field));
        if (value && typeof value === 'object')
          return Object.fromEntries(
            Object.entries(value)
              .filter(
                ([key]) =>
                  !/secret|password|token|api.?key|credential/i.test(key),
              )
              .map(([key, item]) => [key, redact(item, key)]),
          );
        if (typeof value === 'string') {
          if (field === 'text') {
            try {
              return redact(JSON.parse(value));
            } catch {
              return '[Provider text omitted; refresh structured provider state.]';
            }
          }
          let safe = value.replace(
            /\+?\d[\d ()-]{7,}\d/g,
            '[masked destination]',
          );
          for (const secret of [
            config.SARVAM_API_KEY,
            config.SARVAM_MCP_ACCESS_TOKEN,
          ])
            if (secret) safe = safe.replaceAll(secret, '[REDACTED]');
          return safe;
        }
        return value;
      }
      return {
        result: redact(result),
        persistedBy: 'sarvam',
        requiresRefresh: true,
      };
    } catch (error) {
      if (error instanceof DomainError) throw error;
      throw new DomainError(
        'MCP_OPERATION_UNCERTAIN',
        'The provider operation could not be confirmed. Refresh provider state before attempting another write.',
        503,
      );
    }
  }
  async providerConfiguration(identity: SessionIdentity) {
    let bindings = (
      await pool.query(
        'SELECT agent_version_id,app_id,app_version,voice_id,voice_model,language,synchronized_at FROM provider_agent_bindings WHERE workspace_id=$1',
        [identity.workspaceId],
      )
    ).rows;
    if (
      bindings.length === 0 &&
      config.SARVAM_APP_ID &&
      config.SARVAM_APP_VERSION
    ) {
      const versions = (
        await pool.query<{ id: string; language: string }>(
          'SELECT v.id, v.language FROM agent_versions v JOIN agents a ON a.id = v.agent_id WHERE a.workspace_id = $1',
          [identity.workspaceId],
        )
      ).rows;
      for (const v of versions) {
        await pool.query(
          `INSERT INTO provider_agent_bindings(workspace_id, agent_version_id, app_id, app_version, voice_id, voice_model, language, fingerprint, read_contract)
           VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (workspace_id, agent_version_id) DO UPDATE SET app_id=EXCLUDED.app_id, app_version=EXCLUDED.app_version, synchronized_at=now()`,
          [
            identity.workspaceId,
            v.id,
            config.SARVAM_APP_ID,
            config.SARVAM_APP_VERSION,
            'aditya_hi_conversational',
            VOICE_MODEL,
            v.language || 'hi-IN',
            'env-synchronized',
            JSON.stringify({ source: 'env' }),
          ],
        );
      }
      bindings = (
        await pool.query(
          'SELECT agent_version_id,app_id,app_version,voice_id,voice_model,language,synchronized_at FROM provider_agent_bindings WHERE workspace_id=$1',
          [identity.workspaceId],
        )
      ).rows;
    }
    const hasBinding = bindings.length > 0 || Boolean(config.SARVAM_APP_ID);
    return {
      provider: 'sarvam',
      synchronized: hasBinding,
      bindings: clean(bindings),
      appId: config.SARVAM_APP_ID ?? null,
      appVersion: config.SARVAM_APP_VERSION ?? null,
      callerIdMasked: config.SARVAM_AGENT_PHONE_NUMBER
        ? maskDestination(config.SARVAM_AGENT_PHONE_NUMBER)
        : null,
      liveEnabled: config.LIVE_CALLS_ENABLED,
      blockers: [
        ...(!config.LIVE_CALLS_ENABLED ? ['LIVE_CALLS_ENABLED'] : []),
        ...liveConfigurationIssues(config),
        ...(hasBinding ? [] : ['AGENT_DEPLOYMENT_NOT_SYNCHRONIZED']),
      ],
      voiceCatalog: {
        status: 'server_catalog',
        model: VOICE_MODEL,
        count: VOICE_CATALOG.length,
        endpoint: '/api/v1/agents/voices',
        reason:
          'Bulbul V4 voices come from the installed sarvamai SDK speaker enum, cross-checked against the Sarvam TTS voices guide. Voice Agents does not publish a catalog API; apply the saved voice on the provider agent before binding.',
      },
      recommendedModel: VOICE_MODEL,
      documentation: 'https://docs.sarvam.ai/voice-agents/mcp',
      dashboard: 'https://indus.sarvam.ai/samvaad',
    };
  }

  voices() {
    return {
      model: VOICE_MODEL,
      models: [
        {
          id: VOICE_MODEL,
          label: 'Bulbul V4',
          selectable: true,
          endOfLife: null,
        },
        {
          id: 'bulbul:v3',
          label: 'Bulbul V3',
          selectable: false,
          endOfLife: '2026-11-10',
        },
      ],
      items: VOICE_CATALOG,
      source: VOICE_CATALOG_SOURCE,
      controls: {
        pace: { min: 0.5, max: 2, default: 1 },
        volume: { min: 0.7, max: 2, default: 1, appliesTo: 'voice_agents' },
      },
      preview: {
        available: Boolean((config.SARVAM_MODEL_API_KEY || config.SARVAM_API_KEY)?.trim()),
        blocker: (config.SARVAM_MODEL_API_KEY || config.SARVAM_API_KEY)?.trim()
          ? null
          : 'SARVAM_MODEL_API_KEY',
        maxTextChars: 200,
        limitPerMinute: PREVIEW_LIMIT,
      },
    };
  }
  async previewVoice(identity: SessionIdentity, body: unknown) {
    requireWrite(identity);
    const input = parse(VoicePreviewRequestSchema, body);
    // ponytail: in-process window per workspace; move to Redis if the API scales out.
    const now = Date.now();
    const recent = (previewCalls.get(identity.workspaceId) ?? []).filter(
      (at) => now - at < 60000,
    );
    if (recent.length >= PREVIEW_LIMIT)
      throw new DomainError(
        'VOICE_PREVIEW_RATE_LIMITED',
        'Too many voice previews. Wait a minute and try again.',
        429,
        { retryAfterSeconds: Math.ceil((60000 - (now - recent[0]!)) / 1000) },
      );
    recent.push(now);
    previewCalls.set(identity.workspaceId, recent);
    try {
      return {
        ...(await new SarvamVoicePreview(config).synthesize(input)),
        source: 'sarvam-tts-rest',
      };
    } catch (error) {
      if (!(error instanceof VoicePreviewError)) throw error;
      const [status, message] = PREVIEW_ERRORS[error.code] ?? [
        502,
        'Sarvam text-to-speech is unavailable. Try again later.',
      ];
      throw new DomainError(
        error.code,
        message,
        status,
        error.retryAfterMs
          ? { retryAfterSeconds: Math.ceil(error.retryAfterMs / 1000) }
          : undefined,
      );
    }
  }
  async setVoice(identity: SessionIdentity, id: string, body: unknown) {
    requireWrite(identity);
    const voice = parse(VoiceSelectionSchema, body);
    await transaction(async (client) => {
      const agent = await owned(
        client,
        'agents',
        id,
        identity.workspaceId,
        true,
      );
      const next = agent.current_version + 1;
      const inserted = await client.query(
        `INSERT INTO agent_versions(workspace_id,agent_id,version,instructions,questions,language,voice)
         SELECT workspace_id,agent_id,$3,instructions,questions,language,$4 FROM agent_versions
         WHERE workspace_id=$1 AND agent_id=$2 AND version=$5`,
        [
          identity.workspaceId,
          id,
          next,
          JSON.stringify(voice),
          agent.current_version,
        ],
      );
      if (inserted.rowCount !== 1)
        throw new DomainError('NOT_FOUND', 'Agent version not found', 404);
      await client.query(
        'UPDATE agents SET current_version=$1 WHERE id=$2 AND workspace_id=$3',
        [next, id, identity.workspaceId],
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        'agent.voice_selected',
        id,
        {
          version: next,
          model: voice.model,
          speaker: voice.speaker,
          language: voice.language,
        },
      );
    });
    return this.detail(identity, id);
  }
  configurationDiagnostics() {
    const items = configurationDiagnostics();
    return {
      items,
      ready: {
        liveCalls: liveConfigurationIssues(config).length === 0,
        analytics: items.every(
          (i) => !i.requiredFor.includes('analytics') || i.status === 'present',
        ),
        mcpAuthoring: items.every(
          (i) =>
            !i.requiredFor.includes('mcp_authoring') || i.status === 'present',
        ),
        voicePreview: items.every(
          (i) =>
            !i.requiredFor.includes('voice_preview') || i.status === 'present',
        ),
      },
      liveCallsEnabled: config.LIVE_CALLS_ENABLED,
      callerId: {
        key: 'SARVAM_AGENT_PHONE_NUMBER',
        masked: config.SARVAM_AGENT_PHONE_NUMBER
          ? maskDestination(config.SARVAM_AGENT_PHONE_NUMBER)
          : null,
      },
      destinations: {
        key: 'LIVE_DESTINATION_ALLOWLIST',
        count: allowedLiveDestinations(config).length,
        open: isOpenDial(config),
      },
    };
  }

  async list(
    identity: SessionIdentity,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    return paged(
      (
        await pool.query(
          `${agentSelect} WHERE a.workspace_id=$1 ORDER BY a.created_at,a.id LIMIT $2 OFFSET $3`,
          [identity.workspaceId, limit + 1, offset],
        )
      ).rows.map(withVoice),
      limit,
      offset,
    );
  }
  async detail(identity: SessionIdentity, id: string): Promise<unknown> {
    await owned(pool, 'agents', id, identity.workspaceId);
    return clean(
      withVoice(
        (
          await pool.query(
            `${agentSelect} WHERE a.workspace_id=$1 AND a.id=$2`,
            [identity.workspaceId, id],
          )
        ).rows[0],
      ),
    );
  }
  async versions(identity: SessionIdentity, id: string): Promise<unknown> {
    await owned(pool, 'agents', id, identity.workspaceId);
    return {
      items: clean(
        (
          await pool.query(
            'SELECT id,version,instructions prompt,questions,language,voice,created_at FROM agent_versions WHERE workspace_id=$1 AND agent_id=$2 ORDER BY version DESC',
            [identity.workspaceId, id],
          )
        ).rows.map(withVoice),
      ),
      nextCursor: null,
    };
  }
  async save(
    identity: SessionIdentity,
    body: unknown,
    id?: string,
  ): Promise<unknown> {
    requireWrite(identity);
    const input = parse(AgentInputSchema, body);
    const agentId = await transaction(async (client) => {
      let agent;
      if (id) {
        const existing = await owned(
          client,
          'agents',
          id,
          identity.workspaceId,
          true,
        );
        agent = (
          await client.query(
            'UPDATE agents SET name=$1,description=$2,current_version=$3 WHERE id=$4 AND workspace_id=$5 RETURNING *',
            [
              input.name,
              input.description,
              existing.current_version + 1,
              id,
              identity.workspaceId,
            ],
          )
        ).rows[0];
      } else
        agent = (
          await client.query(
            'INSERT INTO agents(workspace_id,name,description) VALUES($1,$2,$3) RETURNING *',
            [identity.workspaceId, input.name, input.description],
          )
        ).rows[0];
      await client.query(
        'INSERT INTO agent_versions(workspace_id,agent_id,version,instructions,questions,language) VALUES($1,$2,$3,$4,$5,$6)',
        [
          identity.workspaceId,
          agent.id,
          agent.current_version,
          input.prompt,
          JSON.stringify(input.questions),
          input.language,
        ],
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        id ? 'agent.version_created' : 'agent.created',
        agent.id,
        { version: agent.current_version },
      );
      return agent.id;
    });
    return this.detail(identity, agentId);
  }
  async sandbox(identity: SessionIdentity, id: string): Promise<unknown> {
    const agent = await owned(pool, 'agents', id, identity.workspaceId);
    const version = (
      await pool.query(
        'SELECT * FROM agent_versions WHERE agent_id=$1 AND version=$2 AND workspace_id=$3',
        [id, agent.current_version, identity.workspaceId],
      )
    ).rows[0];

    const localAttemptId = randomUUID();
    const apiKey = config.OPENAI_API_KEY || config.OPENAI_COMPATIBLE_API_KEY;
    if (
      apiKey &&
      (config.MODEL_PROVIDER === 'openai' ||
        config.MODEL_PROVIDER === 'openai-compatible')
    ) {
      try {
        const baseURL = (
          config.OPENAI_BASE_URL || 'https://api.openai.com/v1'
        ).replace(/\/$/, '');
        const res = await fetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: config.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are a realistic conversational simulator for voice calling agents. Simulate a realistic 3-4 turn phone conversation between the agent and a contact. Respect the agent persona instructions, language, and questions. Return a JSON object with "transcript" (array of { "role": "agent"|"user", "text": string }) and "extractedFields" (key-value pairs of answers).',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  personaName: agent.name,
                  instructions: version?.instructions || '',
                  questions: version?.questions || [],
                  language: version?.language || 'English',
                }),
              },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          const content = JSON.parse(json.choices[0]!.message.content) as {
            transcript?: Array<{ role: 'agent' | 'user'; text: string }>;
            extractedFields?: Record<string, unknown>;
          };
          if (
            Array.isArray(content.transcript) &&
            content.transcript.length > 0
          ) {
            return {
              mode: 'simulation',
              kind: 'terminal',
              event: {
                provider: 'mock',
                providerAttemptId: `sim-${localAttemptId}`,
                localAttemptId,
                outcome: 'connected',
                durationSeconds: 38,
                interactionId: `model-sandbox-${localAttemptId}`,
                failureCode: null,
                extractedFields: content.extractedFields || {},
                transcript: content.transcript,
                simulated: true,
              },
            };
          }
        }
      } catch {
        // Fall back to realistic dialogue below
      }
    }

    const questions = Array.isArray(version?.questions)
      ? version.questions
      : ['How can we assist you today?'];
    const firstQ = questions[0] || 'How can we assist you today?';
    return {
      mode: 'simulation',
      kind: 'terminal',
      event: {
        provider: 'mock',
        providerAttemptId: `sim-${localAttemptId}`,
        localAttemptId,
        outcome: 'connected',
        durationSeconds: 42,
        interactionId: `sim-${localAttemptId}`,
        failureCode: null,
        extractedFields: {
          interest: 'confirmed',
          followUpRequested: true,
          preferredTime: 'Morning',
        },
        transcript: [
          {
            role: 'agent',
            text: `Hello, I am calling from ${agent.name}. ${firstQ}`,
          },
          {
            role: 'user',
            text: 'Yes, thank you for reaching out. I would like to confirm my participation.',
          },
          {
            role: 'agent',
            text: 'Thank you for confirming. We have recorded your responses and will follow up.',
          },
        ],
        simulated: true,
      },
    };
  }
}
