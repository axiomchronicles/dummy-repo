import { pool, transaction, appendCampaignEvent } from '@outreach/database';
import { loadConfig } from '@outreach/config';
import { SarvamAnalytics, AnalyticsError } from '@outreach/voice-provider';
import { applyTerminal } from './calls';
const config = loadConfig();
/** Read-only reconciliation. An uncertain outbound POST is never retried. */
export async function processProviderState(id: string) {
  const attempt = (
    await pool.query<{
      workspace_id: string;
      campaign_id: string;
      provider_attempt_id: string | null;
      provider_config: { appId?: string };
      started_at: Date;
      status: string;
    }>(
      "SELECT * FROM call_attempts WHERE id=$1 AND provider='sarvam' AND status IN ('accepted','unknown')",
      [id],
    )
  ).rows[0];
  if (!attempt?.provider_attempt_id || !attempt.provider_config?.appId) return;
  try {
    const event = await new SarvamAnalytics(config).attempt(
      attempt.provider_config.appId,
      attempt.provider_attempt_id,
      attempt.started_at,
    );
    if (event) await transaction((client) => applyTerminal(client, id, event));
  } catch (error) {
    await transaction((client) =>
      appendCampaignEvent(
        client,
        attempt.workspace_id,
        attempt.campaign_id,
        'provider.poll_failed',
        {
          attemptId: id,
          code:
            error instanceof AnalyticsError ? error.code : 'ANALYTICS_PROVIDER',
        },
      ),
    );
  }
}
