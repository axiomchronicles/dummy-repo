import { describe, it, expect } from 'vitest';
import { loadConfig, liveReady } from './index';
describe('safe server configuration', () => {
  it('defaults to free mock execution with live disabled', () => {
    const config = loadConfig({});
    expect(config.VOICE_PROVIDER).toBe('mock');
    expect(config.LIVE_CALLS_ENABLED).toBe(false);
    expect(liveReady(config)).toBe(false);
  });
  it('refuses a development identity in production even when omitted', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(
      'Development authentication',
    );
    expect(
      loadConfig({ NODE_ENV: 'production', DEV_AUTH: 'false' }).DEV_AUTH,
    ).toBe(false);
  });
  it('refuses a partial live configuration and never leaks values in errors', () => {
    expect(() =>
      loadConfig({
        LIVE_CALLS_ENABLED: 'true',
        SARVAM_API_KEY: 'do-not-echo-key',
      }),
    ).toThrow('Live configuration incomplete');
    try {
      loadConfig({ API_PORT: 'secret-invalid-port' });
    } catch (error) {
      expect(String(error)).not.toContain('secret-invalid-port');
    }
  });
  it('rejects truthy strings that could accidentally enable live mode', () => {
    expect(() => loadConfig({ LIVE_CALLS_ENABLED: 'yes' })).toThrow(
      'Invalid configuration',
    );
  });
});

it('requires a separate nonempty model key only after explicit model opt-in', () => {
  const local = loadConfig({
    SARVAM_API_KEY: 'workspace-key-is-not-a-model-key',
  });
  expect(local.MODEL_PROVIDER).toBe('local');
  expect(local.SARVAM_MODEL_API_KEY).toBeUndefined();
  for (const key of [undefined, '', '   '])
    expect(() =>
      loadConfig({ MODEL_PROVIDER: 'sarvam', SARVAM_MODEL_API_KEY: key }),
    ).toThrow('SARVAM_MODEL_API_KEY');
  const configured = loadConfig({
    MODEL_PROVIDER: 'sarvam',
    SARVAM_MODEL_API_KEY: 'test-model-key',
  });
  expect(configured.LIVE_CALLS_ENABLED).toBe(false);
  expect(configured.SARVAM_MODEL_NAME).toBe('sarvam-105b');
  expect(configured.MODEL_TIMEOUT_MS).toBe(10000);
  expect(() => loadConfig({ SARVAM_MODEL_NAME: 'unverified-model' })).toThrow(
    'Invalid configuration',
  );
  expect(() => loadConfig({ MODEL_TIMEOUT_MS: 60001 })).toThrow(
    'Invalid configuration',
  );
});
