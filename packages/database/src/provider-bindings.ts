import { pool } from './index';
import { ProviderBindingInputSchema } from '@outreach/contracts';
import { readProviderBinding } from '@outreach/voice-provider';
import type { Environment } from '@outreach/config';
export type ProviderBinding = {
  app_id: string;
  app_version: number;
  voice_id: string;
  voice_model: string;
  language: string;
  fingerprint: string;
  read_contract: unknown;
  synchronized_at: Date;
};
export async function getProviderBinding(
  workspaceId: string,
  versionId: string,
) {
  return (
    await pool.query<ProviderBinding>(
      'SELECT * FROM provider_agent_bindings WHERE workspace_id=$1 AND agent_version_id=$2',
      [workspaceId, versionId],
    )
  ).rows[0];
}
export async function verifyProviderBinding(
  config: Environment,
  workspaceId: string,
  versionId: string,
  expectedFingerprint?: string,
) {
  if (
    config.SARVAM_LOCAL_WORKSPACE_ID &&
    config.SARVAM_LOCAL_WORKSPACE_ID !== workspaceId
  )
    throw new Error('PROVIDER_WORKSPACE_UNBOUND');
  let binding = await getProviderBinding(workspaceId, versionId);
  if (!binding) {
    if (config.SARVAM_APP_ID && config.SARVAM_APP_VERSION) {
      binding = {
        app_id: config.SARVAM_APP_ID,
        app_version: config.SARVAM_APP_VERSION,
        voice_id: 'aditya_hi_conversational',
        voice_model: 'bulbul:v4-flash',
        language: 'hi-IN',
        fingerprint: 'env-synchronized',
        read_contract: {},
        synchronized_at: new Date(),
      };
    } else {
      throw new Error('AGENT_DEPLOYMENT_NOT_SYNCHRONIZED');
    }
  }
  if (
    binding.app_id !== config.SARVAM_APP_ID ||
    binding.app_version !== config.SARVAM_APP_VERSION
  )
    throw new Error('PROVIDER_DEPLOYMENT_CHANGED');
  if (
    config.SARVAM_MCP_ACCESS_TOKEN &&
    binding.read_contract &&
    Object.keys(binding.read_contract as object).length > 0
  ) {
    const verified = await readProviderBinding(
      config.SARVAM_MCP_ACCESS_TOKEN,
      ProviderBindingInputSchema.parse(binding.read_contract),
    );
    if (
      verified.fingerprint !== binding.fingerprint ||
      (expectedFingerprint && verified.fingerprint !== expectedFingerprint)
    )
      throw new Error('PROVIDER_DEPLOYMENT_CHANGED');
  }
  return binding;
}
