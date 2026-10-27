import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

describe('clean versioned PostgreSQL migration', () => {
  it('migrates an isolated empty database twice and enforces relational constraints', async () => {
    const appUrl = new URL(process.env.DATABASE_URL!);
    const adminUrl = new URL(appUrl);
    adminUrl.pathname = '/postgres';
    const name = 'outreach_migration_test_' + randomUUID().replaceAll('-', '');
    expect(name).toMatch(/^outreach_migration_test_[a-f0-9]{32}$/);
    const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
    let isolated: Pool | undefined;
    try {
      await admin.query(`CREATE DATABASE "${name}"`);
      const url = new URL(appUrl);
      url.pathname = '/' + name;
      isolated = new Pool({ connectionString: url.toString(), max: 1 });
      await migrate(drizzle(isolated), {
        migrationsFolder: 'packages/database/migrations',
      });
      await migrate(drizzle(isolated), {
        migrationsFolder: 'packages/database/migrations',
      });
      const tables = (
        await isolated.query<{ count: number }>(
          "SELECT count(*)::int count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
        )
      ).rows[0]!.count;
      expect(tables).toBe(28);
      const workspace = (
        await isolated.query<{ id: string }>(
          "INSERT INTO workspaces(name) VALUES('Migration test') RETURNING id",
        )
      ).rows[0]!.id;
      const values = [workspace, '+12025550101', 'Synthetic migration contact'];
      await isolated.query(
        'INSERT INTO contacts(workspace_id,phone,name) VALUES($1,$2,$3)',
        values,
      );
      await expect(
        isolated.query(
          'INSERT INTO contacts(workspace_id,phone,name) VALUES($1,$2,$3)',
          values,
        ),
      ).rejects.toMatchObject({ code: '23505' });
      await expect(
        isolated.query(
          'INSERT INTO contacts(workspace_id,phone,name) VALUES($1,$2,$3)',
          [workspace, '2025550101', 'Invalid phone'],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        isolated.query(
          'INSERT INTO imports(workspace_id,status,filename,media_type,source_bytes,mapping) VALUES($1,$2,$3,$4,$5,$6)',
          [
            workspace,
            'invented-state',
            'x.csv',
            'text/csv',
            Buffer.from('a\n1'),
            '{}',
          ],
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        isolated.query(
          'INSERT INTO contacts(workspace_id,phone,name) VALUES($1,$2,$3)',
          [randomUUID(), '+12025550102', 'Foreign workspace'],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    } finally {
      if (isolated) await isolated.end();
      await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
      await admin.end();
    }
  }, 60000);
});
