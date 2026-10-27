import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '@outreach/database';
import { ChatDraftSchema, readSse, type ChatDraft } from '@outreach/contracts';
import { Client, until, sample, base, type Entity } from './helpers';
const scenario =
  'Sarvam AI, call Pawan Kumar on the supplied contact number to ask whether he will attend the CyberCube interview scheduled for 27 October 2026. Introduce yourself, state the purpose clearly, ask whether he plans to attend, record his actual answer, and summarize the outcome and any requested follow-up.';
describe.skipIf(!process.env.MODEL_FIXTURE_URL)(
  'actual chat API → typed tools → durable single-recipient execution',
  () => {
    const client = new Client();
    let workspaceId: string;
    let threadId: string;
    let draft: ChatDraft;
    beforeAll(async () => {
      workspaceId = (await client.signIn()).workspaceId;
      threadId = (
        await client.json<Entity>('/chat/threads', {
          title: 'Direct call regression',
        })
      ).id;
    });
    async function chat(content: string) {
      const response = await client.response(
        `/chat/threads/${threadId}/stream`,
        { content },
      );
      expect(response.ok).toBe(true);
      const events = [];
      for await (const event of readSse(response.body!))
        events.push({ event: event.event, data: JSON.parse(event.data) });
      return events;
    }
    it('reports missing exact identity without fabricating a global cohort', async () => {
      const events = await chat(scenario);
      expect(events.some((e) => e.event === 'draft')).toBe(false);
      expect(
        events
          .filter((e) => e.event === 'delta')
          .map((e) => e.data.text)
          .join(''),
      ).toContain('No exact contact');
      expect(
        (await client.json<{ items: unknown[] }>('/campaigns')).items,
      ).toHaveLength(0);
    });
    it('prepares one real-call intent and preserves date/identity/mode without dialing', async () => {
      await client.imported(sample.replace('Alice,', 'Pawan Kumar,'));
      const events = await chat(scenario);
      expect(
        events.some((e) => e.event === 'draft'),
        JSON.stringify(events),
      ).toBe(true);
      draft = ChatDraftSchema.parse(
        events.find((e) => e.event === 'draft')?.data,
      );
      expect(draft.mode).toBe('live');
      expect(draft.target?.name).toBe('Pawan Kumar');
      expect(draft.target?.eventDate).toBe('2026-10-27');
      expect(draft.eligibleCount).toBe(0);
      expect(draft.excludedCount).toBe(1);
      expect(draft.target?.blockers).toContain('synthetic_destination');
      const contacts = await client.json<{ items: Entity[] }>(
        `/campaigns/${draft.campaignId}/contacts`,
      );
      expect(contacts.items).toHaveLength(1);
      expect(
        (
          await client.json<{ items: unknown[] }>(
            `/campaigns/${draft.campaignId}/attempts`,
          )
        ).items,
      ).toHaveLength(0);
    });
    it('edits the saved plan to simulation without changing the target, then launches idempotently', async () => {
      await client.json(
        `/campaigns/${draft.campaignId}`,
        { mode: 'simulation' },
        undefined,
        'PATCH',
      );
      const reviewed = await client.json<ChatDraft>(
        `/campaigns/${draft.campaignId}/review`,
      );
      expect(reviewed.target?.contactId).toBe(draft.target?.contactId);
      expect(reviewed.mode).toBe('simulation');
      expect(reviewed.eligibleCount).toBe(1);
      const key = randomUUID();
      const body = {
        confirmed: true,
        planSnapshotHash: reviewed.planSnapshotHash,
      };
      expect(
        (
          await client.response(
            `/campaigns/${draft.campaignId}/simulate`,
            { ...body, planSnapshotHash: 'outdated-review' },
            randomUUID(),
          )
        ).status,
      ).toBe(409);
      await Promise.all([
        client.json(`/campaigns/${draft.campaignId}/simulate`, body, key),
        client.json(`/campaigns/${draft.campaignId}/simulate`, body, key),
      ]);
      await until(async () => {
        const row = await client.json<Entity>(`/campaigns/${draft.campaignId}`);
        return row.status === 'completed' ? row : undefined;
      });
      const calls = (
        await client.json<{ items: Entity[] }>(
          `/campaigns/${draft.campaignId}/attempts`,
        )
      ).items;
      expect(calls).toHaveLength(1);
      expect(calls[0]?.mode).toBe('simulation');
      expect(calls[0]?.provider).toBe('mock');
      const detail = await until(async () => {
        const row = await client.json<Entity>(`/calls/${calls[0]!.id}`);
        return (row.analysis as { status?: string })?.status === 'completed'
          ? row
          : undefined;
      });
      expect(detail.analysis).toMatchObject({ synthetic: true });
      const saved = await client.json<
        { metadata: { attemptId?: string }; content: string }[]
      >(`/chat/threads/${threadId}/messages`);
      expect(
        saved.some(
          (m) =>
            m.metadata.attemptId === calls[0]!.id &&
            m.content.includes('SIMULATION'),
        ),
      ).toBe(true);
      expect(
        (
          await pool.query(
            'SELECT id FROM call_artifacts WHERE call_attempt_id=$1',
            [calls[0]!.id],
          )
        ).rowCount,
      ).toBe(0);
    });
    it('never uses another contact consent, and resolves number mismatch/ambiguity deterministically', async () => {
      const target = (
        await pool.query<{ id: string; phone: string }>(
          "SELECT id,phone FROM contacts WHERE workspace_id=$1 AND name='Pawan Kumar'",
          [workspaceId],
        )
      ).rows[0]!;
      await pool.query('UPDATE contacts SET consent=false WHERE id=$1', [
        target.id,
      ]);
      const events = await chat(
        'Simulate a call Pawan Kumar on the supplied contact number about the interview.',
      );
      const blocked = ChatDraftSchema.parse(
        events.find((e) => e.event === 'draft')?.data,
      );
      expect(blocked.eligibleCount).toBe(0);
      expect(blocked.excludedCount).toBe(1);
      await pool.query('UPDATE contacts SET consent=true WHERE id=$1', [
        target.id,
      ]);
      await pool.query(
        "UPDATE contacts SET name='Pawan Kumar' WHERE workspace_id=$1 AND id<>$2",
        [workspaceId, target.id],
      );
      const ambiguous = await chat(scenario);
      expect(ambiguous.some((e) => e.event === 'draft')).toBe(false);
      expect(JSON.stringify(ambiguous)).toContain('Multiple contacts match');
    });
    it('streams before generation completes through the actual HTTP API', async () => {
      const started = Date.now();
      const response = await client.response(
        `/chat/threads/${threadId}/stream`,
        { content: 'stream probe' },
      );
      const times: number[] = [];
      let text = '';
      for await (const event of readSse(response.body!)) {
        if (event.event === 'delta') {
          times.push(Date.now() - started);
          text += JSON.parse(event.data).text;
        }
      }
      expect(times).toHaveLength(2);
      expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(250);
      expect(text).toBe('First visible delta. Generation finished.');
    });
  },
);

it.skipIf(!process.env.MODEL_FIXTURE_URL)(
  'rejects explicit identity/number mismatch through chat tools',
  async () => {
    const client = new Client();
    const identity = await client.signIn();
    await client.imported(sample.replace('Alice,', 'Pawan Kumar,'));
    const other = (
      await pool.query<{ phone: string }>(
        "SELECT phone FROM contacts WHERE workspace_id=$1 AND name='Benoit'",
        [identity.workspaceId],
      )
    ).rows[0]!;
    const thread = await client.json<Entity>('/chat/threads', {
      title: 'Mismatch',
    });
    const response = await client.response(
      `/chat/threads/${thread.id}/stream`,
      { content: `Call Pawan Kumar on ${other.phone} about the interview.` },
    );
    const events = [];
    for await (const event of readSse(response.body!))
      events.push({ event: event.event, data: JSON.parse(event.data) });
    expect(events.some((e) => e.event === 'draft')).toBe(false);
    expect(JSON.stringify(events)).toContain('IDENTITY_NUMBER_MISMATCH');
  },
);

it.skipIf(!process.env.MODEL_FIXTURE_URL)(
  'aborting the POST chat stream cancels the provider HTTP stream',
  async () => {
    const stats = (await (
      await fetch(`${process.env.MODEL_FIXTURE_URL}/stats`)
    ).json()) as { interrupted: number };
    const client = new Client();
    await client.signIn();
    const thread = await client.json<Entity>('/chat/threads', {
      title: 'Abort probe',
    });
    const controller = new AbortController();
    const response = await fetch(
      `${base}/api/v1/chat/threads/${thread.id}/stream`,
      {
        method: 'POST',
        headers: { Cookie: client.cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'stream probe' }),
        signal: controller.signal,
      },
    );
    for await (const event of readSse(response.body!, controller.signal)) {
      if (event.event === 'delta') {
        controller.abort();
        break;
      }
    }
    await until(async () => {
      const after = (await (
        await fetch(`${process.env.MODEL_FIXTURE_URL}/stats`)
      ).json()) as { interrupted: number };
      return after.interrupted > stats.interrupted ? after : undefined;
    });
  },
);
