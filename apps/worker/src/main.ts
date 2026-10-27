import { createServer } from 'node:http';
import { Queue, Worker, UnrecoverableError, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { loadConfig } from '@outreach/config';
import { JobPayloadSchema } from '@outreach/contracts';
import {
  pool,
  transaction,
  waitForDatabase,
  appendCampaignEvent,
} from '@outreach/database';
import { processProviderState } from './provider-state';
import { processArtifacts } from './artifacts';
import { processImport } from './imports';
import {
  processDispatch,
  processReconciliation,
  processAnalysis,
  settleCampaign,
} from './calls';
import { processReport } from './reports';
const config = loadConfig();
const queueKinds = [
  'imports',
  'dispatch',
  'reconciliation',
  'analysis',
  'reports',
  'artifacts',
  'provider-state',
] as const;
type QueueKind = (typeof queueKinds)[number];
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const producerRedis = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: 2,
  enableOfflineQueue: false,
  connectTimeout: 3000,
  commandTimeout: 3000,
});
producerRedis.on('error', () =>
  process.stderr.write('worker publisher redis connection unavailable\n'),
);
let dispatchCursor: string | null = null;
redis.on('error', () =>
  process.stderr.write('worker redis connection unavailable\n'),
);
const handlers: Record<QueueKind, (id: string) => Promise<void>> = {
  imports: processImport,
  dispatch: processDispatch,
  reconciliation: processReconciliation,
  analysis: processAnalysis,
  reports: processReport,
  artifacts: processArtifacts,
  'provider-state': processProviderState,
};
const queues = new Map<QueueKind, Queue>();
const workers: Worker[] = [];
let stopping = false,
  heartbeat = 0,
  polling = false;
const server = createServer(async (request, response) => {
  if (request.url === '/health/live') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ alive: true }));
    return;
  }
  if (request.url === '/health/ready') {
    try {
      await pool.query('SELECT 1 FROM campaigns LIMIT 1');
      await Promise.race([
        redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis health timeout')), 1000),
        ),
      ]);
      if (
        stopping ||
        Date.now() - heartbeat > 20000 ||
        workers.length !== queueKinds.length
      )
        throw new Error();
      response.writeHead(200);
      response.end(JSON.stringify({ ready: true, queues: queueKinds }));
    } catch {
      response.writeHead(503);
      response.end(JSON.stringify({ ready: false }));
    }
    return;
  }
  response.writeHead(404);
  response.end();
});
server.listen(config.WORKER_PORT, '0.0.0.0');
async function enqueue(kind: QueueKind, id: string, key = `recovery-${id}`) {
  const queue = queues.get(kind)!;
  const existing = await queue.getJob(key);
  if (existing) {
    const state = await existing.getState();
    if (state === 'completed' || state === 'failed') await existing.remove();
    else return;
  }
  await queue.add(
    kind,
    { id },
    {
      jobId: key,
      attempts: 5,
      backoff: { type: 'exponential', delay: 1000, jitter: 0.3 },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  );
}
async function publishOutbox() {
  await transaction(async (client) => {
    const providerStates = await client.query<{
      id: string;
      workspace_id: string;
    }>(
      "SELECT id,workspace_id FROM call_attempts WHERE provider='sarvam' AND provider_attempt_id IS NOT NULL AND status IN ('accepted','unknown') AND started_at>now()-interval '1 day' AND (provider_polled_at IS NULL OR provider_polled_at<now()-interval '2 minutes') LIMIT 10 FOR UPDATE SKIP LOCKED",
    );
    for (const attempt of providerStates.rows) {
      await client.query(
        'UPDATE call_attempts SET provider_polled_at=now() WHERE id=$1',
        [attempt.id],
      );
      await client.query(
        "INSERT INTO outbox(workspace_id,kind,payload) VALUES($1,'provider-state',$2)",
        [attempt.workspace_id, JSON.stringify({ id: attempt.id })],
      );
    }
    await client.query(
      "UPDATE call_artifacts a SET recording=NULL,recording_status='expired',transcript_status='expired' FROM analyses n WHERE n.call_attempt_id=a.call_attempt_id AND n.expires_at<=now() AND (a.recording IS NOT NULL OR a.recording_status<>'expired')",
    );
    const artifacts = await client.query<{ id: string; workspace_id: string }>(
      "SELECT id,workspace_id FROM call_artifacts WHERE next_poll_at<=now() AND (transcript_status='processing' OR recording_status='processing') ORDER BY next_poll_at LIMIT 10 FOR UPDATE SKIP LOCKED",
    );
    for (const artifact of artifacts.rows) {
      await client.query(
        "UPDATE call_artifacts SET next_poll_at=now()+interval '2 minutes' WHERE id=$1",
        [artifact.id],
      );
      await client.query(
        "INSERT INTO outbox(workspace_id,kind,payload,available_at) VALUES($1,'artifacts',$2,now()+interval '2 seconds')",
        [artifact.workspace_id, JSON.stringify({ id: artifact.id })],
      );
    }
    const rows = (
      await client.query(
        'SELECT * FROM outbox WHERE published_at IS NULL AND available_at<=now() ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 50',
      )
    ).rows;
    for (const row of rows) {
      if (!queueKinds.includes(row.kind)) {
        await client.query(
          "UPDATE outbox SET attempts=attempts+1,available_at=now()+interval '1 minute' WHERE id=$1",
          [row.id],
        );
        continue;
      }
      const payload = JobPayloadSchema.parse(row.payload);
      await enqueue(row.kind, payload.id, `outbox-${row.id}`);
      await client.query(
        'UPDATE outbox SET published_at=now(),attempts=attempts+1 WHERE id=$1',
        [row.id],
      );
    }
  });
}
async function recover() {
  const imports = (
    await pool.query(
      "SELECT id FROM imports WHERE status IN ('uploaded','validating') LIMIT 50",
    )
  ).rows;
  for (const r of imports) await enqueue('imports', r.id);
  const reports = (
    await pool.query(
      "SELECT id FROM reports WHERE status IN ('pending','processing') LIMIT 50",
    )
  ).rows;
  for (const r of reports) await enqueue('reports', r.id);
  const analyses = (
    await pool.query(
      "SELECT id FROM analyses WHERE status IN ('pending','processing') LIMIT 50",
    )
  ).rows;
  for (const r of analyses) await enqueue('analysis', r.id);
  const inbox = (
    await pool.query(
      "SELECT id FROM webhook_inbox WHERE status='pending' LIMIT 50",
    )
  ).rows;
  for (const r of inbox) await enqueue('reconciliation', r.id);
  const dispatch = (
    await pool.query(
      "SELECT cc.id,a.id attempt_id,cc.status FROM campaign_contacts cc JOIN campaigns c ON c.id=cc.campaign_id LEFT JOIN call_attempts a ON a.campaign_contact_id=cc.id WHERE c.status='running' AND ($1::uuid IS NULL OR cc.id>$1) AND (cc.status='queued' OR (cc.status='calling' AND a.provider='mock' AND a.status IN ('dispatching','accepted') AND a.started_at<now()-($2::int*interval '1 millisecond'))) ORDER BY cc.id LIMIT 100",
      [dispatchCursor, Math.max(config.MOCK_LATENCY_MS + 1000, 2000)],
    )
  ).rows;
  for (const r of dispatch)
    await enqueue(
      'dispatch',
      r.id,
      r.status === 'calling'
        ? `mock-recovery-${r.attempt_id}-${Math.floor(Date.now() / 15000)}`
        : undefined,
    );
  dispatchCursor =
    dispatch.length === 100 ? dispatch[dispatch.length - 1].id : null;
  // Only old real attempts are marked uncertain. Accepted calls can legitimately last minutes; never redial either state.
  await transaction(async (client) => {
    const stale = (
      await client.query(
        "SELECT a.* FROM call_attempts a WHERE a.provider='sarvam' AND ((a.status='dispatching' AND a.started_at<now()-interval '2 minutes') OR (a.status='accepted' AND a.started_at<now()-interval '30 minutes')) LIMIT 50",
      )
    ).rows;
    for (const a of stale) {
      await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [
        a.campaign_id,
      ]);
      const locked = (
        await client.query(
          'SELECT status FROM call_attempts WHERE id=$1 FOR UPDATE',
          [a.id],
        )
      ).rows[0];
      if (!['dispatching', 'accepted'].includes(locked.status)) continue;
      await client.query(
        "UPDATE call_attempts SET status='unknown',failure_code='PROVIDER_RECOVERY_UNCERTAIN' WHERE id=$1",
        [a.id],
      );
      await client.query(
        "UPDATE campaign_contacts SET status='unknown',reason='PROVIDER_RECOVERY_UNCERTAIN' WHERE id=$1",
        [a.campaign_contact_id],
      );
      await appendCampaignEvent(
        client,
        a.workspace_id,
        a.campaign_id,
        'attempt.unknown',
        { attemptId: a.id, reason: 'PROVIDER_RECOVERY_UNCERTAIN' },
      );
      await settleCampaign(client, a.campaign_id, a.workspace_id);
    }
  });
  await pool.query(
    "UPDATE reports SET artifact=NULL,failure_code='ARTIFACT_EXPIRED' WHERE expires_at<now() AND artifact IS NOT NULL",
  );
  await pool.query(
    'UPDATE analyses SET transcript=NULL,extracted_fields=NULL,summary=NULL WHERE expires_at<now() AND (transcript IS NOT NULL OR extracted_fields IS NOT NULL OR summary IS NOT NULL)',
  );
  await transaction(async (client) => {
    const expired = (
      await client.query(
        "SELECT id FROM imports WHERE created_at<now()-($1::int*interval '1 day') AND status NOT IN ('uploaded','validating') AND octet_length(source_bytes)>0 FOR UPDATE SKIP LOCKED LIMIT 50",
        [config.RETENTION_DAYS],
      )
    ).rows;
    for (const row of expired) {
      await client.query(
        "UPDATE imports SET source_bytes=$2,corrections='{}'::jsonb,failure_code='SOURCE_EXPIRED' WHERE id=$1",
        [row.id, Buffer.alloc(0)],
      );
      await client.query(
        "UPDATE import_rows SET source_cells='{}'::jsonb,normalized_phone=NULL WHERE import_id=$1",
        [row.id],
      );
    }
  });
  await pool.query(
    "UPDATE webhook_inbox SET payload=jsonb_set(jsonb_set(payload,'{transcript}','null'::jsonb),'{extractedFields}','null'::jsonb) WHERE status='completed' AND created_at<now()-($1::int*interval '1 day') AND (payload->'transcript'<>'null'::jsonb OR payload->'extractedFields'<>'null'::jsonb)",
    [config.RETENTION_DAYS],
  );
  await pool.query('DELETE FROM sessions WHERE expires_at<now()');
}
async function tick() {
  if (stopping || polling) return;
  polling = true;
  try {
    await publishOutbox();
    await recover();
    heartbeat = Date.now();
  } catch {
    process.stderr.write('worker coordination retry pending\n');
  } finally {
    polling = false;
  }
}
let timer: ReturnType<typeof setInterval> | undefined;
async function bootstrap() {
  await waitForDatabase();
  for (const kind of queueKinds) {
    queues.set(
      kind,
      new Queue(`outreach-${kind}`, { connection: producerRedis }),
    );
    const worker = new Worker(
      `outreach-${kind}`,
      async (job: Job) => {
        const payload = JobPayloadSchema.safeParse(job.data);
        if (!payload.success)
          throw new UnrecoverableError('INVALID_JOB_PAYLOAD');
        await handlers[kind](payload.data.id);
      },
      { connection: redis, concurrency: kind === 'dispatch' ? 4 : 2 },
    );
    worker.on('error', () =>
      process.stderr.write(`worker ${kind} infrastructure error\n`),
    );
    worker.on('failed', async (job) => {
      if (!job || job.attemptsMade < 5) return;
      const table =
        kind === 'imports'
          ? 'imports'
          : kind === 'reports'
            ? 'reports'
            : kind === 'analysis'
              ? 'analyses'
              : null;
      if (table)
        try {
          await pool.query(
            `UPDATE ${table} SET status='failed',failure_code='EXECUTION_RETRIES_EXHAUSTED' WHERE id=$1 AND status<>'completed'`,
            [job.data.id],
          );
        } catch {
          /* Database recovery handles unfinished jobs when available. */
        }
    });
    workers.push(worker);
  }
  await tick();
  timer = setInterval(() => void tick(), 2000);
  process.stdout.write('worker ready: mock default, durable queues active\n');
}
async function shutdown() {
  if (stopping) return;
  stopping = true;
  if (timer) clearInterval(timer);
  server.close();
  while (polling) await new Promise((resolve) => setTimeout(resolve, 50));
  await Promise.allSettled(workers.map((worker) => worker.close()));
  await Promise.allSettled([...queues.values()].map((queue) => queue.close()));
  redis.disconnect();
  producerRedis.disconnect();
  await pool.end();
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
bootstrap().catch(async () => {
  process.stderr.write('Worker startup failed\n');
  await shutdown();
  process.exitCode = 1;
});
