import { describe, it, expect } from 'vitest';
import {
  loadConfig,
  liveReady,
  configurationDiagnostics,
  allowedLiveDestinations,
  isOpenDial,
} from './index';
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
      loadConfig({ MODEL_PROVIDER: 'sarvam', SARVAM_API_KEY: key, SARVAM_MODEL_API_KEY: key }),
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

it('supports anthropic model provider configuration', () => {
  const config = loadConfig({
    MODEL_PROVIDER: 'anthropic',
    ANTHROPIC_API_KEY: 'sk-ant-test',
    ANTHROPIC_BASE_URL: 'https://api.anthropic.com',
    ANTHROPIC_MODEL: 'claude-3-5-haiku-20241022',
  });
  expect(config.MODEL_PROVIDER).toBe('anthropic');
  expect(config.ANTHROPIC_API_KEY).toBe('sk-ant-test');
  expect(config.ANTHROPIC_MODEL).toBe('claude-3-5-haiku-20241022');

  expect(() =>
    loadConfig({
      NODE_ENV: 'production',
      DEV_AUTH: 'false',
      MODEL_PROVIDER: 'anthropic',
      ANTHROPIC_API_KEY: '',
    }),
  ).toThrow('ANTHROPIC_API_KEY');
});
describe('configuration diagnostics', () => {
  it('diagnoses Sarvam keys by name only and keeps caller ID out of destinations', () => {
    const items = configurationDiagnostics({
      SARVAM_API_KEY: 'secret-value-never-echoed',
      SARVAM_APP_VERSION: 'not-a-number',
      SARVAM_AGENT_PHONE_NUMBER: '+12025550101',
      SARVAM_WEBHOOK_BASE_URL: 'http://insecure.example',
      SARVAM_WEBHOOK_TOKEN: 'short',
      LIVE_DESTINATION_ALLOWLIST: '+12025550102,+12025550101',
      SARVAM_LOCAL_WORKSPACE_ID: 'not-a-uuid',
    });
    const status = Object.fromEntries(
      items.map((i) => [i.key, [i.status, i.issue]]),
    );
    expect(status).toMatchObject({
      SARVAM_API_KEY: ['present', null],
      SARVAM_ORG_ID: ['missing', null],
      SARVAM_APP_VERSION: ['invalid', 'FORMAT'],
      SARVAM_AGENT_PHONE_NUMBER: ['present', null],
      SARVAM_WEBHOOK_BASE_URL: ['invalid', 'HTTPS_REQUIRED'],
      SARVAM_WEBHOOK_TOKEN: ['invalid', 'ENTROPY_32_BYTES_REQUIRED'],
      LIVE_DESTINATION_ALLOWLIST: ['invalid', 'CONTAINS_CALLER_ID'],
      SARVAM_LOCAL_WORKSPACE_ID: ['invalid', 'FORMAT'],
      SARVAM_MCP_ACCESS_TOKEN: ['missing', null],
    });
    expect(JSON.stringify(items)).not.toMatch(/secret-value|2025550/);
  });

  it('accepts * as a valid open-dial allowlist entry in diagnostics', () => {
    const items = configurationDiagnostics({
      SARVAM_AGENT_PHONE_NUMBER: '+12025550101',
      LIVE_DESTINATION_ALLOWLIST: '*',
    });
    const status = Object.fromEntries(
      items.map((i) => [i.key, [i.status, i.issue]]),
    );
    // '*' is a valid open-dial configuration; must not report E164_REQUIRED or CONTAINS_CALLER_ID.
    expect(status['LIVE_DESTINATION_ALLOWLIST']).toEqual(['present', null]);
  });

  it('rejects a mixed list containing * and an E164 number', () => {
    const items = configurationDiagnostics({
      LIVE_DESTINATION_ALLOWLIST: '*,+12025550102',
    });
    const status = Object.fromEntries(
      items.map((i) => [i.key, [i.status, i.issue]]),
    );
    // '*' mixed with specific numbers is invalid — use one or the other.
    expect(status['LIVE_DESTINATION_ALLOWLIST'][0]).toBe('invalid');
  });
});

describe('allowedLiveDestinations and isOpenDial', () => {
  it('returns ["*"] and isOpenDial=true for the wildcard setting', () => {
    const cfg = loadConfig({ LIVE_DESTINATION_ALLOWLIST: '*' });
    expect(allowedLiveDestinations(cfg)).toEqual(['*']);
    expect(isOpenDial(cfg)).toBe(true);
  });

  it('returns specific numbers and isOpenDial=false for an explicit list', () => {
    const cfg = loadConfig({
      LIVE_DESTINATION_ALLOWLIST: '+12025550102, +12025550103',
    });
    expect(allowedLiveDestinations(cfg)).toEqual(['+12025550102', '+12025550103']);
    expect(isOpenDial(cfg)).toBe(false);
  });

  it('returns [] and isOpenDial=false when the list is empty', () => {
    const cfg = loadConfig({ LIVE_DESTINATION_ALLOWLIST: '' });
    expect(allowedLiveDestinations(cfg)).toEqual([]);
    expect(isOpenDial(cfg)).toBe(false);
  });
});
