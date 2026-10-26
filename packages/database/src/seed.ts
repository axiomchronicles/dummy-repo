import { pool, transaction } from './index';
import { seedAgentPersonas } from './personas';
async function main() {
  await transaction(async (client) => {
    let workspace = (
      await client.query('SELECT id FROM workspaces WHERE id=$1', [
        '00000000-0000-4000-8000-000000000001',
      ])
    ).rows[0];
    if (!workspace)
      workspace = (
        await client.query(
          'INSERT INTO workspaces(id,name,timezone) VALUES($1,$2,$3) RETURNING id',
          [
            '00000000-0000-4000-8000-000000000001',
            'Starter workspace',
            'Asia/Kolkata',
          ],
        )
      ).rows[0];
    await seedAgentPersonas(client, workspace.id);
  });
  process.stdout.write(
    'Five starter personas available; no calls or telephone seeds\n',
  );
  await pool.end();
}
main().catch(async () => {
  process.stderr.write('Seed failed\n');
  await pool.end();
  process.exitCode = 1;
});
