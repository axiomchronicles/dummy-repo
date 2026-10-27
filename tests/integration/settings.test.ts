import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '@outreach/database';
import {
  AgentSchema,
  CampaignSchema,
  ErrorSchema,
  IdentitySchema,
  ListSchema,
  UserSessionListSchema,
  WorkspaceSettingsSchema,
} from '@outreach/contracts';
import { Client, type Entity, type Identity } from './helpers';

/** A second session for the same user, as another device would hold. */
async function signInAs(email: string) {
  const client = new Client();
  const response = await client.response('/auth/demo', { email });
  expect(response.status).toBe(200);
  client.cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { client, identity: (await response.json()) as Identity };
}
async function errorCode(response: Response) {
  return ErrorSchema.parse(await response.json()).error.code;
}

describe('workspace settings, profile, sessions and legacy plans', () => {
  const client = new Client();
  let identity: Identity;
  let agents: { id: string; versionId?: unknown }[];
  let imported: Entity;
  beforeAll(async () => {
    identity = await client.signIn();
    agents = ListSchema(AgentSchema).parse(await client.json('/agents')).items;
    imported = await client.imported();
    expect(imported.status).toBe('ready');
  });
  afterAll(async () => {
    await pool.end();
  });

  it('lists a campaign whose stored plan is legacy-shaped and refuses to launch it', async () => {
    const campaign = await client.campaign(imported.id, agents[0].id);
    await pool.query(
      "UPDATE campaigns SET status='planned',plan=$1 WHERE id=$2",
      [
        JSON.stringify({
          model: 'legacy-model',
          steps: [{ name: 'Intro', description: 'Legacy step' }],
          planner: 'openai',
          version: 1,
          questions: ['Legacy question?'],
        }),
        campaign.id,
      ],
    );
    const list = await client.response('/campaigns');
    expect(list.status).toBe(200);
    const row = ListSchema(CampaignSchema)
      .parse(await list.json())
      .items.find((item) => item.id === campaign.id)!;
    expect(row.plan).toBeNull();
    expect(row.planIssue).toBe('LEGACY_PLAN_INVALID');
    const detail = CampaignSchema.parse(
      await client.json('/campaigns/' + campaign.id),
    );
    expect(detail.planIssue).toBe('LEGACY_PLAN_INVALID');
    const launch = await client.response(
      '/campaigns/' + campaign.id + '/simulate',
      { confirmed: true },
      randomUUID(),
    );
    expect(launch.status).toBe(409);
    expect(await errorCode(launch)).toBe('PLAN_INVALID');
    // Stored data is untouched.
    const stored = await pool.query('SELECT plan FROM campaigns WHERE id=$1', [
      campaign.id,
    ]);
    expect(stored.rows[0].plan.model).toBe('legacy-model');
  });

  it('reads defaults, validates and persists settings with role and audit', async () => {
    const initial = WorkspaceSettingsSchema.parse(
      await client.json('/settings'),
    );
    expect(initial.role).toBe('owner');
    expect(initial.settings).toMatchObject({
      defaultAgentId: null,
      callWindowStart: '00:00',
      callWindowEnd: '23:59',
      budgetMinor: 10000,
      estimatedCostPerCallMinor: 500,
      currency: 'INR',
    });
    for (const body of [
      { callWindowStart: '18:00', callWindowEnd: '09:00' },
      { callWindowEnd: '00:00' },
      { defaultRegion: 'QQ' },
      { budgetMinor: -1 },
      { extra: true },
    ]) {
      const response = await client.response(
        '/settings',
        body,
        undefined,
        'PATCH',
      );
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(await errorCode(response)).toBe('VALIDATION_ERROR');
    }
    const foreign = new Client();
    await foreign.signIn();
    const foreignAgent = ListSchema(AgentSchema).parse(
      await foreign.json('/agents'),
    ).items[0].id;
    const rejected = await client.response(
      '/settings',
      { defaultAgentId: foreignAgent },
      undefined,
      'PATCH',
    );
    expect(rejected.status).toBe(404);
    expect(await errorCode(rejected)).toBe('AGENT_NOT_FOUND');
    const saved = WorkspaceSettingsSchema.parse(
      await client.json(
        '/settings',
        {
          defaultRegion: 'IN',
          defaultAgentId: agents[1].id,
          callWindowStart: '09:00',
          callWindowEnd: '18:30',
          budgetMinor: 25000,
          estimatedCostPerCallMinor: 700,
        },
        undefined,
        'PATCH',
      ),
    );
    expect(saved.settings).toMatchObject({
      defaultRegion: 'IN',
      defaultAgentId: agents[1].id,
      callWindowStart: '09:00',
      callWindowEnd: '18:30',
      budgetMinor: 25000,
      estimatedCostPerCallMinor: 700,
    });
    const audit = await pool.query(
      "SELECT metadata FROM audit_log WHERE workspace_id=$1 AND action='workspace.settings_changed' ORDER BY id DESC LIMIT 1",
      [identity.workspaceId],
    );
    expect(audit.rows[0].metadata.fields).toContain('defaultAgentId');
    expect(JSON.stringify(audit.rows[0].metadata)).not.toContain('25000');
  });

  it('applies settings to wizard campaigns and direct chat calls', async () => {
    const created = CampaignSchema.parse(
      await client.json('/campaigns', {
        name: 'Defaults campaign',
        objective: 'Gather explicitly synthetic feedback',
        importId: imported.id,
        agentId: agents[0].id,
      }),
    );
    expect(created.policy).toMatchObject({
      windowStart: '09:00',
      windowEnd: '18:30',
      budgetMinor: 25000,
      estimatedCostPerCallMinor: 700,
    });
    const thread = await client.json<Entity>('/chat/threads', {
      title: 'Settings defaults',
    });
    const reply = await client.json<{ draft: { campaignId: string } | null }>(
      `/chat/threads/${thread.id}/messages`,
      { content: 'Simulate a call to Alice to ask for synthetic feedback' },
    );
    expect(reply.draft).not.toBeNull();
    const direct = CampaignSchema.parse(
      await client.json('/campaigns/' + reply.draft!.campaignId),
    );
    expect(direct.agentId).toBe(agents[1].id);
    expect(direct.policy).toMatchObject({
      windowStart: '09:00',
      windowEnd: '18:30',
      budgetMinor: 25000,
      estimatedCostPerCallMinor: 700,
      concurrency: 1,
    });
    expect(direct.plan?.policy.windowStart).toBe('09:00');
  });

  it('updates the caller profile name', async () => {
    const invalid = await client.response(
      '/me',
      { name: '   ' },
      undefined,
      'PATCH',
    );
    expect(invalid.status).toBe(400);
    const updated = IdentitySchema.parse(
      await client.json('/me', { name: '  Renamed  ' }, undefined, 'PATCH'),
    );
    expect(updated.name).toBe('Renamed');
    expect(updated.mfaEnabled).toBe(false);
    expect(IdentitySchema.parse(await client.json('/me')).name).toBe('Renamed');
    const audit = await pool.query(
      "SELECT 1 FROM audit_log WHERE workspace_id=$1 AND action='user.profile_changed'",
      [identity.workspaceId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('lists, revokes and keeps sessions scoped to the caller', async () => {
    const email = randomUUID() + '@demo.invalid';
    const first = await signInAs(email);
    const second = await signInAs(email);
    const third = await signInAs(email);
    const listed = UserSessionListSchema.parse(
      await first.client.json('/me/sessions'),
    );
    expect(listed.items).toHaveLength(3);
    expect(listed.items.filter((item) => item.current)).toHaveLength(1);
    const other = UserSessionListSchema.parse(
      await second.client.json('/me/sessions'),
    ).items.find((item) => item.current)!;
    // Another user's session is invisible: 404, and it stays valid.
    const stranger = await client.response(
      '/me/sessions/' + other.id,
      undefined,
      undefined,
      'DELETE',
    );
    expect(stranger.status).toBe(404);
    expect((await second.client.response('/me')).status).toBe(200);
    const deleted = await first.client.response(
      '/me/sessions/' + other.id,
      undefined,
      undefined,
      'DELETE',
    );
    expect(deleted.status).toBe(204);
    expect((await second.client.response('/me')).status).toBe(401);
    const revoked = await first.client.json<{ revoked: number }>(
      '/me/sessions/revoke-others',
      {},
    );
    expect(revoked.revoked).toBe(1);
    expect((await third.client.response('/me')).status).toBe(401);
    const remaining = UserSessionListSchema.parse(
      await first.client.json('/me/sessions'),
    );
    expect(remaining.items).toHaveLength(1);
    expect(remaining.items[0].current).toBe(true);
    const audit = await pool.query(
      "SELECT action FROM audit_log WHERE workspace_id=$1 AND action IN ('user.session_revoked','user.sessions_revoked')",
      [first.identity.workspaceId],
    );
    expect(audit.rowCount).toBe(2);
  });

  it('blocks viewer settings changes but lets viewers read them', async () => {
    await pool.query(
      "UPDATE memberships SET role='viewer' WHERE workspace_id=$1 AND user_id=$2",
      [identity.workspaceId, identity.userId],
    );
    try {
      expect(
        WorkspaceSettingsSchema.parse(await client.json('/settings')).role,
      ).toBe('viewer');
      const blocked = await client.response(
        '/settings',
        { budgetMinor: 1 },
        undefined,
        'PATCH',
      );
      expect(blocked.status).toBe(403);
      expect(await errorCode(blocked)).toBe('FORBIDDEN');
    } finally {
      await pool.query(
        "UPDATE memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",
        [identity.workspaceId, identity.userId],
      );
    }
  });
});
