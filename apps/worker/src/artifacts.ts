import {
  pool,
  transaction,
  enqueueOutbox,
  appendCampaignEvent,
} from '@outreach/database';
import { loadConfig } from '@outreach/config';
import { SarvamAnalytics, AnalyticsError } from '@outreach/voice-provider';
const config = loadConfig();
export async function processArtifacts(id: string) {
  const row = (
    await pool.query<{
      id: string;
      workspace_id: string;
      call_attempt_id: string;
      interaction_id: string;
      transcript_status: string;
      recording_status: string;
      attempts: number;
      campaign_id: string;
      provider_config: { appId?: string };
      expires_at: Date;
    }>(
      `SELECT a.*,c.campaign_id,c.provider_config,n.expires_at FROM call_artifacts a JOIN call_attempts c ON c.id=a.call_attempt_id JOIN analyses n ON n.call_attempt_id=c.id WHERE a.id=$1`,
      [id],
    )
  ).rows[0];
  if (!row || row.expires_at.getTime() <= Date.now()) return;
  const appId = row.provider_config?.appId;
  if (!appId) return;
  const provider = new SarvamAnalytics(config);
  let failure: string | null = null;
  let retryMs = 60000;
  if (row.transcript_status === 'processing') {
    try {
      const transcript = await provider.transcript(appId, row.interaction_id);
      await transaction(async (client) => {
        await client.query(
          "UPDATE call_artifacts SET transcript_status='available' WHERE id=$1",
          [id],
        );
        const analysis = (
          await client.query<{ id: string }>(
            "UPDATE analyses SET transcript=$2,status='pending',summary=NULL,processing_token=NULL WHERE call_attempt_id=$1 RETURNING id",
            [row.call_attempt_id, JSON.stringify(transcript)],
          )
        ).rows[0];
        if (analysis)
          await enqueueOutbox(
            client,
            'analysis',
            { id: analysis.id },
            row.workspace_id,
          );
        await appendCampaignEvent(
          client,
          row.workspace_id,
          row.campaign_id,
          'transcript.available',
          { attemptId: row.call_attempt_id },
        );
      });
    } catch (error) {
      failure =
        error instanceof AnalyticsError
          ? error.code
          : 'ANALYTICS_RESPONSE_INVALID';
      if (error instanceof AnalyticsError)
        retryMs = Math.max(retryMs, error.retryAfterMs);
    }
  }
  if (row.recording_status === 'processing') {
    try {
      const audio = await provider.recording(appId, row.interaction_id);
      await transaction(async (client) => {
        await client.query(
          "UPDATE call_artifacts SET recording=$2,recording_content_type='audio/wav',recording_status='available' WHERE id=$1",
          [id, audio],
        );
        await appendCampaignEvent(
          client,
          row.workspace_id,
          row.campaign_id,
          'recording.available',
          { attemptId: row.call_attempt_id },
        );
      });
    } catch (error) {
      failure =
        error instanceof AnalyticsError
          ? error.code
          : 'ANALYTICS_RESPONSE_INVALID';
      if (error instanceof AnalyticsError)
        retryMs = Math.max(retryMs, error.retryAfterMs);
    }
  }
  const terminal =
    row.attempts >= 9 ||
    failure === 'ANALYTICS_AUTH' ||
    failure === 'INTERACTION_ID_INVALID';
  await pool.query(
    `UPDATE call_artifacts SET attempts=attempts+1,updated_at=now(),failure_code=$2,next_poll_at=now()+($3::int*interval '1 millisecond'),
    transcript_status=CASE WHEN $4 AND transcript_status='processing' THEN 'unavailable' ELSE transcript_status END,
    recording_status=CASE WHEN $4 AND recording_status='processing' THEN 'unavailable' ELSE recording_status END WHERE id=$1`,
    [
      id,
      failure,
      Math.min(3600000, Math.max(retryMs, 60000 * 2 ** row.attempts)),
      terminal,
    ],
  );
}
