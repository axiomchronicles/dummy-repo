import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const manifest = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
);
for (const [name, entry] of Object.entries({
  api: 'apps/api/src/main.ts',
  worker: 'apps/worker/src/main.ts',
  migrate: 'packages/database/src/migrate.ts',
  seed: 'packages/database/src/seed.ts',
})) {
  await build({
    entryPoints: [entry],
    outfile: `dist/${name}.cjs`,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node24',
    external: Object.keys(manifest.dependencies),
    sourcemap: true,
    tsconfig: 'tsconfig.json',
  });
}
const admin = spawnSync(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'build',
    '--config',
    'apps/admin/vite.config.ts',
  ],
  { stdio: 'inherit' },
);
if (admin.status !== 0) process.exit(admin.status ?? 1);
