import { describe, it, expect, vi } from 'vitest';
import { pool } from '@outreach/database';
import { SarvamAnalytics, AnalyticsError } from '@outreach/voice-provider';
import { processArtifacts } from '../../apps/worker/src/artifacts';
import { Client, until, type Entity, type Page } from './helpers';
describe('provider-mocked delayed analytics → durable authorized artifacts', () => {
  it('keeps missing artifacts processing, then stores transcript/audio on the exact interaction and survives refetch', async () => {
    const client = new Client();
    const identity = await client.signIn();
    const imported = await client.imported();
    const agent = (await client.json<Page<Entity>>('/agents')).items[0]!;
    const campaign = await client.campaign(imported.id, agent.id, 'live');
    const recipient = (
      await pool.query<{ id: string }>(
        'SELECT id FROM campaign_contacts WHERE campaign_id=$1 ORDER BY position LIMIT 1',
        [campaign.id],
      )
    ).rows[0]!;
    const version = (
      await pool.query<{ agent_version_id: string }>(
        'SELECT agent_version_id FROM campaigns WHERE id=$1',
        [campaign.id],
      )
    ).rows[0]!;
    // Only an isolated provider contract fixture: campaign is never launched and no dial is submitted.
    const attempt = (
      await pool.query<{ id: string }>(
        `INSERT INTO call_attempts(workspace_id,campaign_id,campaign_contact_id,provider,mode,status,outcome,agent_version_id,provider_config,interaction_id)
    VALUES($1,$2,$3,'sarvam','live','completed','connected',$4,$5,$6) RETURNING id`,
        [
          identity.workspaceId,
          campaign.id,
          recipient.id,
          version.agent_version_id,
          JSON.stringify({ appId: 'analytics-contract-fixture' }),
          '20261027/contract-fixture',
        ],
      )
    ).rows[0]!;
    await pool.query(
      `INSERT INTO analyses(workspace_id,call_attempt_id,status,synthetic,expires_at) VALUES($1,$2,'pending',false,now()+interval '1 hour')`,
      [identity.workspaceId, attempt.id],
    );
    const artifact = (
      await pool.query<{ id: string }>(
        `INSERT INTO call_artifacts(workspace_id,call_attempt_id,interaction_id,next_poll_at) VALUES($1,$2,$3,now()+interval '1 day') RETURNING id`,
        [identity.workspaceId, attempt.id, '20261027/contract-fixture'],
      )
    ).rows[0]!;
    const transcript = vi
      .spyOn(SarvamAnalytics.prototype, 'transcript')
      .mockRejectedValue(new AnalyticsError('ARTIFACT_NOT_AVAILABLE', 60000));
    const recording = vi
      .spyOn(SarvamAnalytics.prototype, 'recording')
      .mockRejectedValue(new AnalyticsError('ARTIFACT_NOT_AVAILABLE', 60000));
    try {
      await processArtifacts(artifact.id);
      let detail = await client.json<Entity>(`/calls/${attempt.id}`);
      expect(detail.artifacts).toMatchObject({
        transcriptStatus: 'processing',
        recordingStatus: 'processing',
      });
      transcript.mockResolvedValue([
        {
          role: 'agent',
          text: '[CONTRACT FIXTURE] I am an AI assistant. Can you attend?',
        },
        {
          role: 'user',
          text: '[CONTRACT FIXTURE] I cannot attend. Please follow up.',
        },
      ]);
      recording.mockResolvedValue(Buffer.from('RIFF-ANALYTICS-FIXTURE'));
      await processArtifacts(artifact.id);
      expect(transcript).toHaveBeenLastCalledWith(
        'analytics-contract-fixture',
        '20261027/contract-fixture',
      );
      detail = await until(async () => {
        const row = await client.json<Entity>(`/calls/${attempt.id}`);
        return (row.analysis as { status: string }).status === 'completed'
          ? row
          : undefined;
      });
      expect(detail.artifacts).toMatchObject({
        transcriptStatus: 'available',
        recordingStatus: 'available',
      });
      expect(detail.analysis).toMatchObject({
        transcript: [
          {
            role: 'agent',
            text: '[CONTRACT FIXTURE] I am an AI assistant. Can you attend?',
          },
          {
            role: 'user',
            text: '[CONTRACT FIXTURE] I cannot attend. Please follow up.',
          },
        ],
      });
      const audio = await client.response(`/calls/${attempt.id}/recording`);
      expect(audio.status).toBe(200);
      expect(audio.headers.get('content-type')).toContain('audio/wav');
      expect(await audio.text()).toBe('RIFF-ANALYTICS-FIXTURE');
      const reloaded = await client.json<Entity>(`/calls/${attempt.id}`);
      expect(reloaded.analysis).toEqual(detail.analysis);
      const outsider = new Client();
      await outsider.signIn();
      expect(
        (await outsider.response(`/calls/${attempt.id}/recording`)).status,
      ).toBe(404);
      await pool.query(
        "UPDATE analyses SET expires_at=now()-interval '1 second' WHERE call_attempt_id=$1",
        [attempt.id],
      );
      expect(
        (await client.response(`/calls/${attempt.id}/recording`)).status,
      ).toBe(404);
    } finally {
      transcript.mockRestore();
      recording.mockRestore();
    }
  });
});
