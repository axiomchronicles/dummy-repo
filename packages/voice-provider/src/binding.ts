import { createHash } from 'node:crypto';
import {
  ProviderBindingFactsSchema,
  ProviderBindingInputSchema,
} from '@outreach/contracts';
import { SarvamMcp } from './mcp';
import type { z } from 'zod';
/** JSON pointers are configured by an operator against the account's returned schema. */
export function selectProviderFacts(
  result: unknown,
  fields: z.infer<typeof ProviderBindingInputSchema>['fields'],
) {
  function pointer(path: string): unknown {
    if (!path.startsWith('/')) throw new Error('PROVIDER_FIELD_POINTER');
    let current: unknown = result;
    for (const key of path
      .slice(1)
      .split('/')
      .map((key) => key.replaceAll('~1', '/').replaceAll('~0', '~'))) {
      if (
        !current ||
        typeof current !== 'object' ||
        !Object.hasOwn(current, key) ||
        ['__proto__', 'constructor', 'prototype'].includes(key)
      )
        throw new Error('PROVIDER_FIELD_POINTER');
      current = Reflect.get(current, key);
    }
    return current;
  }
  return ProviderBindingFactsSchema.parse(
    Object.fromEntries(
      Object.entries(fields).map(([field, path]) => [field, pointer(path)]),
    ),
  );
}
export function providerFingerprint(
  facts: z.infer<typeof ProviderBindingFactsSchema>,
) {
  return createHash('sha256')
    .update(JSON.stringify(ProviderBindingFactsSchema.parse(facts)))
    .digest('hex');
}
export async function readProviderBinding(
  token: string | undefined,
  input: z.infer<typeof ProviderBindingInputSchema>,
) {
  const operation = input.readArguments.operation;
  if (
    typeof operation !== 'string' ||
    ![
      'get',
      'read',
      'get_agent',
      'get_config',
      'get_app',
      'get_agent_version',
    ].includes(operation)
  )
    throw new Error('PROVIDER_READ_OPERATION_REQUIRED');
  const result = await new SarvamMcp(token).execute(
    'agents',
    input.readArguments,
  );
  let content: unknown = result.structuredContent;
  if (!content) {
    const blocks = result.content;
    if (!Array.isArray(blocks))
      throw new Error('PROVIDER_STRUCTURED_RESULT_REQUIRED');
    const text = blocks.find((block) => block.type === 'text');
    if (!text || typeof text.text !== 'string')
      throw new Error('PROVIDER_STRUCTURED_RESULT_REQUIRED');
    content = JSON.parse(text.text);
  }
  const facts = selectProviderFacts(content, input.fields);
  return { facts, fingerprint: providerFingerprint(facts) };
}
