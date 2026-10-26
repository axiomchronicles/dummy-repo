import { afterAll, describe, expect, it } from 'vitest';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pool } from '@outreach/database';
import {
  CampaignSchema,
  AttemptSchema,
  CampaignEventSchema,
  ListSchema,
} from '@outreach/contracts';
import { Client, until, base, type Entity, type Page } from './helpers';

const execute = promisify(execFile);
async function docker(args: string[]) {
  return execute('docker', args, { timeout: 45000, maxBuffer: 1024 * 1024 });
}
type DockerEvent = {
  Action?: string;
  Actor?: { Attributes?: { exitCode?: string } };
};

describe('API restart while persisted SSE remains connected', () => {
  afterAll(async () => {
    await pool.end();
  });
  it('closes SSE gracefully and replays terminal outcomes after a real Compose API restart', async () => {
    expect((await fetch(base + '/health/ready')).status).toBe(200);
    const client = new Client();
    await client.signIn();
    const imported = await client.imported();
    const agents = await client.json<Page<Entity>>('/agents');
    const campaign = await client.campaign(imported.id, agents.items[0].id);
    await client.json('/campaigns/' + campaign.id + '/plan', {});
    const abort = new AbortController();
    const stream = await fetch(
      base + '/api/v1/campaigns/' + campaign.id + '/stream?after=0',
      { headers: { Cookie: client.cookie }, signal: abort.signal },
    );
    expect(stream.headers.get('content-type')).toContain('text/event-stream');
    const reader = stream.body!.getReader();
    let eventMonitor: ChildProcess | undefined;
    const deaths: DockerEvent[] = [];
    try {
      const first = new TextDecoder().decode((await reader.read()).value);
      const ids = [...first.matchAll(/^id: (\d+)$/gm)].map((match) => match[1]);
      expect(ids.length).toBeGreaterThan(0);
      const cursor = ids[ids.length - 1];
      const container = (
        await docker(['compose', 'ps', '--quiet', 'api'])
      ).stdout.trim();
      eventMonitor = spawn(
        'docker',
        [
          'events',
          '--filter',
          'container=' + container,
          '--filter',
          'event=die',
          '--format',
          '{{json .}}',
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let eventBuffer = '';
      eventMonitor.stdout!.on('data', (chunk: Buffer) => {
        eventBuffer += chunk.toString();
        const lines = eventBuffer.split('\n');
        eventBuffer = lines.pop() || '';
        for (const line of lines.filter(Boolean))
          deaths.push(JSON.parse(line) as DockerEvent);
      });
      await delay(300);
      await client.json(
        '/campaigns/' + campaign.id + '/simulate',
        { confirmed: true },
        randomUUID(),
      );
      const started = Date.now();
      await docker(['compose', 'restart', 'api']);
      const elapsed = Date.now() - started;
      process.stdout.write(
        `Observed API restart with active SSE: ${elapsed}ms\n`,
      );
      await until(async () => {
        try {
          return (
            await fetch(base + '/health/ready', {
              signal: AbortSignal.timeout(3000),
            })
          ).status === 200
            ? true
            : undefined;
        } catch {
          return undefined;
        }
      }, 15000);
      await until(async () => {
        const row = CampaignSchema.parse(
          await client.json('/campaigns/' + campaign.id),
        );
        return row.status === 'completed' ? row : undefined;
      }, 15000);
      const attempts = ListSchema(AttemptSchema).parse(
        await client.json('/campaigns/' + campaign.id + '/attempts'),
      ).items;
      expect(attempts).toHaveLength(4);
      expect(
        new Set(attempts.map((attempt) => attempt.campaignContactId)).size,
      ).toBe(4);
      expect(new Set(attempts.map((attempt) => attempt.outcome))).toEqual(
        new Set(['connected', 'no_answer', 'busy', 'failed']),
      );
      expect(
        attempts.every(
          (attempt) =>
            attempt.provider === 'mock' &&
            ['completed', 'failed'].includes(attempt.status),
        ),
      ).toBe(true);
      const replay = ListSchema(CampaignEventSchema).parse(
        await client.json(
          '/campaigns/' + campaign.id + '/events?after=' + cursor,
        ),
      );
      expect(
        replay.items.every((event) => BigInt(event.id) > BigInt(cursor)),
      ).toBe(true);
      expect(
        replay.items.some((event) => event.type === 'campaign.completed'),
      ).toBe(true);
      await until(async () => (deaths.length ? true : undefined), 3000);
      expect(deaths).toHaveLength(1);
      const exitCode = deaths[0].Actor?.Attributes?.exitCode;
      expect(['0', '143']).toContain(exitCode);
      expect(elapsed).toBeLessThan(30000);
      process.stdout.write(
        `API restart with active SSE: ${elapsed}ms, Docker exitCode=${exitCode}, four unique terminal attempts and cursor replay preserved\n`,
      );
    } finally {
      eventMonitor?.kill('SIGTERM');
      abort.abort();
      await reader.cancel().catch(() => undefined);
    }
  });
});
