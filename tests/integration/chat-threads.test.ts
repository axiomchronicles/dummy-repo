import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { pool } from '@outreach/database';
import {
  ChatMessageSchema,
  ChatThreadSchema,
  ErrorSchema,
  readSse,
} from '@outreach/contracts';
import { Client, type Entity, type Identity, type Page } from './helpers';

type Thread = Entity & { title: string; messageCount?: number };
type Message = { id: string; role: string; metadata: Record<string, unknown> };

describe('chat thread search, rename, delete, feedback and auto titles', () => {
  const owner = new Client();
  const other = new Client();
  let identity: Identity;
  async function thread(title?: string) {
    return owner.json<Thread>('/chat/threads', title ? { title } : {});
  }
  async function send(threadId: string, content: string) {
    const response = await owner.response(`/chat/threads/${threadId}/stream`, {
      content,
    });
    expect(response.ok).toBe(true);
    const events: { event: string; data: Record<string, unknown> }[] = [];
    for await (const event of readSse(response.body!))
      events.push({ event: event.event, data: JSON.parse(event.data) });
    return events;
  }
  async function messages(threadId: string) {
    return owner.json<Message[]>(`/chat/threads/${threadId}/messages`);
  }
  async function errorCode(response: Response) {
    return ErrorSchema.parse(await response.json()).error.code;
  }
  beforeAll(async () => {
    identity = await owner.signIn();
    await other.signIn();
  });
  afterAll(async () => {
    await pool.end();
  });

  it('auto-titles a default thread from its first message and streams thread.updated', async () => {
    const created = await thread();
    expect(created.title).toBe('New outreach task');
    const events = await send(
      created.id,
      'Sarvam AI, call Zed Quill on 9876543210 about the offsite',
    );
    const names = events.map((e) => e.event);
    expect(names.indexOf('thread.updated')).toBe(
      names.indexOf('user_message') + 1,
    );
    const updated = events.find((e) => e.event === 'thread.updated')!.data;
    expect(updated).toEqual({
      id: created.id,
      title: 'Call Zed Quill on about the',
    });
    expect(String(updated.title)).not.toMatch(/\d{7}/);
    // The second message never renames it again.
    const again = await send(created.id, 'hello there');
    expect(again.some((e) => e.event === 'thread.updated')).toBe(false);
    const titled = await thread('Explicit title');
    const kept = await send(titled.id, 'hello there');
    expect(kept.some((e) => e.event === 'thread.updated')).toBe(false);
  });

  it('searches by title and by message content with literal % and _', async () => {
    const byTitle = await thread('Quarterly zebra review');
    const byContent = await thread('Unrelated title');
    await send(byContent.id, 'remember the 50%_wombat note');
    const search = async (q: string) =>
      (
        await owner.json<Page<Thread>>(
          '/chat/threads?q=' + encodeURIComponent(q),
        )
      ).items.map((t) => t.id);
    expect(await search('  ZEBRA ')).toEqual([byTitle.id]);
    expect(await search('wombat')).toEqual([byContent.id]);
    expect(await search('50%_wom')).toEqual([byContent.id]);
    expect(await search('%')).toEqual([byContent.id]);
    expect(await search('5_%')).toEqual([]);
    const all = await owner.json<Page<Thread>>('/chat/threads');
    expect(all.items.length).toBeGreaterThan(2);
    const hit = (await owner.json<Page<Thread>>('/chat/threads?q=wombat'))
      .items[0];
    expect(ChatThreadSchema.parse(hit).messageCount).toBe(2);
    expect(
      (await owner.response('/chat/threads?q=' + 'x'.repeat(101))).status,
    ).toBe(400);
    expect(await other.json<Page<Thread>>('/chat/threads?q=zebra')).toEqual({
      items: [],
      nextCursor: null,
    });
  });

  it('renames own threads only', async () => {
    const created = await thread('Before');
    const renamed = await owner.json<Thread>(
      `/chat/threads/${created.id}`,
      { title: '  After rename  ' },
      undefined,
      'PATCH',
    );
    expect(ChatThreadSchema.parse(renamed).title).toBe('After rename');
    expect(renamed.messageCount).toBe(0);
    for (const body of [
      { title: '   ' },
      { title: 'x'.repeat(161) },
      { title: 'ok', extra: 1 },
    ])
      expect(
        (
          await owner.response(
            `/chat/threads/${created.id}`,
            body,
            undefined,
            'PATCH',
          )
        ).status,
      ).toBe(400);
    const foreign = await other.response(
      `/chat/threads/${created.id}`,
      { title: 'Hijack' },
      undefined,
      'PATCH',
    );
    expect(foreign.status).toBe(404);
    expect(await errorCode(foreign)).toBe('THREAD_NOT_FOUND');
    const audit = await pool.query(
      "SELECT metadata FROM audit_log WHERE workspace_id=$1 AND action='chat.thread_renamed' AND entity_id=$2",
      [identity.workspaceId, created.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it('deletes a thread with its messages and keeps tool executions with a null thread', async () => {
    const created = await thread('To delete');
    await send(created.id, 'call Nobody Atall about the offsite');
    const before = await pool.query(
      'SELECT id FROM tool_executions WHERE thread_id=$1',
      [created.id],
    );
    expect(before.rowCount).toBeGreaterThan(0);
    const foreign = await other.response(
      `/chat/threads/${created.id}`,
      undefined,
      undefined,
      'DELETE',
    );
    expect(foreign.status).toBe(404);
    const deleted = await owner.response(
      `/chat/threads/${created.id}`,
      undefined,
      undefined,
      'DELETE',
    );
    expect(deleted.status).toBe(204);
    expect(await deleted.text()).toBe('');
    expect(
      (
        await pool.query('SELECT 1 FROM chat_messages WHERE thread_id=$1', [
          created.id,
        ])
      ).rowCount,
    ).toBe(0);
    const kept = await pool.query(
      'SELECT thread_id FROM tool_executions WHERE id = ANY($1::uuid[])',
      [before.rows.map((r: { id: string }) => r.id)],
    );
    expect(kept.rowCount).toBe(before.rowCount);
    expect(
      kept.rows.every((r: { thread_id: unknown }) => r.thread_id === null),
    ).toBe(true);
    expect(
      (await owner.response(`/chat/threads/${created.id}/messages`)).status,
    ).toBe(404);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM audit_log WHERE action='chat.thread_deleted' AND entity_id=$1",
          [created.id],
        )
      ).rowCount,
    ).toBe(1);
  });

  it('sets and clears feedback on assistant messages only; viewers are refused', async () => {
    const created = await thread('Feedback');
    await send(created.id, 'hello there');
    const [user, assistant] = await messages(created.id);
    expect(assistant.role).toBe('assistant');
    const path = `/chat/messages/${assistant.id}/feedback`;
    const rated = ChatMessageSchema.parse(
      await owner.json(path, { rating: 'down', reason: 'Too vague' }),
    );
    expect(rated.metadata.feedback).toMatchObject({
      rating: 'down',
      reason: 'Too vague',
    });
    expect((await messages(created.id))[1].metadata.feedback).toBeDefined();
    const cleared = ChatMessageSchema.parse(
      await owner.json(path, { rating: null }),
    );
    expect(cleared.metadata).not.toHaveProperty('feedback');
    const onUser = await owner.response(`/chat/messages/${user.id}/feedback`, {
      rating: 'up',
    });
    expect(onUser.status).toBe(409);
    expect(await errorCode(onUser)).toBe('FEEDBACK_NOT_ALLOWED');
    const foreign = await other.response(path, { rating: 'up' });
    expect(foreign.status).toBe(404);
    expect(await errorCode(foreign)).toBe('MESSAGE_NOT_FOUND');
    expect((await owner.response(path, { rating: 'meh' })).status).toBe(400);
    expect(
      (await owner.response(path, { rating: 'up', reason: 'x'.repeat(501) }))
        .status,
    ).toBe(400);
    const audit = await pool.query(
      "SELECT metadata FROM audit_log WHERE action='chat.feedback' AND entity_id=$1 ORDER BY id",
      [assistant.id],
    );
    expect(audit.rows.map((r: { metadata: unknown }) => r.metadata)).toEqual([
      { rating: 'down' },
      { rating: null },
    ]);
    await pool.query(
      "UPDATE memberships SET role='viewer' WHERE workspace_id=$1 AND user_id=$2",
      [identity.workspaceId, identity.userId],
    );
    try {
      for (const [p, body, method] of [
        [path, { rating: 'up' }, undefined],
        [`/chat/threads/${created.id}`, { title: 'Viewer' }, 'PATCH'],
        [`/chat/threads/${created.id}`, undefined, 'DELETE'],
      ] as const) {
        const response = await owner.response(p, body, randomUUID(), method);
        expect(response.status, p).toBe(403);
        expect(await errorCode(response)).toBe('FORBIDDEN');
      }
      expect((await owner.response('/chat/threads?q=feed')).status).toBe(200);
    } finally {
      await pool.query(
        "UPDATE memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",
        [identity.workspaceId, identity.userId],
      );
    }
  });
});
