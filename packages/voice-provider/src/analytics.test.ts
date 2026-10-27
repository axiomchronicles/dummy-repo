import { describe, it, expect, vi } from 'vitest';
import { loadConfig } from '@outreach/config';
import { SarvamAnalytics } from './analytics';
const config = loadConfig({
  SARVAM_API_KEY: 'contract-test-key',
  SARVAM_ORG_ID: 'org',
  SARVAM_WORKSPACE_ID: 'workspace',
});
const id = '20261027/fixture-interaction';
describe('official Sarvam Analytics contracts', () => {
  it('maps assistant/user roles and scopes the interaction and auth header', async () => {
    const transport: typeof fetch = vi.fn(async (url, options) => {
      expect(String(url)).toContain(
        '/agent/transcripts/20261027%2Ffixture-interaction',
      );
      expect(options?.headers).toEqual({ 'X-API-Key': 'contract-test-key' });
      return Response.json({
        interaction_id: id,
        messages: [
          {
            turn_id: 1,
            role: 'assistant',
            content: 'AI disclosure',
            language_name: 'English',
          },
          { turn_id: 2, role: 'user', content: 'I cannot attend.' },
        ],
      });
    });
    expect(
      await new SarvamAnalytics(config, transport).transcript('agent', id),
    ).toEqual([
      { role: 'agent', text: 'AI disclosure' },
      { role: 'user', text: 'I cannot attend.' },
    ]);
  });
  it('handles delayed/empty transcript, unavailable recording, auth, rate limits and malformed contracts', async () => {
    for (const [response, code] of [
      [
        Response.json({ interaction_id: id, messages: [] }),
        'ARTIFACT_NOT_AVAILABLE',
      ],
      [new Response(null, { status: 403 }), 'ANALYTICS_AUTH'],
      [
        new Response(null, { status: 429, headers: { 'Retry-After': '90' } }),
        'ANALYTICS_RATE_LIMIT',
      ],
      [Response.json({ wrong: true }), 'ANALYTICS_RESPONSE_INVALID'],
    ] as const) {
      await expect(
        new SarvamAnalytics(config, async () => response).transcript(
          'agent',
          id,
        ),
      ).rejects.toMatchObject({ code });
    }
    await expect(
      new SarvamAnalytics(
        config,
        async () => new Response(null, { status: 404 }),
      ).recording('agent', id),
    ).rejects.toMatchObject({ code: 'ARTIFACT_NOT_AVAILABLE' });
  });
  it('returns actual WAV bytes and never follows provider audio URLs', async () => {
    const transport: typeof fetch = vi.fn(async (url, options) => {
      expect(String(url)).toContain(
        '/agent/recordings/20261027%2Ffixture-interaction',
      );
      expect(options?.headers).toEqual({ 'X-API-Key': 'contract-test-key' });
      return new Response('RIFFfixture', {
        headers: { 'Content-Type': 'audio/wav' },
      });
    });
    expect(
      (
        await new SarvamAnalytics(config, transport).recording('agent', id)
      ).toString(),
    ).toBe('RIFFfixture');
  });
  it.each([
    [() => new Response(null, { status: 401 }), 'ANALYTICS_AUTH', 0],
    [() => new Response(null, { status: 403 }), 'ANALYTICS_AUTH', 0],
    [
      () => new Response(null, { status: 404 }),
      'ARTIFACT_NOT_AVAILABLE',
      60000,
    ],
    [
      () =>
        new Response(null, { status: 429, headers: { 'Retry-After': '120' } }),
      'ANALYTICS_RATE_LIMIT',
      120000,
    ],
    [() => new Response(null, { status: 500 }), 'ANALYTICS_PROVIDER', 0],
    [() => new Response(null, { status: 503 }), 'ANALYTICS_PROVIDER', 0],
    [
      () =>
        new Response('{}', { headers: { 'Content-Type': 'application/json' } }),
      'RECORDING_CONTENT_INVALID',
      0,
    ],
  ] as const)(
    'recording failure %# maps to %s',
    async (response, code, retryAfterMs) => {
      await expect(
        new SarvamAnalytics(config, async () => response()).recording(
          'agent',
          id,
        ),
      ).rejects.toMatchObject({ code, retryAfterMs });
    },
  );
  it('maps timeout/outage, rejects malformed IDs and missing config without network', async () => {
    await expect(
      new SarvamAnalytics(config, async () => {
        throw new DOMException('timed out', 'TimeoutError');
      }).transcript('agent', id),
    ).rejects.toMatchObject({ code: 'ANALYTICS_TIMEOUT' });
    const transport = vi.fn<typeof fetch>();
    await expect(
      new SarvamAnalytics(config, transport).recording('agent', 'no-slash'),
    ).rejects.toMatchObject({ code: 'INTERACTION_ID_INVALID' });
    await expect(
      new SarvamAnalytics(loadConfig({}), transport).transcript('agent', id),
    ).rejects.toMatchObject({ code: 'ANALYTICS_CONFIGURATION' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('lists attempts with documented query params and tolerates nullable fields', async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      const u = new URL(String(url));
      expect(u.pathname).toBe('/api/analytics/v1/org/workspace/agent/attempts');
      expect(u.searchParams.get('limit')).toBe('2');
      expect(JSON.parse(u.searchParams.get('filter_conditions')!)).toEqual([
        { field: 'attempt_id', operator: 'equals', value: 'a-1' },
      ]);
      return Response.json({
        items: [
          {
            attempt_id: 'a-1',
            interaction_id: null,
            connectivity_status: 'no_answer',
            end_datetime: '2026-10-27T05:00:00',
            duration_in_seconds: null,
            agent_variables: null,
          },
        ],
        total: 1,
        limit: 2,
        offset: 0,
        next_page_uri: '',
        prev_page_uri: '',
      });
    });
    expect(
      await new SarvamAnalytics(config, transport).attempt(
        'agent',
        'a-1',
        new Date(),
      ),
    ).toMatchObject({
      outcome: 'no_answer',
      interactionId: null,
      durationSeconds: null,
      extractedFields: null,
    });
    await expect(
      new SarvamAnalytics(config, async () =>
        Response.json({ items: 'nope' }),
      ).attempt('agent', 'a-1', new Date()),
    ).rejects.toMatchObject({ code: 'ANALYTICS_RESPONSE_INVALID' });
  });
});
