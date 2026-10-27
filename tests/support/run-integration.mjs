/**
 * One coherent integration run (npm run test:integration:local).
 * Pass 1: every suite except chat against the isolated Compose project in compose.test.yaml
 *   (tests stop/restart/run its containers and query its PostgreSQL directly, so API_URL,
 *   WORKER_URL, DATABASE_URL, REDIS_URL and the compose project must all point at the same stack).
 * Pass 2: chat.test.ts against tests/support/run-services.mjs (api :3200 -> fake model :3199,
 *   database outreach_repair_test), which must already be running.
 * SKIP_BUILD=1 reuses the existing test image.
 */
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const project = 'outreach-repair-test';
const composeEnv = {
  ...process.env,
  COMPOSE_FILE: 'compose.test.yaml',
  COMPOSE_PROJECT_NAME: project,
  API_URL: 'http://localhost:3300',
  WORKER_URL: 'http://localhost:3301',
  DATABASE_URL:
    'postgresql://outreach_test:local_test_only@localhost:5543/outreach',
  REDIS_URL: 'redis://localhost:6489',
  NODE_ENV: 'test',
  DEV_AUTH: 'true',
  VOICE_PROVIDER: 'mock',
  LIVE_CALLS_ENABLED: 'false',
  MODEL_PROVIDER: 'local',
};
delete composeEnv.MODEL_FIXTURE_URL;

function run(command, args, env) {
  const result = spawnSync(command, args, { env, stdio: 'inherit' });
  return result.status ?? 1;
}
async function ready(url, timeout = 90000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      if (
        (await fetch(url, { signal: globalThis.AbortSignal.timeout(3000) })).ok
      )
        return true;
    } catch {
      /* not up yet */
    }
    await delay(500);
  }
  return false;
}

const up = ['compose', 'up', '-d', 'api', 'worker'];
if (process.env.SKIP_BUILD !== '1') up.push('--build');
if (run('docker', up, composeEnv)) process.exit(1);
// Only the secondary worker recovery.test.ts creates itself, by exact name.
spawnSync('docker', ['rm', '-f', `${project}-test-worker`], {
  stdio: 'ignore',
});
for (const url of [composeEnv.API_URL, composeEnv.WORKER_URL])
  if (!(await ready(url + '/health/ready'))) {
    process.stderr.write(`${url} never became ready\n`);
    process.exit(1);
  }

const vitest = ['node_modules/vitest/vitest.mjs', 'run'];
const config = ['--config', 'vitest.integration.config.ts'];
const composed = run(
  process.execPath,
  [...vitest, ...config, '--exclude', 'tests/integration/chat.test.ts'],
  composeEnv,
);

let chat;
if (await ready('http://localhost:3200/health/ready', 3000)) {
  const db = new URL(process.env.DATABASE_URL);
  db.pathname = '/outreach_repair_test';
  const redis = new URL(process.env.REDIS_URL);
  redis.pathname = '/14';
  chat = run(
    process.execPath,
    [...vitest, ...config, 'tests/integration/chat.test.ts'],
    {
      ...composeEnv,
      API_URL: 'http://localhost:3200',
      WORKER_URL: 'http://localhost:3101',
      MODEL_FIXTURE_URL: 'http://127.0.0.1:3199',
      DATABASE_URL: db.toString(),
      REDIS_URL: redis.toString(),
    },
  );
} else {
  process.stderr.write(
    'chat.test.ts not run: start `node --env-file=.env tests/support/run-services.mjs` first\n',
  );
  chat = 1;
}
process.exit(composed || chat);
