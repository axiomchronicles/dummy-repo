import { spawn } from 'node:child_process';
import { once } from 'node:events';
const db = new URL(process.env.DATABASE_URL);
db.pathname = '/outreach_repair_test';
const redis = new URL(process.env.REDIS_URL);
redis.pathname = '/14';
const base = {
  ...process.env,
  DATABASE_URL: db.toString(),
  REDIS_URL: redis.toString(),
  NODE_ENV: 'test',
  DEV_AUTH: 'true',
  VOICE_PROVIDER: 'mock',
  LIVE_CALLS_ENABLED: 'false',
  MODEL_PROVIDER: 'local',
  PUBLIC_BASE_URL: 'http://localhost:5180',
  ALLOWED_ORIGINS: 'http://localhost:5180,http://localhost:5190',
  API_PORT: '3100',
  WORKER_PORT: '3101',
  MOCK_LATENCY_MS: '20',
};
const migrate = spawn(process.execPath, ['dist/migrate.cjs'], {
  env: base,
  stdio: 'inherit',
});
await once(migrate, 'exit');
if (migrate.exitCode) process.exit(1);
const children = [];
function start(args, env = base) {
  const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
  children.push(child);
  return child;
}
start(['tests/support/model-stream.mjs']);
start(['dist/api.cjs']);
start(['dist/worker.cjs']);
start(['dist/api.cjs'], {
  ...base,
  API_PORT: '3200',
  MODEL_PROVIDER: 'openai-compatible',
  OPENAI_COMPATIBLE_API_KEY: 'controlled-fixture-key',
  OPENAI_COMPATIBLE_BASE_URL: 'http://127.0.0.1:3199/v1',
  OPENAI_COMPATIBLE_MODEL_ID: 'controlled-stream-model',
});
start(
  [
    'node_modules/vite/bin/vite.js',
    '--config',
    'apps/web/vite.config.ts',
    '--port',
    '5180',
  ],
  { ...base, API_PROXY_TARGET: 'http://127.0.0.1:3200' },
);
// Local-model web for workflow.spec.ts (asserts the deterministic-local planner).
start(
  [
    'node_modules/vite/bin/vite.js',
    '--config',
    'apps/web/vite.config.ts',
    '--port',
    '5190',
  ],
  { ...base, API_PROXY_TARGET: 'http://127.0.0.1:3100' },
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    for (const child of children) child.kill('SIGTERM');
    process.exit(0);
  });
