import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { pool } from './index';
async function main() {
  let connected = false;
  for (let i = 0; i < 30; i++) {
    try {
      await pool.query('SELECT 1');
      connected = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!connected) throw new Error('PostgreSQL unavailable for migration');
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(78345192)');
    await migrate(drizzle(client), {
      migrationsFolder: 'packages/database/migrations',
    });
    process.stdout.write('Versioned migrations applied\n');
  } finally {
    await client.query('SELECT pg_advisory_unlock(78345192)');
    client.release();
    await pool.end();
  }
}
main().catch(() => {
  process.stderr.write(
    'Migration failed; inspect database readiness and migration files\n',
  );
  process.exitCode = 1;
});
