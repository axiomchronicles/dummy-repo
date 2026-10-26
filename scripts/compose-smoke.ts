import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const project = 'outreach-smoke-' + randomUUID().slice(0, 8);
const directory = await mkdtemp(join(tmpdir(), 'outreach-smoke-'));
const override = join(directory, 'compose.yaml');
const environment = {
  ...process.env,
  NODE_ENV: 'development',
  DEV_AUTH: 'true',
  VOICE_PROVIDER: 'mock',
  LIVE_CALLS_ENABLED: 'false',
  API_PORT: '3004',
  WORKER_PORT: '3005',
  WEB_PORT: '5174',
  POSTGRES_PORT: '5443',
  REDIS_PORT: '6390',
  PUBLIC_BASE_URL: 'http://localhost:5174',
};
const args = ['compose', '-p', project, '-f', 'compose.yaml', '-f', override];
async function docker(parameters: string[]) {
  return execute('docker', parameters, {
    env: environment,
    timeout: 90000,
    maxBuffer: 2 * 1024 * 1024,
  });
}
await writeFile(
  override,
  'services:\n  api:\n    environment:\n      ALLOWED_ORIGINS: http://localhost:5174\n',
);
process.env.API_URL = 'http://localhost:3004';
const { Client, until } = await import('../tests/integration/helpers');
type RecordView = {
  id: string;
  status: string;
  rowCount?: number;
  mode?: string;
};
try {
  await docker([...args, 'up', '--no-build', '-d']);
  for (const url of [
    'http://localhost:3004/health/ready',
    'http://localhost:3005/health/ready',
    'http://localhost:5174/',
  ]) {
    await until(async () => {
      try {
        return (await fetch(url, { signal: AbortSignal.timeout(2000) })).ok
          ? true
          : undefined;
      } catch {
        return undefined;
      }
    });
  }
  const client = new Client();
  await client.signIn();
  const agents = await client.json<{ items: { id: string }[] }>('/agents');
  if (agents.items.length !== 5)
    throw new Error('Expected five fresh personas');
  const imported = await client.imported();
  if (imported.status !== 'ready')
    throw new Error('Fresh import validation failed');
  const campaign = await client.campaign(imported.id, agents.items[0].id);
  await client.json('/campaigns/' + campaign.id + '/plan', {});
  const before = await client.json<{ items: unknown[] }>(
    '/campaigns/' + campaign.id + '/attempts',
  );
  if (before.items.length)
    throw new Error('Planning unexpectedly created attempts');
  await client.json(
    '/campaigns/' + campaign.id + '/simulate',
    { confirmed: true },
    randomUUID(),
  );
  await until(async () => {
    const row = await client.json<RecordView>('/campaigns/' + campaign.id);
    return row.status === 'completed' ? row : undefined;
  });
  const attempts = await client.json<{ items: RecordView[] }>(
    '/campaigns/' + campaign.id + '/attempts',
  );
  if (
    attempts.items.length !== 4 ||
    attempts.items.some((row) => row.mode !== 'simulation')
  )
    throw new Error('Unexpected simulation results');
  const report = await client.json<RecordView>(
    '/campaigns/' + campaign.id + '/reports',
    { format: 'xlsx' },
    randomUUID(),
  );
  await until(async () => {
    const rows = await client.json<{ items: RecordView[] }>('/reports');
    return rows.items.find(
      (row) => row.id === report.id && row.status === 'completed',
    );
  });
  const download = await client.response('/reports/' + report.id + '/download');
  if (!download.ok || (await download.arrayBuffer()).byteLength < 1000)
    throw new Error('Report download failed');
  console.log(
    'Clean Compose smoke passed: fresh migrations/seed, five healthy services, plan, four mock attempts, XLSX report download',
  );
} finally {
  await docker([...args, 'down']);
  await docker([
    'volume',
    'rm',
    project + '_postgres-data',
    project + '_redis-data',
  ]);
  await rm(directory, { recursive: true, force: true });
}
