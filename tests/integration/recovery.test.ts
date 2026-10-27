import { afterAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { pool } from '@outreach/database';
import { processReconciliation } from '../../apps/worker/src/calls';
import {
  Client,
  until,
  base,
  workerBase,
  type Entity,
  type Page,
} from './helpers';
const execute = promisify(execFile);
const secondary = `${process.env.COMPOSE_PROJECT_NAME ?? 'outreach-intern'}-test-worker`;
async function docker(args: string[]) {
  return execute('docker', args, { timeout: 60000, maxBuffer: 1024 * 1024 });
}
async function healthy(url = base + '/health/ready') {
  return until(async () => {
    try {
      return (await fetch(url, { signal: AbortSignal.timeout(3000) }))
        .status === 200
        ? true
        : undefined;
    } catch {
      return undefined;
    }
  }, 60000);
}
async function prepare() {
  const client = new Client();
  const identity = await client.signIn();
  const imported = await client.imported();
  const agents = await client.json<Page<Entity>>('/agents');
  const campaign = await client.campaign(imported.id, agents.items[0]!.id);
  await client.json('/campaigns/' + campaign.id + '/plan', {});
  return { client, identity, campaign };
}
async function startMain() {
  await docker(['compose', 'start', 'postgres', 'redis', 'worker']);
  await healthy();
  await healthy(workerBase + '/health/ready');
}
async function removeSecondary() {
  await docker(['rm', '-f', secondary]).catch(() => undefined);
}
async function terminal(client: Client, campaignId: string) {
  return until(async () => {
    const row = await client.json<Entity>('/campaigns/' + campaignId);
    return row.status === 'completed' ? row : undefined;
  }, 60000);
}
async function assertUnique(campaignId: string, expected = 4) {
  const rows = (
    await pool.query<{
      id: string;
      campaign_contact_id: string;
      outcome: string;
      provider: string;
    }>(
      'SELECT id,campaign_contact_id,outcome,provider FROM call_attempts WHERE campaign_id=$1',
      [campaignId],
    )
  ).rows;
  expect(rows).toHaveLength(expected);
  expect(new Set(rows.map((r) => r.campaign_contact_id)).size).toBe(expected);
  expect(rows.every((r) => r.provider === 'mock')).toBe(true);
  return rows;
}

describe('composed worker and backing-service recovery', () => {
  afterAll(async () => {
    await removeSecondary();
    await startMain();
    await pool.end();
  });
  it('pause blocks queued dispatch, resume completes, cancellation leaves zero attempts', async () => {
    const paused = await prepare();
    await docker(['compose', 'stop', 'worker']);
    await paused.client.json(
      '/campaigns/' + paused.campaign.id + '/simulate',
      { confirmed: true },
      randomUUID(),
    );
    await paused.client.json('/campaigns/' + paused.campaign.id + '/pause', {});
    await startMain();
    await delay(2200);
    expect(
      (
        await pool.query('SELECT id FROM call_attempts WHERE campaign_id=$1', [
          paused.campaign.id,
        ])
      ).rows,
    ).toHaveLength(0);
    expect(
      (await paused.client.json<Entity>('/campaigns/' + paused.campaign.id))
        .status,
    ).toBe('paused');
    await paused.client.json(
      '/campaigns/' + paused.campaign.id + '/resume',
      {},
    );
    await terminal(paused.client, paused.campaign.id);
    await assertUnique(paused.campaign.id);
    const cancelled = await prepare();
    await docker(['compose', 'stop', 'worker']);
    await cancelled.client.json(
      '/campaigns/' + cancelled.campaign.id + '/simulate',
      { confirmed: true },
      randomUUID(),
    );
    await cancelled.client.json(
      '/campaigns/' + cancelled.campaign.id + '/cancel',
      {},
    );
    await startMain();
    await delay(2200);
    expect(
      (
        await pool.query('SELECT id FROM call_attempts WHERE campaign_id=$1', [
          cancelled.campaign.id,
        ])
      ).rows,
    ).toHaveLength(0);
    const rows = (
      await pool.query<{ status: string }>(
        'SELECT status FROM campaign_contacts WHERE campaign_id=$1',
        [cancelled.campaign.id],
      )
    ).rows;
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.status === 'cancelled')).toBe(true);
  }, 120000);
  it('recovers an actual killed mock worker with the same durable attempt identifiers', async () => {
    const test = await prepare();
    await docker(['compose', 'stop', 'worker']);
    await test.client.json(
      '/campaigns/' + test.campaign.id + '/simulate',
      { confirmed: true },
      randomUUID(),
    );
    await docker([
      'compose',
      'run',
      '--no-deps',
      '-d',
      '--name',
      secondary,
      '-e',
      'WORKER_PORT=3002',
      '-e',
      'MOCK_LATENCY_MS=5000',
      'worker',
    ]);
    const interrupted = await until(async () => {
      const rows = (
        await pool.query<{ id: string }>(
          'SELECT id FROM call_attempts WHERE campaign_id=$1 AND status=$2',
          [test.campaign.id, 'dispatching'],
        )
      ).rows;
      return rows.length ? rows : undefined;
    }, 60000);
    await docker(['kill', '--signal', 'KILL', secondary]);
    await removeSecondary();
    await startMain();
    await terminal(test.client, test.campaign.id);
    const completed = await assertUnique(test.campaign.id);
    expect(
      interrupted.every((row) => completed.some((done) => done.id === row.id)),
    ).toBe(true);
    expect(new Set(completed.map((row) => row.outcome))).toEqual(
      new Set(['connected', 'no_answer', 'busy', 'failed']),
    );
  }, 120000);
  it('two worker processes claim one attempt per contact within database concurrency', async () => {
    await docker([
      'compose',
      'run',
      '--no-deps',
      '-d',
      '--name',
      secondary,
      '-e',
      'WORKER_PORT=3002',
      '-e',
      'MOCK_LATENCY_MS=500',
      'worker',
    ]);
    await until(async () => {
      try {
        await docker([
          'exec',
          secondary,
          'node',
          '-e',
          "fetch('http://localhost:3002/health/ready').then(r=>{if(!r.ok)process.exit(1)})",
        ]);
        return true;
      } catch {
        return undefined;
      }
    }, 60000);
    const test = await prepare();
    await test.client.json(
      '/campaigns/' + test.campaign.id + '/simulate',
      { confirmed: true },
      randomUUID(),
    );
    let maximum = 0;
    await until(async () => {
      const active = (
        await pool.query<{ count: number }>(
          "SELECT count(*)::int count FROM call_attempts WHERE campaign_id=$1 AND status='dispatching'",
          [test.campaign.id],
        )
      ).rows[0]!.count;
      maximum = Math.max(maximum, active);
      const row = await test.client.json<Entity>(
        '/campaigns/' + test.campaign.id,
      );
      return row.status === 'completed' ? true : undefined;
    }, 60000);
    expect(maximum).toBeLessThanOrEqual(2);
    await assertUnique(test.campaign.id);
    await removeSecondary();
  }, 120000);
  it('replays published database intent after Redis/PostgreSQL restart and reconnects readiness', async () => {
    const test = await prepare();
    await docker(['compose', 'stop', 'worker']);
    await test.client.json(
      '/campaigns/' + test.campaign.id + '/simulate',
      { confirmed: true },
      randomUUID(),
    );
    const published = await pool.query(
      "UPDATE outbox SET published_at=now() WHERE workspace_id=$1 AND kind='dispatch' RETURNING id",
      [test.identity.workspaceId],
    );
    expect(published.rows).toHaveLength(4);
    await docker(['compose', 'stop', 'redis', 'postgres']);
    const unavailable = await fetch(base + '/health/ready', {
      signal: AbortSignal.timeout(10000),
    });
    expect(unavailable.status).toBe(503);
    await docker(['compose', 'start', 'postgres', 'redis']);
    await healthy();
    await startMain();
    await terminal(test.client, test.campaign.id);
    await assertUnique(test.campaign.id);
    expect(
      (
        await pool.query<{ count: number }>(
          'SELECT count(*)::int count FROM call_attempts WHERE campaign_id=$1 AND outcome IS NOT NULL',
          [test.campaign.id],
        )
      ).rows[0]!.count,
    ).toBe(4);
    expect((await test.client.json<Entity>('/me')).workspaceId).toBe(
      test.identity.workspaceId,
    );
  }, 120000);
  it('preserves fractional live duration and estimates whole provider billing pulses without dialing', async () => {
    const operator = new Client();
    const identity = await operator.signIn();
    const imported = await operator.imported();
    const agents = await operator.json<Page<Entity>>('/agents');
    const campaign = await operator.campaign(
      imported.id,
      agents.items[0]!.id,
      'live',
    );
    const contact = (
      await pool.query<{ id: string }>(
        'SELECT id FROM campaign_contacts WHERE campaign_id=$1 ORDER BY position LIMIT 1',
        [campaign.id],
      )
    ).rows[0]!;
    const attemptId = randomUUID(),
      vendorId = 'sarvam-fixture-' + randomUUID();
    await pool.query(
      "INSERT INTO call_attempts(id,workspace_id,campaign_id,campaign_contact_id,provider,mode,status,agent_version_id) SELECT $1,workspace_id,id,$2,'sarvam','live','accepted',agent_version_id FROM campaigns WHERE id=$3",
      [attemptId, contact.id, campaign.id],
    );
    const event = {
      provider: 'sarvam',
      providerAttemptId: vendorId,
      localAttemptId: attemptId,
      outcome: 'connected',
      durationSeconds: 60.2,
      interactionId: null,
      failureCode: null,
      extractedFields: null,
      transcript: null,
      simulated: false,
    };
    const inbox = (
      await pool.query<{ id: string }>(
        'INSERT INTO webhook_inbox(workspace_id,provider,provider_attempt_id,local_attempt_id,payload) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [
          identity.workspaceId,
          'sarvam',
          vendorId,
          attemptId,
          JSON.stringify(event),
        ],
      )
    ).rows[0]!;
    await processReconciliation(inbox.id);
    const row = (
      await pool.query<{
        duration_seconds: number;
        estimated_cost_minor: number;
      }>(
        'SELECT duration_seconds,estimated_cost_minor FROM call_attempts WHERE id=$1',
        [attemptId],
      )
    ).rows[0]!;
    expect(row.duration_seconds).toBe(60.2);
    expect(row.estimated_cost_minor).toBe(700);
  });
  it('retains unknown live cost when duration is absent and preserves reservation evidence', async () => {
    const operator = new Client();
    const identity = await operator.signIn();
    const imported = await operator.imported();
    const agents = await operator.json<Page<Entity>>('/agents');
    const campaign = await operator.campaign(
      imported.id,
      agents.items[0]!.id,
      'live',
    );
    const contact = (
      await pool.query<{ id: string }>(
        'SELECT id FROM campaign_contacts WHERE campaign_id=$1 ORDER BY position LIMIT 1',
        [campaign.id],
      )
    ).rows[0]!;
    const attemptId = randomUUID(),
      vendorId = 'sarvam-unknown-duration-' + randomUUID();
    await pool.query(
      "INSERT INTO call_attempts(id,workspace_id,campaign_id,campaign_contact_id,provider,mode,status,agent_version_id) SELECT $1,workspace_id,id,$2,'sarvam','live','accepted',agent_version_id FROM campaigns WHERE id=$3",
      [attemptId, contact.id, campaign.id],
    );
    await pool.query(
      "INSERT INTO usage_ledger(workspace_id,call_attempt_id,mode,kind,amount_minor) VALUES($1,$2,'live','reservation',500)",
      [identity.workspaceId, attemptId],
    );
    const event = {
      provider: 'sarvam',
      providerAttemptId: vendorId,
      localAttemptId: attemptId,
      outcome: 'connected',
      durationSeconds: null,
      interactionId: null,
      failureCode: null,
      extractedFields: null,
      transcript: null,
      simulated: false,
    };
    const inbox = (
      await pool.query<{ id: string }>(
        'INSERT INTO webhook_inbox(workspace_id,provider,provider_attempt_id,local_attempt_id,payload) VALUES($1,$2,$3,$4,$5) RETURNING id',
        [
          identity.workspaceId,
          'sarvam',
          vendorId,
          attemptId,
          JSON.stringify(event),
        ],
      )
    ).rows[0]!;
    await processReconciliation(inbox.id);
    const row = (
      await pool.query<{
        duration_seconds: number | null;
        estimated_cost_minor: number | null;
      }>(
        'SELECT duration_seconds,estimated_cost_minor FROM call_attempts WHERE id=$1',
        [attemptId],
      )
    ).rows[0]!;
    expect(row.duration_seconds).toBeNull();
    expect(row.estimated_cost_minor).toBeNull();
    const ledger = (
      await pool.query<{ kind: string; amount_minor: number }>(
        'SELECT kind,amount_minor FROM usage_ledger WHERE call_attempt_id=$1',
        [attemptId],
      )
    ).rows;
    expect(ledger).toEqual([{ kind: 'reservation', amount_minor: 500 }]);
  });
  it('expires finished import source and row PII and refuses correction of purged bytes', async () => {
    const operator = new Client();
    await operator.signIn();
    const imported = await operator.imported();
    await pool.query(
      "UPDATE imports SET created_at=now()-interval '366 days' WHERE id=$1",
      [imported.id],
    );
    await until(async () => {
      const row = (
        await pool.query<{ bytes: number; failure_code: string | null }>(
          'SELECT octet_length(source_bytes)::int bytes,failure_code FROM imports WHERE id=$1',
          [imported.id],
        )
      ).rows[0]!;
      return row.bytes === 0 && row.failure_code === 'SOURCE_EXPIRED'
        ? true
        : undefined;
    });
    const rows = await operator.json<Page<Entity>>(
      '/imports/' + imported.id + '/rows',
    );
    expect(rows.items).toHaveLength(4);
    expect(
      rows.items.every(
        (row) =>
          row.normalizedPhone === null &&
          Object.keys(row.sourceCells as object).length === 0,
      ),
    ).toBe(true);
    const rejected = await operator.response(
      '/imports/' + imported.id + '/validate',
      { corrections: [] },
    );
    expect(rejected.status).toBe(410);
    expect((await rejected.json()).error.code).toBe('IMPORT_SOURCE_EXPIRED');
  });
  it('expires report bytes without regressing its completed lifecycle and regenerates without redial', async () => {
    const test = await prepare();
    await test.client.json(
      '/campaigns/' + test.campaign.id + '/simulate',
      { confirmed: true },
      randomUUID(),
    );
    await terminal(test.client, test.campaign.id);
    const requested = await test.client.json<Entity>(
      '/campaigns/' + test.campaign.id + '/reports',
      { format: 'csv' },
      randomUUID(),
    );
    await until(async () => {
      const row = (
        await pool.query<{ status: string }>(
          'SELECT status FROM reports WHERE id=$1',
          [requested.id],
        )
      ).rows[0]!;
      return row.status === 'completed' ? true : undefined;
    });
    await pool.query(
      "UPDATE reports SET expires_at=now()-interval '1 second' WHERE id=$1",
      [requested.id],
    );
    await until(async () => {
      const row = (
        await pool.query<{
          status: string;
          artifact: Buffer | null;
          failure_code: string;
        }>('SELECT status,artifact,failure_code FROM reports WHERE id=$1', [
          requested.id,
        ])
      ).rows[0]!;
      return row.artifact === null && row.failure_code === 'ARTIFACT_EXPIRED'
        ? row
        : undefined;
    }).then((row) => expect(row.status).toBe('completed'));
    expect(
      (await test.client.response('/reports/' + requested.id + '/download'))
        .status,
    ).toBe(410);
    const regenerated = await test.client.json<Entity>(
      '/campaigns/' + test.campaign.id + '/reports',
      { format: 'xlsx' },
      randomUUID(),
    );
    await until(async () => {
      const row = (
        await pool.query<{ status: string; row_count: number }>(
          'SELECT status,row_count FROM reports WHERE id=$1',
          [regenerated.id],
        )
      ).rows[0]!;
      return row.status === 'completed' ? row : undefined;
    }).then((row) => expect(row.row_count).toBe(4));
    await assertUnique(test.campaign.id);
  });
});
