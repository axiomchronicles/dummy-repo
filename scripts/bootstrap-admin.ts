#!/usr/bin/env node
/**
 * scripts/bootstrap-admin.ts
 *
 * One-time setup utility to bootstrap the initial superadmin account.
 * Rejects repeated execution if a superadmin account already exists.
 *
 * Usage:
 *   node --env-file-if-exists=.env --import tsx scripts/bootstrap-admin.ts --email admin@example.com --name "System Administrator"
 */

import { randomBytes } from 'node:crypto';
import { pool, transaction, appendAudit, seedAgentPersonas } from '@outreach/database';
import { hashPassword, generateBase32Secret } from '../apps/api/src/crypto-auth';

async function bootstrap() {
  const args = process.argv.slice(2);
  let email = 'admin@outreachintern.local';
  let name = 'System Administrator';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) {
      email = args[++i].toLowerCase();
    } else if (args[i] === '--name' && args[i + 1]) {
      name = args[++i];
    }
  }

  const existingSuperadmin = (
    await pool.query(
      "SELECT u.id, u.email FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.email = $1 OR m.role = 'superadmin' LIMIT 1",
      [email],
    )
  ).rows[0];

  if (existingSuperadmin) {
    console.error(`❌ Bootstrap aborted: Superadmin or specified user account already exists (${existingSuperadmin.email}).`);
    process.exit(1);
  }

  const temporaryPassword = `Admin-${randomBytes(6).toString('hex')}!`;
  const passwordHash = hashPassword(temporaryPassword);
  const mfaSecret = generateBase32Secret(20);

  const result = await transaction(async (client) => {
    // Insert user
    const user = (
      await client.query(
        `INSERT INTO users(email, name, password_hash, status, mfa_secret, mfa_enabled)
         VALUES($1, $2, $3, 'active', $4, false)
         RETURNING *`,
        [email, name, passwordHash, mfaSecret],
      )
    ).rows[0];

    // Create default workspace
    const workspace = (
      await client.query(
        `INSERT INTO workspaces(name, timezone, settings)
         VALUES($1, 'Asia/Kolkata', $2)
         RETURNING *`,
        ['Primary Operations Workspace', JSON.stringify({ defaultRegion: 'IN' })],
      )
    ).rows[0];

    // Assign superadmin / owner membership
    await client.query(
      `INSERT INTO memberships(workspace_id, user_id, role)
       VALUES($1, $2, 'owner')`,
      [workspace.id, user.id],
    );

    // Seed default agent personas
    await seedAgentPersonas(client, workspace.id);

    // Audit log
    await appendAudit(client, workspace.id, user.id, 'admin.bootstrap', user.id, {
      email: user.email,
      role: 'superadmin',
    });

    return { user, workspace, temporaryPassword };
  });

  console.log('\n================================================================');
  console.log('  ✅ Outreach Intern Superadmin Successfully Bootstrapped');
  console.log('================================================================');
  console.log(`  User ID    : ${result.user.id}`);
  console.log(`  Email      : ${result.user.email}`);
  console.log(`  Name       : ${result.user.name}`);
  console.log(`  Workspace  : ${result.workspace.name} (${result.workspace.id})`);
  console.log(`  Password   : ${result.temporaryPassword}`);
  console.log('----------------------------------------------------------------');
  console.log('  ⚠️  SAVE THIS PASSWORD! It will NOT be shown again.');
  console.log('  MFA enrollment will be mandated upon first login.');
  console.log('================================================================\n');

  await pool.end();
}

bootstrap().catch(async (err) => {
  console.error('Fatal bootstrap error:', err);
  await pool.end();
  process.exit(1);
});
