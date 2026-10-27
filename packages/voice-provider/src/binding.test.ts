import { it, expect, vi } from 'vitest';
import {
  selectProviderFacts,
  providerFingerprint,
  readProviderBinding,
} from './binding';
import { SarvamMcp } from './mcp';
const fields = {
  appId: '/agent/id',
  version: '/agent/version',
  prompt: '/agent/prompt',
  voiceId: '/agent/voice/id',
  voiceModel: '/agent/voice/model',
  language: '/agent/language',
  objectiveVariable: '/agent/objective/name',
  objectiveInContext: '/agent/objective/inContext',
};
const agent = {
  id: 'contract-agent',
  version: 2,
  prompt: 'Identify yourself as an AI and use objective from the call context.',
  voice: { id: 'actual-catalog-id', model: 'bulbul:v4' },
  language: 'English',
  objective: { name: 'objective', inContext: true },
};
it('binds only actual returned fields and rejects missing/invalid mappings', () => {
  const facts = selectProviderFacts({ agent }, fields);
  expect(facts).toMatchObject({
    appId: 'contract-agent',
    version: 2,
    voiceModel: 'bulbul:v4',
  });
  expect(() =>
    selectProviderFacts({ agent }, { ...fields, voiceId: '/missing' }),
  ).toThrow();
  expect(() =>
    selectProviderFacts({ agent }, { ...fields, version: '/agent/prompt' }),
  ).toThrow();
  expect(providerFingerprint(facts)).not.toBe(
    providerFingerprint({ ...facts, voiceId: 'different' }),
  );
});
it('rejects write operations in binding verification before contacting the provider', async () => {
  await expect(
    readProviderBinding('test', {
      readArguments: { operation: 'commit' },
      fields,
    }),
  ).rejects.toThrow('PROVIDER_READ_OPERATION_REQUIRED');
});
it('uses official MCP structured result instead of operator-supplied facts', async () => {
  const execute = vi
    .spyOn(SarvamMcp.prototype, 'execute')
    .mockResolvedValue({ structuredContent: { agent }, content: [] });
  try {
    const result = await readProviderBinding('fixture-session', {
      readArguments: { operation: 'get', id: 'contract-agent' },
      fields,
    });
    expect(result.facts.appId).toBe(agent.id);
    expect(execute).toHaveBeenCalledWith('agents', {
      operation: 'get',
      id: 'contract-agent',
    });
  } finally {
    execute.mockRestore();
  }
});
