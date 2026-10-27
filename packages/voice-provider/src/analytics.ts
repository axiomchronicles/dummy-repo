import { z } from 'zod';
import type { Environment } from '@outreach/config';
import {
  TranscriptTurnSchema,
  type NormalizedCallEvent,
} from '@outreach/contracts';
export class AnalyticsError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryAfterMs = 0,
  ) {
    super(code);
  }
}
const TranscriptSchema = z.object({
  interaction_id: z.string(),
  messages: z
    .array(
      z.object({
        turn_id: z.number(),
        role: z.enum(['assistant', 'user']),
        content: z.string().max(20000),
        language_name: z.string().optional(),
      }),
    )
    .max(1000),
});
const AttemptsSchema = z.object({
  items: z
    .array(
      z.object({
        // Every ExternalAttemptsAPIResponse field is optional and nullable in the official reference.
        attempt_id: z.string().nullish(),
        interaction_id: z.string().nullish(),
        connectivity_status: z.string().nullish(),
        end_datetime: z.string().nullish(),
        duration_in_seconds: z.number().nullish(),
        agent_variables: z.record(z.string(), z.unknown()).nullish(),
      }),
    )
    .max(1000),
});
export class SarvamAnalytics {
  constructor(
    private readonly config: Environment,
    private readonly transport: typeof fetch = fetch,
  ) {}
  private base(appId: string) {
    const c = this.config;
    if (!c.SARVAM_API_KEY || !c.SARVAM_ORG_ID || !c.SARVAM_WORKSPACE_ID)
      throw new AnalyticsError('ANALYTICS_CONFIGURATION');
    return `https://apps.sarvam.ai/api/analytics/v1/${encodeURIComponent(c.SARVAM_ORG_ID)}/${encodeURIComponent(c.SARVAM_WORKSPACE_ID)}/${encodeURIComponent(appId)}`;
  }
  private async request(url: string) {
    let response: Response;
    try {
      response = await this.transport(url, {
        headers: { 'X-API-Key': this.config.SARVAM_API_KEY! },
        signal: AbortSignal.timeout(this.config.PROVIDER_TIMEOUT_MS),
      });
    } catch {
      throw new AnalyticsError('ANALYTICS_TIMEOUT');
    }
    if (response.status === 404)
      throw new AnalyticsError('ARTIFACT_NOT_AVAILABLE', 60000);
    if (response.status === 401 || response.status === 403)
      throw new AnalyticsError('ANALYTICS_AUTH');
    if (response.status === 429)
      throw new AnalyticsError(
        'ANALYTICS_RATE_LIMIT',
        Math.min(
          3600000,
          Math.max(
            60000,
            Number(response.headers.get('retry-after')) * 1000 || 60000,
          ),
        ),
      );
    if (!response.ok) throw new AnalyticsError('ANALYTICS_PROVIDER');
    return response;
  }
  async transcript(appId: string, interactionId: string) {
    if (!/^\d{8}\/.+/.test(interactionId))
      throw new AnalyticsError('INTERACTION_ID_INVALID');
    const response = await this.request(
      `${this.base(appId)}/transcripts/${encodeURIComponent(interactionId)}`,
    );
    const parsed = TranscriptSchema.safeParse(await response.json());
    if (!parsed.success || parsed.data.interaction_id !== interactionId)
      throw new AnalyticsError('ANALYTICS_RESPONSE_INVALID');
    if (!parsed.data.messages.length)
      throw new AnalyticsError('ARTIFACT_NOT_AVAILABLE', 60000);
    return parsed.data.messages.map((m) =>
      TranscriptTurnSchema.parse({
        role: m.role === 'assistant' ? 'agent' : 'user',
        text: m.content,
      }),
    );
  }
  async recording(appId: string, interactionId: string) {
    if (!/^\d{8}\/.+/.test(interactionId))
      throw new AnalyticsError('INTERACTION_ID_INVALID');
    const response = await this.request(
      `${this.base(appId)}/recordings/${encodeURIComponent(interactionId)}`,
    );
    if (
      !response.headers
        .get('content-type')
        ?.toLowerCase()
        .startsWith('audio/wav')
    )
      throw new AnalyticsError('RECORDING_CONTENT_INVALID');
    const reader = response.body?.getReader();
    if (!reader) throw new AnalyticsError('RECORDING_EMPTY');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > 25 * 1024 * 1024)
          throw new AnalyticsError('RECORDING_SIZE_LIMIT');
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  }
  async attempt(
    appId: string,
    attemptId: string,
    startedAt: Date,
  ): Promise<NormalizedCallEvent | null> {
    const url = new URL(`${this.base(appId)}/attempts`);
    url.searchParams.set(
      'start_datetime',
      new Date(startedAt.getTime() - 60000).toISOString(),
    );
    url.searchParams.set('end_datetime', new Date().toISOString());
    url.searchParams.set(
      'filter_conditions',
      JSON.stringify([
        { field: 'attempt_id', operator: 'equals', value: attemptId },
      ]),
    );
    url.searchParams.set('limit', '2');
    const response = await this.request(url.toString());
    const parsed = AttemptsSchema.safeParse(await response.json());
    if (!parsed.success) throw new AnalyticsError('ANALYTICS_RESPONSE_INVALID');
    const matches = parsed.data.items.filter(
      (item) => item.attempt_id === attemptId,
    );
    if (matches.length !== 1) return null;
    const item = matches[0]!;
    if (
      !['connected', 'no_answer', 'busy', 'failed'].includes(
        item.connectivity_status ?? '',
      )
    )
      return null;
    if (item.connectivity_status === 'connected' && !item.end_datetime)
      return null;
    return {
      provider: 'sarvam',
      providerAttemptId: attemptId,
      outcome: item.connectivity_status as
        'connected' | 'no_answer' | 'busy' | 'failed',
      durationSeconds: item.duration_in_seconds ?? null,
      interactionId: item.interaction_id ?? null,
      failureCode:
        item.connectivity_status === 'failed' ? 'PROVIDER_FAILED' : null,
      extractedFields: item.agent_variables ?? null,
      transcript: null,
      simulated: false,
    };
  }
}
