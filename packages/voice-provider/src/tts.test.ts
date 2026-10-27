import { describe, it, expect, vi } from 'vitest';
import { SarvamVoicePreview } from './tts';
const config = { SARVAM_MODEL_API_KEY: 'test-tts-key', MODEL_TIMEOUT_MS: 1000 };
const request = {
  model: 'bulbul:v4-flash',
  speaker: 'ritu_hi_customer',
  language: 'hi-IN',
};
const wav = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WAVE'),
  Buffer.alloc(40),
]);
const ok = () =>
  Response.json({ request_id: 'req-1', audios: [wav.toString('base64')] });
describe('Sarvam TTS voice preview', () => {
  it('calls the documented REST endpoint via the SDK with the model key', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(ok());
    const result = await new SarvamVoicePreview(config, transport).synthesize(
      request,
    );
    expect(result).toMatchObject({
      contentType: 'audio/wav',
      bytes: wav.byteLength,
      speaker: 'ritu_hi_customer',
      requestId: 'req-1',
    });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0]!;
    expect(String(url)).toBe('https://api.sarvam.ai/text-to-speech');
    expect(new Headers(options?.headers).get('api-subscription-key')).toBe(
      'test-tts-key',
    );
    const body = JSON.parse(options?.body as string);
    expect(body).toMatchObject({
      model: 'bulbul:v4-flash',
      speaker: 'ritu_hi_customer',
      language_code: 'hi-IN',
      output_audio_codec: 'wav',
    });
    expect(body.text.length).toBeLessThanOrEqual(200);
    expect(body).not.toHaveProperty('pitch');
    expect(body).not.toHaveProperty('loudness');
  });
  it('fails with MODEL_CONFIGURATION and no network when the key is missing', async () => {
    const transport = vi.fn<typeof fetch>();
    await expect(
      new SarvamVoicePreview(
        { ...config, SARVAM_MODEL_API_KEY: undefined },
        transport,
      ).synthesize(request),
    ).rejects.toMatchObject({ code: 'MODEL_CONFIGURATION' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('rejects incompatible voices before any network call', async () => {
    const transport = vi.fn<typeof fetch>();
    for (const bad of [
      { ...request, model: 'bulbul:v3', speaker: 'ritu' },
      { ...request, language: 'ta-IN' },
    ])
      await expect(
        new SarvamVoicePreview(config, transport).synthesize(bad),
      ).rejects.toMatchObject({ code: 'VOICE_INCOMPATIBLE' });
    expect(transport).not.toHaveBeenCalled();
  });
  it.each([
    [() => new Response('{}', { status: 403 }), 'VOICE_PREVIEW_AUTH'],
    [() => new Response('{}', { status: 401 }), 'VOICE_PREVIEW_AUTH'],
    [
      () =>
        new Response('{}', { status: 429, headers: { 'Retry-After': '7' } }),
      'VOICE_PREVIEW_RATE_LIMITED',
    ],
    [() => new Response('{}', { status: 422 }), 'VOICE_PREVIEW_REJECTED'],
    [
      () => new Response('{}', { status: 503 }),
      'VOICE_PREVIEW_PROVIDER_UNAVAILABLE',
    ],
    [() => Response.json({ audios: [] }), 'VOICE_PREVIEW_RESPONSE_INVALID'],
    [
      () =>
        Response.json({
          audios: [Buffer.from('not audio').toString('base64')],
        }),
      'VOICE_PREVIEW_RESPONSE_INVALID',
    ],
  ] as const)(
    'maps provider failure %# to %s without retry or fake audio',
    async (response, code) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => response());
      await expect(
        new SarvamVoicePreview(config, transport).synthesize(request),
      ).rejects.toMatchObject({ code });
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  it('maps timeouts and network outage', async () => {
    const hang: typeof fetch = (_url, init) =>
      new Promise((_, reject) =>
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        ),
      );
    await expect(
      new SarvamVoicePreview(config, hang).synthesize(request),
    ).rejects.toMatchObject({ code: 'VOICE_PREVIEW_TIMEOUT' });
    await expect(
      new SarvamVoicePreview(config, async () => {
        throw new TypeError('fetch failed');
      }).synthesize(request),
    ).rejects.toMatchObject({ code: 'VOICE_PREVIEW_PROVIDER_UNAVAILABLE' });
  });
});
