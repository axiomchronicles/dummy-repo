import { createHash } from 'node:crypto';
import {
  NormalizedCallEventSchema,
  SarvamRequestSchema,
  SarvamResponseSchema,
  SarvamWebhookSchema,
  type NormalizedCallEvent,
} from '@outreach/contracts';
import {
  liveReady,
  allowedLiveDestinations,
  type Environment,
} from '@outreach/config';
export type CallRequest = {
  localAttemptId: string;
  phone: string;
  scenario?: 'connected' | 'no_answer' | 'busy' | 'failed';
  synthetic?: boolean;
  agentVariables?: Record<string, unknown>;
};
export type InitiationResult =
  | { kind: 'accepted'; providerAttemptId: string }
  | { kind: 'terminal'; event: NormalizedCallEvent }
  | { kind: 'unknown' | 'rejected'; failureCode: string };
export interface VoiceProvider {
  initiate(request: CallRequest): Promise<InitiationResult>;
}
export class MockVoiceProvider implements VoiceProvider {
  constructor(private readonly latencyMs = 0) {}
  async initiate(request: CallRequest): Promise<InitiationResult> {
    if (this.latencyMs) await new Promise((r) => setTimeout(r, this.latencyMs));
    const outcomes = ['connected', 'no_answer', 'busy', 'failed'] as const;
    const outcome =
      request.scenario ??
      outcomes[
        createHash('sha256').update(request.localAttemptId).digest()[0]! % 4
      ]!;
    const connected = outcome === 'connected';
    return {
      kind: 'terminal',
      event: NormalizedCallEventSchema.parse({
        provider: 'mock',
        providerAttemptId: `mock-${request.localAttemptId}`,
        localAttemptId: request.localAttemptId,
        outcome,
        durationSeconds: connected ? 42 : null,
        interactionId: connected ? `synthetic-${request.localAttemptId}` : null,
        failureCode: outcome === 'failed' ? 'MOCK_FAILURE' : null,
        extractedFields: connected
          ? {
              interest: 'interested',
              followUpRequested: true,
              preferredTime: null,
            }
          : null,
        transcript: connected
          ? [
              {
                role: 'agent',
                text: '[SIMULATION FIXTURE] Hello, I am an AI outreach assistant. This is a test conversation; no phone was dialed.',
              },
              {
                role: 'user',
                text: '[SIMULATION FIXTURE] This is a scripted test response requesting follow-up. It is not the recipient’s actual answer.',
              },
              {
                role: 'agent',
                text: 'Thank you for confirming. We have recorded your response and will proceed accordingly.',
              },
            ]
          : null,
        simulated: true,
      }),
    };
  }
}
export function localRejectionEvent(
  request: CallRequest,
  failureCode: string,
): NormalizedCallEvent {
  return NormalizedCallEventSchema.parse({
    provider: 'sarvam',
    providerAttemptId: null,
    localAttemptId: request.localAttemptId,
    outcome: 'failed',
    durationSeconds: null,
    interactionId: null,
    failureCode,
    extractedFields: null,
    transcript: null,
    simulated: false,
  });
}
export function normalizeSarvamWebhook(payload: unknown): NormalizedCallEvent {
  const value = SarvamWebhookSchema.parse(payload);
  const metadata = value.webhook_config?.metadata;
  const localAttemptId =
    typeof metadata?.localAttemptId === 'string'
      ? metadata.localAttemptId
      : undefined;
  return NormalizedCallEventSchema.parse({
    provider: 'sarvam',
    providerAttemptId: value.attempt_id,
    ...(localAttemptId ? { localAttemptId } : {}),
    outcome: value.status,
    durationSeconds: value.duration ?? null,
    interactionId:
      value.status === 'connected' ? (value.interaction_id ?? null) : null,
    failureCode: value.status === 'failed' ? 'PROVIDER_FAILED' : null,
    extractedFields:
      value.status === 'connected'
        ? (value.final_agent_variables ?? null)
        : null,
    transcript:
      (value.status === 'connected' ? value.interaction_transcript : null)?.map(
        (turn) => ({
          role: turn.role,
          text: turn.en_text,
        }),
      ) ?? null,
    simulated: false,
  });
}
export class SarvamVoiceProvider implements VoiceProvider {
  constructor(
    private readonly config: Environment,
    private readonly transport: typeof fetch = fetch,
  ) {}
  async initiate(request: CallRequest): Promise<InitiationResult> {
    const c = this.config;
    if (
      !liveReady(c) ||
      request.synthetic ||
      !allowedLiveDestinations(c).includes(request.phone)
    )
      return { kind: 'rejected', failureCode: 'LIVE_POLICY_BLOCKED' };
    const body = SarvamRequestSchema.parse({
      app_config: {
        app_id: c.SARVAM_APP_ID,
        app_version: c.SARVAM_APP_VERSION,
        ...(request.agentVariables
          ? { agent_variables: request.agentVariables }
          : {}),
        connection_config: {
          connection_id: c.SARVAM_CONNECTION_ID,
          agent_phone_number: c.SARVAM_AGENT_PHONE_NUMBER,
        },
      },
      user_config: { user_phone_number: request.phone },
      webhook_config: {
        url: `${c.SARVAM_WEBHOOK_BASE_URL!.replace(/\/$/, '')}/api/v1/webhooks/sarvam/${c.SARVAM_WEBHOOK_TOKEN}`,
        metadata: { localAttemptId: request.localAttemptId },
      },
    });
    try {
      const response = await this.transport(
        `https://apps.sarvam.ai/api/outbounds/v1/orgs/${encodeURIComponent(c.SARVAM_ORG_ID!)}/workspaces/${encodeURIComponent(c.SARVAM_WORKSPACE_ID!)}/outbounds`,
        {
          method: 'POST',
          headers: {
            'X-API-Key': (c.SARVAM_SAMVAAD_API_KEY || c.SARVAM_API_KEY)!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(c.PROVIDER_TIMEOUT_MS),
        },
      );
      if (response.status >= 400 && response.status < 500)
        return {
          kind: 'rejected',
          failureCode:
            response.status === 429
              ? 'PROVIDER_RATE_LIMITED'
              : response.status === 401
                ? 'PROVIDER_AUTH'
                : response.status === 403
                  ? 'PROVIDER_PERMISSION'
                  : 'PROVIDER_REJECTED',
        };
      if (response.status !== 200)
        return {
          kind: 'unknown',
          failureCode: 'PROVIDER_ACCEPTANCE_UNCERTAIN',
        };
      const parsed = SarvamResponseSchema.safeParse(await response.json());
      return parsed.success
        ? { kind: 'accepted', providerAttemptId: parsed.data.attempt_id }
        : { kind: 'unknown', failureCode: 'PROVIDER_RESPONSE_UNCERTAIN' };
    } catch {
      return { kind: 'unknown', failureCode: 'PROVIDER_REQUEST_UNCERTAIN' };
    }
  }
}
export {
  CampaignContentPlanner,
  ModelSummaryService,
  AnthropicStructuredModelClient,
  ModelProviderError,
  type PlanContentInput,
  type ModelSummaryInput,
  type ModelSummaryResult,
  type ModelConfiguration,
} from './models';
export { SarvamAnalytics, AnalyticsError } from './analytics';
export { SarvamMcp } from './mcp';
export {
  readProviderBinding,
  providerFingerprint,
  selectProviderFacts,
} from './binding';
export {
  SarvamVoicePreview,
  VoicePreviewError,
  type VoicePreviewResult,
} from './tts';
