import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
export * from './schema';
export { schema };
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  statement_timeout: 15000,
  lock_timeout: 5000,
  query_timeout: 20000,
});
pool.on('error', () => process.stderr.write('database pool connection lost\n'));
export const db = drizzle(pool, { schema });
export async function transaction<T>(
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
export async function enqueueOutbox(
  client: PoolClient,
  kind: string,
  payload: { id: string },
  workspaceId: string,
) {
  return (
    await client.query(
      'INSERT INTO outbox(workspace_id,kind,payload) VALUES($1,$2,$3) RETURNING id',
      [workspaceId, kind, JSON.stringify(payload)],
    )
  ).rows[0].id as string;
}
export async function appendCampaignEvent(
  client: PoolClient,
  workspaceId: string,
  campaignId: string,
  type: string,
  payload: Record<string, unknown> = {},
) {
  return (
    await client.query(
      'INSERT INTO campaign_events(workspace_id,campaign_id,type,payload) VALUES($1,$2,$3,$4) RETURNING id',
      [workspaceId, campaignId, type, JSON.stringify(payload)],
    )
  ).rows[0].id as string;
}
export async function appendAudit(
  client: PoolClient,
  workspaceId: string,
  actorId: string | null,
  action: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  await client.query(
    'INSERT INTO audit_log(workspace_id,actor_id,action,entity_id,metadata) VALUES($1,$2,$3,$4,$5)',
    [workspaceId, actorId, action, entityId, JSON.stringify(metadata)],
  );
}
export async function waitForDatabase(attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      await pool.query('SELECT 1 FROM campaigns LIMIT 1');
      return;
    } catch {
      if (i === attempts - 1) throw new Error('Database schema unavailable');
      await new Promise((r) => setTimeout(r, Math.min(1000 + i * 200, 5000)));
    }
  }
}
export { seedAgentPersonas, starterPersonas } from './personas';

export { contactFacts, eligibility, type ResolvedContact } from './recipients';
export {
  getProviderBinding,
  verifyProviderBinding,
  type ProviderBinding,
} from './provider-bindings';
