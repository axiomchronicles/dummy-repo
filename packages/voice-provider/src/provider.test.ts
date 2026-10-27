import { describe, it, expect, vi } from 'vitest';
import { loadConfig } from '@outreach/config';
import {
  MockVoiceProvider,
  SarvamVoiceProvider,
  normalizeSarvamWebhook,
  localRejectionEvent,
} from './index';
const id = '10000000-0000-4000-8000-000000000001';
const live = loadConfig({
  VOICE_PROVIDER: 'sarvam',
  LIVE_CALLS_ENABLED: true,
  SARVAM_API_KEY: 'test-only-key',
  SARVAM_ORG_ID: 'org',
  SARVAM_WORKSPACE_ID: 'workspace',
  SARVAM_APP_ID: 'app',
  SARVAM_APP_VERSION: 1,
  SARVAM_CONNECTION_ID: 'connection',
  SARVAM_AGENT_PHONE_NUMBER: '+12025550101',
  SARVAM_WEBHOOK_BASE_URL: 'https://callback.example',
  SARVAM_WEBHOOK_TOKEN: 'a'.repeat(43),
  SARVAM_WEBHOOK_FALLBACK_ACKNOWLEDGED: true,
  LIVE_DESTINATION_ALLOWLIST: '+12025550102',
});
describe('provider boundary', () => {
  it.each(['connected', 'no_answer', 'busy', 'failed'] as const)(
    'mock produces %s without network',
    async (scenario) => {
      const network = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
        throw new Error('network forbidden');
      });
      try {
        const result = await new MockVoiceProvider().initiate({
          localAttemptId: id,
          phone: '+12025550102',
          scenario,
        });
        expect(result.kind).toBe('terminal');
        if (result.kind === 'terminal') {
          expect(result.event.outcome).toBe(scenario);
          expect(result.event.simulated).toBe(true);
          expect(
            result.event.extractedFields?.preferredTime ?? null,
          ).toBeNull();
        }
        expect(network).not.toHaveBeenCalled();
      } finally {
        network.mockRestore();
      }
    },
  );
  it('uses verified HTTP request and acceptance is not completion', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ attempt_id: 'vendor-1' }), {
        status: 200,
      }),
    );
    const result = await new SarvamVoiceProvider(live, transport).initiate({
      localAttemptId: id,
      phone: '+12025550102',
    });
    expect(result).toEqual({ kind: 'accepted', providerAttemptId: 'vendor-1' });
    const [url, options] = transport.mock.calls[0]!;
    expect(url).toBe(
      'https://apps.sarvam.ai/api/outbounds/v1/orgs/org/workspaces/workspace/outbounds',
    );
    expect(options?.headers).toEqual({
      'X-API-Key': 'test-only-key',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(options?.body as string)).toMatchObject({
      app_config: {
        app_id: 'app',
        app_version: 1,
        connection_config: {
          connection_id: 'connection',
          agent_phone_number: '+12025550101',
        },
      },
      user_config: { user_phone_number: '+12025550102' },
      webhook_config: { metadata: { localAttemptId: id } },
    });
  });
  it.each(['timeout', 'invalid200', 'server500'])(
    'does not redial ambiguous %s',
    async (kind) => {
      const transport = vi.fn<typeof fetch>();
      if (kind === 'timeout') transport.mockRejectedValue(new Error('timeout'));
      else
        transport.mockResolvedValue(
          new Response(kind === 'invalid200' ? '{}' : 'error', {
            status: kind === 'server500' ? 500 : 200,
          }),
        );
      expect(
        (
          await new SarvamVoiceProvider(live, transport).initiate({
            localAttemptId: id,
            phone: '+12025550102',
          })
        ).kind,
      ).toBe('unknown');
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it('default and synthetic invocation block transport', async () => {
    const transport = vi.fn<typeof fetch>();
    expect(
      (
        await new SarvamVoiceProvider(loadConfig({}), transport).initiate({
          localAttemptId: id,
          phone: '+12025550102',
        })
      ).kind,
    ).toBe('rejected');
    expect(
      (
        await new SarvamVoiceProvider(live, transport).initiate({
          localAttemptId: id,
          phone: '+12025550102',
          synthetic: true,
        })
      ).kind,
    ).toBe('rejected');
    expect(transport).not.toHaveBeenCalled();
  });
  it('normalizes only verified callback data and drops caller/vendor failure', () => {
    const event = normalizeSarvamWebhook({
      attempt_id: 'x',
      status: 'failed',
      channel_info: {
        channel_type: 'v2v',
        channel_provider: 'exotel',
        agent_phone_number: '+12025550101',
      },
      failure_reason: 'private provider detail',
      webhook_config: {
        url: 'https://callback.example/secret',
        metadata: { localAttemptId: id },
      },
      interaction_transcript: null,
    });
    expect(event.failureCode).toBe('PROVIDER_FAILED');
    expect(event.transcript).toBeNull();
    expect(JSON.stringify(event)).not.toContain('private');
    expect(JSON.stringify(event)).not.toContain('+12025550101');
    expect(JSON.stringify(event)).not.toContain('secret');
  });
  it('normalizes a rejected outbound response with no invented vendor attempt identifier', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ detail: [] }), { status: 422 }),
      );
    const request = { localAttemptId: id, phone: '+12025550102' };
    const result = await new SarvamVoiceProvider(live, transport).initiate(
      request,
    );
    expect(result.kind).toBe('rejected');
    if (result.kind !== 'rejected')
      throw new Error('Expected permanent rejection');
    const event = localRejectionEvent(request, result.failureCode);
    expect(event).toMatchObject({
      provider: 'sarvam',
      providerAttemptId: null,
      localAttemptId: id,
      outcome: 'failed',
      failureCode: 'PROVIDER_REJECTED',
      simulated: false,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(() =>
      normalizeSarvamWebhook({
        attempt_id: null,
        status: 'failed',
        channel_info: {
          channel_type: 'v2v',
          channel_provider: 'exotel',
          agent_phone_number: '+12025550101',
        },
      }),
    ).toThrow();
  });
  it.each([
    [401, 'PROVIDER_AUTH'],
    [402, 'PROVIDER_INSUFFICIENT_CREDITS'],
    [403, 'PROVIDER_PERMISSION'],
    [429, 'PROVIDER_RATE_LIMITED'],
    [404, 'PROVIDER_REJECTED'],
  ] as const)(
    'maps outbound %s to permanent %s without redial',
    async (status, failureCode) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{}', { status }));
      expect(
        await new SarvamVoiceProvider(live, transport).initiate({
          localAttemptId: id,
          phone: '+12025550102',
        }),
      ).toEqual({ kind: 'rejected', failureCode });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
});
