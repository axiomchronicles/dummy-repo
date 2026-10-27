import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { parse as parseCsv } from 'csv-parse/sync';
import {
  pool,
  transaction,
  enqueueOutbox,
  appendCampaignEvent,
} from '@outreach/database';
import { CampaignPlanSchema, ErrorSchema } from '@outreach/contracts';
import { processReconciliation } from '../../apps/worker/src/calls';
import {
  base,
  workerBase,
  Client,
  until,
  type Entity,
  type Page,
  type Identity,
} from './helpers';

describe('composed mock workflow and durable boundaries', () => {
  const client = new Client();
  let identity: Identity;
  let imported: Entity;
  let campaign: Entity;
  let agentId: string;
  let attempts: Entity[];
  let reportId: string;
  beforeAll(async () => {
    expect((await fetch(base + '/health/ready')).status).toBe(200);
    expect((await fetch(workerBase + '/health/ready')).status).toBe(200);
    identity = await client.signIn();
    const agents = await client.json<Page<Entity>>('/agents');
    expect(agents.items).toHaveLength(5);
    agentId = agents.items[0].id;
    imported = await client.imported();
    expect(imported.status).toBe('ready');
    expect(imported.validCount).toBe(4);
    campaign = await client.campaign(imported.id, agentId);
  });
  afterAll(async () => {
    await pool.end();
  });

  it('requires authentication and rejects unsafe origins, pagination and extra fields', async () => {
    expect((await new Client().response('/me')).status).toBe(401);
    const origin = await fetch(base + '/api/v1/auth/demo', {
      method: 'POST',
      headers: {
        Origin: 'https://untrusted.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'attacker@demo.invalid' }),
    });
    expect(origin.status).toBe(403);
    const extra = await client.response('/campaigns', { admin: true });
    expect(extra.status).toBe(400);
    expect(ErrorSchema.safeParse(await extra.json()).success).toBe(true);
    expect((await client.response('/campaigns?limit=10001')).status).toBe(400);
  });

  it('plans without dialing and duplicate launch commands create one attempt per contact', async () => {
    const planned = await client.json<Entity>(
      '/campaigns/' + campaign.id + '/plan',
      {},
    );
    expect(planned.status).toBe('planned');
    const plan = CampaignPlanSchema.parse(planned.plan);
    expect(plan.planner).toBe('deterministic-local');
    expect(plan.eligibleCount).toBe(4);
    expect(
      (
        await pool.query<{ count: number }>(
          'SELECT count(*)::int count FROM call_attempts WHERE campaign_id=$1',
          [campaign.id],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await client.response(
          '/campaigns/' + campaign.id + '/simulate',
          { confirmed: false },
          randomUUID(),
        )
      ).status,
    ).toBe(400);
    const key = randomUUID();
    const launched = await Promise.all([
      client.json<Entity>(
        '/campaigns/' + campaign.id + '/simulate',
        { confirmed: true },
        key,
      ),
      client.json<Entity>(
        '/campaigns/' + campaign.id + '/simulate',
        { confirmed: true },
        key,
      ),
    ]);
    expect(launched.every((row) => row.id === campaign.id)).toBe(true);
    campaign = await until(async () => {
      const row = await client.json<Entity>('/campaigns/' + campaign.id);
      return row.status === 'completed' ? row : undefined;
    });
    attempts = (
      await client.json<Page<Entity>>('/campaigns/' + campaign.id + '/attempts')
    ).items;
    expect(attempts).toHaveLength(4);
    expect(new Set(attempts.map((row) => row.outcome))).toEqual(
      new Set(['connected', 'no_answer', 'busy', 'failed']),
    );
    expect(
      attempts.every(
        (row) => row.provider === 'mock' && row.mode === 'simulation',
      ),
    ).toBe(true);
    expect(
      (
        await pool.query<{ count: number }>(
          'SELECT count(*)::int count FROM usage_ledger WHERE workspace_id=$1 AND amount_minor<>0',
          [identity.workspaceId],
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it('replays ordered persisted events through JSON cursors and a real SSE stream', async () => {
    const events = await client.json<Page<Entity>>(
      '/campaigns/' + campaign.id + '/events?after=0&limit=100',
    );
    expect(events.items.some((row) => row.type === 'campaign.completed')).toBe(
      true,
    );
    const cursor = events.items[2].id;
    const replay = await client.json<Page<Entity>>(
      '/campaigns/' + campaign.id + '/events?after=' + cursor,
    );
    expect(replay.items.every((row) => BigInt(row.id) > BigInt(cursor))).toBe(
      true,
    );
    const abort = new AbortController();
    const response = await fetch(
      base + '/api/v1/campaigns/' + campaign.id + '/stream?after=0',
      { headers: { Cookie: client.cookie }, signal: abort.signal },
    );
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('id: ');
    abort.abort();
    await reader.cancel().catch(() => undefined);
    expect(
      (
        await client.response(
          '/campaigns/' + campaign.id + '/events?after=99999999999999999999',
        )
      ).status,
    ).toBe(400);
  });

  it('retains actual synthetic analysis and missing transcripts remain unknown', async () => {
    const connected = attempts.find((row) => row.outcome === 'connected')!;
    const call = await until(async () => {
      const row = await client.json<Entity>('/calls/' + connected.id);
      return (row.analysis as Entity | undefined)?.status === 'completed'
        ? row
        : undefined;
    });
    const analysis = call.analysis as Entity;
    expect(analysis.synthetic).toBe(true);
    expect(analysis.transcript).toBeInstanceOf(Array);
    const unanswered = await client.json<Entity>(
      '/calls/' + attempts.find((row) => row.outcome === 'no_answer')!.id,
    );
    expect((unanswered.analysis as Entity).transcript).toBeNull();
  });

  it('generates idempotent CSV/XLSX snapshots matching persisted outcomes', async () => {
    for (const format of ['csv', 'xlsx']) {
      const key = randomUUID();
      const [first, duplicate] = await Promise.all([
        client.json<Entity>(
          '/campaigns/' + campaign.id + '/reports',
          { format },
          key,
        ),
        client.json<Entity>(
          '/campaigns/' + campaign.id + '/reports',
          { format },
          key,
        ),
      ]);
      expect(first.id).toBe(duplicate.id);
      const report = await until(async () => {
        const rows = await client.json<Page<Entity>>('/reports');
        return rows.items.find(
          (row) => row.id === first.id && row.status === 'completed',
        );
      });
      expect(report.rowCount).toBe(4);
      const download = await client.response(
        '/reports/' + report.id + '/download',
      );
      expect(download.status).toBe(200);
      expect(download.headers.get('cache-control')).toBe('private, no-store');
      const bytes = Buffer.from(await download.arrayBuffer());
      if (format === 'csv') {
        reportId = report.id;
        const rows = parseCsv(bytes, { columns: true }) as Record<
          string,
          string
        >[];
        expect(rows).toHaveLength(4);
        expect(new Set(rows.map((row) => row.outcome ?? row.Outcome))).toEqual(
          new Set(['connected', 'no_answer', 'busy', 'failed']),
        );
        expect(bytes.toString()).toContain('simulation');
      } else {
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(
          bytes as unknown as Parameters<typeof book.xlsx.load>[0],
        );
        expect(book.worksheets[0].rowCount).toBe(5);
        book.worksheets[0].eachRow((row) =>
          row.eachCell((cell) =>
            expect(cell.type).not.toBe(ExcelJS.ValueType.Formula),
          ),
        );
      }
    }
  });

  it('denies foreign tenant reads, mutations, streams and downloads', async () => {
    const other = new Client();
    await other.signIn();
    for (const path of [
      '/campaigns/' + campaign.id,
      '/campaigns/' + campaign.id + '/events',
      '/campaigns/' + campaign.id + '/stream',
      '/campaigns/' + campaign.id + '/contacts',
      '/imports/' + imported.id + '/rows',
      '/calls/' + attempts[0].id,
      '/reports/' + reportId + '/download',
      '/agents/' + agentId,
    ])
      expect((await other.response(path)).status).toBe(404);
    expect(
      (await other.response('/campaigns/' + campaign.id + '/cancel', {}))
        .status,
    ).toBe(404);
    expect((await other.json<Page<Entity>>('/campaigns')).items).toHaveLength(
      0,
    );
  });

  it('blocks live execution and opt-out survives re-import', async () => {
    const live = await client.campaign(imported.id, agentId, 'live');
    await client.json('/campaigns/' + live.id + '/plan', {});
    const blocked = await client.response(
      '/campaigns/' + live.id + '/launch',
      { confirmed: true },
      randomUUID(),
    );
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).error.code).toBe('LIVE_DISABLED');
    const rows = await client.json<Page<Entity>>(
      '/imports/' + imported.id + '/rows',
    );
    const contactId = rows.items[0].contactId as string;
    await client.json('/contacts/' + contactId + '/suppress', {
      reason: 'Synthetic opt-out test',
    });
    const reimported = await client.imported(
      'name,phone,consent,outcome\nAlice,+12025550101,true,connected',
    );
    const rejected = await client.json<Page<Entity>>(
      '/imports/' + reimported.id + '/rows',
    );
    expect(
      (rejected.items[0].issues as { code: string }[]).some(
        (issue) => issue.code === 'SUPPRESSED',
      ),
    ).toBe(true);
    expect(
      (
        await pool.query<{ consent: boolean }>(
          'SELECT consent FROM contacts WHERE id=$1',
          [contactId],
        )
      ).rows[0].consent,
    ).toBe(false);
    expect(
      (
        await pool.query<{ count: number }>(
          "SELECT count(*)::int count FROM call_attempts WHERE mode='live' AND workspace_id=$1",
          [identity.workspaceId],
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it('rolls back events/outbox with state and rejects cross-tenant relational edges', async () => {
    const before = (
      await pool.query<{ count: number }>(
        'SELECT count(*)::int count FROM outbox WHERE workspace_id=$1',
        [identity.workspaceId],
      )
    ).rows[0].count;
    await expect(
      transaction(async (connection) => {
        await appendCampaignEvent(
          connection,
          identity.workspaceId,
          campaign.id,
          'rollback.test',
        );
        await enqueueOutbox(
          connection,
          'analysis',
          { id: randomUUID() },
          identity.workspaceId,
        );
        throw new Error('rollback marker');
      }),
    ).rejects.toThrow('rollback marker');
    expect(
      (
        await pool.query<{ count: number }>(
          'SELECT count(*)::int count FROM outbox WHERE workspace_id=$1',
          [identity.workspaceId],
        )
      ).rows[0].count,
    ).toBe(before);
    expect(
      (
        await pool.query(
          'SELECT id FROM campaign_events WHERE campaign_id=$1 AND type=$2',
          [campaign.id, 'rollback.test'],
        )
      ).rows,
    ).toHaveLength(0);
    const foreign = new Client();
    const foreignIdentity = await foreign.signIn();
    const foreignAgent = (
      await pool.query<{ id: string }>(
        'SELECT id FROM agent_versions WHERE workspace_id=$1 LIMIT 1',
        [foreignIdentity.workspaceId],
      )
    ).rows[0].id;
    await expect(
      pool.query(
        'INSERT INTO campaigns(workspace_id,name,objective,agent_version_id,import_id,policy) VALUES($1,$2,$3,$4,$5,$6)',
        [
          identity.workspaceId,
          'Invalid edge',
          'Rejected',
          foreignAgent,
          imported.id,
          '{}',
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('deduplicates terminal inbox processing without another dial', async () => {
    const testCampaign = await client.campaign(imported.id, agentId);
    const contact = (
      await pool.query<{ id: string }>(
        'SELECT id FROM campaign_contacts WHERE campaign_id=$1 ORDER BY position LIMIT 1',
        [testCampaign.id],
      )
    ).rows[0];
    const attemptId = randomUUID();
    const vendorId = 'mock-fixture-' + randomUUID();
    await pool.query(
      "INSERT INTO call_attempts(id,workspace_id,campaign_id,campaign_contact_id,provider,mode,status,agent_version_id) SELECT $1,workspace_id,id,$2,'mock','simulation','accepted',agent_version_id FROM campaigns WHERE id=$3",
      [attemptId, contact.id, testCampaign.id],
    );
    const event = {
      provider: 'mock',
      providerAttemptId: vendorId,
      localAttemptId: attemptId,
      outcome: 'no_answer',
      durationSeconds: null,
      interactionId: null,
      failureCode: null,
      extractedFields: null,
      transcript: null,
      simulated: true,
    };
    const inserts = await Promise.all(
      [0, 1].map(() =>
        pool.query<{ id: string }>(
          'INSERT INTO webhook_inbox(workspace_id,provider,provider_attempt_id,local_attempt_id,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT(provider,provider_attempt_id) DO NOTHING RETURNING id',
          [
            identity.workspaceId,
            'mock',
            vendorId,
            attemptId,
            JSON.stringify(event),
          ],
        ),
      ),
    );
    const inboxId = inserts.flatMap((result) => result.rows)[0].id;
    await Promise.all([
      processReconciliation(inboxId),
      processReconciliation(inboxId),
    ]);
    expect(
      (
        await pool.query('SELECT id FROM analyses WHERE call_attempt_id=$1', [
          attemptId,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await pool.query(
          'SELECT id FROM call_attempts WHERE campaign_contact_id=$1',
          [contact.id],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await pool.query<{ status: string }>(
          'SELECT status FROM webhook_inbox WHERE id=$1',
          [inboxId],
        )
      ).rows[0].status,
    ).toBe('completed');
  });
});
