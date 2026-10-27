import { createHash } from 'node:crypto';
import { pool, transaction, seedAgentPersonas } from '@outreach/database';
import { hashPassword, generateBase32Secret } from '../apps/api/src/crypto-auth';

async function seedDemoCredentials() {
  const adminEmail = 'admin@outreachintern.local';
  const adminPlainPassword = 'AdminPassword123!';
  const adminPasswordHash = hashPassword(adminPlainPassword);
  const adminMfaSecret = generateBase32Secret(20);
  const adminRecoveryCode = 'DEMO-RECO-VERY';
  const adminRecoveryHash = createHash('sha256').update(adminRecoveryCode).digest('hex');

  const operatorEmail = 'operator@outreachintern.local';
  const operatorPlainPassword = 'OperatorPassword123!';
  const operatorPasswordHash = hashPassword(operatorPlainPassword);
  const operatorMfaSecret = generateBase32Secret(20);
  const operatorRecoveryCode = 'DEMO-OPER-ATOR';
  const operatorRecoveryHash = createHash('sha256').update(operatorRecoveryCode).digest('hex');

  await transaction(async (client) => {
    // 1. Ensure default workspace exists
    let workspace = (
      await client.query("SELECT id, name FROM workspaces WHERE name = 'Primary Operations Workspace' LIMIT 1")
    ).rows[0];

    if (!workspace) {
      workspace = (
        await client.query(
          `INSERT INTO workspaces(name, timezone, settings)
           VALUES('Primary Operations Workspace', 'Asia/Kolkata', '{"defaultRegion":"IN"}')
           RETURNING id, name`,
        )
      ).rows[0];
    }

    // 2. Seed Administrator
    let adminUser = (
      await client.query('SELECT id, email FROM users WHERE email = $1 LIMIT 1', [adminEmail])
    ).rows[0];

    if (adminUser) {
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             status = 'active',
             failed_login_count = 0,
             locked_until = NULL,
             mfa_enabled = false,
             mfa_secret = $2
         WHERE id = $3`,
        [adminPasswordHash, adminMfaSecret, adminUser.id],
      );
    } else {
      adminUser = (
        await client.query(
          `INSERT INTO users(email, name, password_hash, status, mfa_secret, mfa_enabled)
           VALUES($1, 'System Administrator', $2, 'active', $3, false)
           RETURNING id, email`,
          [adminEmail, adminPasswordHash, adminMfaSecret],
        )
      ).rows[0];
    }

    // Ensure Admin membership
    const adminMembership = (
      await client.query(
        'SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2 LIMIT 1',
        [workspace.id, adminUser.id],
      )
    ).rows[0];

    if (!adminMembership) {
      await client.query(
        `INSERT INTO memberships(workspace_id, user_id, role)
         VALUES($1, $2, 'owner')`,
        [workspace.id, adminUser.id],
      );
    } else {
      await client.query(
        `UPDATE memberships SET role = 'owner' WHERE workspace_id = $1 AND user_id = $2`,
        [workspace.id, adminUser.id],
      );
    }

    await client.query(
      `INSERT INTO mfa_recovery_codes(user_id, code_hash)
       VALUES($1, $2)
       ON CONFLICT DO NOTHING`,
      [adminUser.id, adminRecoveryHash],
    );

    // 3. Seed Operator
    let operatorUser = (
      await client.query('SELECT id, email FROM users WHERE email = $1 LIMIT 1', [operatorEmail])
    ).rows[0];

    if (operatorUser) {
      await client.query(
        `UPDATE users
         SET password_hash = $1,
             status = 'active',
             failed_login_count = 0,
             locked_until = NULL,
             mfa_enabled = false,
             mfa_secret = $2
         WHERE id = $3`,
        [operatorPasswordHash, operatorMfaSecret, operatorUser.id],
      );
    } else {
      operatorUser = (
        await client.query(
          `INSERT INTO users(email, name, password_hash, status, mfa_secret, mfa_enabled)
           VALUES($1, 'Demo Outreach Operator', $2, 'active', $3, false)
           RETURNING id, email`,
          [operatorEmail, operatorPasswordHash, operatorMfaSecret],
        )
      ).rows[0];
    }

    // Ensure Operator membership
    const operatorMembership = (
      await client.query(
        'SELECT role FROM memberships WHERE workspace_id = $1 AND user_id = $2 LIMIT 1',
        [workspace.id, operatorUser.id],
      )
    ).rows[0];

    if (!operatorMembership) {
      await client.query(
        `INSERT INTO memberships(workspace_id, user_id, role)
         VALUES($1, $2, 'operator')`,
        [workspace.id, operatorUser.id],
      );
    } else {
      await client.query(
        `UPDATE memberships SET role = 'operator' WHERE workspace_id = $1 AND user_id = $2`,
        [workspace.id, operatorUser.id],
      );
    }

    await client.query(
      `INSERT INTO mfa_recovery_codes(user_id, code_hash)
       VALUES($1, $2)
       ON CONFLICT DO NOTHING`,
      [operatorUser.id, operatorRecoveryHash],
    );

    // 4. Seed default agent personas
    await seedAgentPersonas(client, workspace.id);

    console.log('\n================================================================');
    console.log('  ✅ Outreach Intern Demo Credentials Ready');
    console.log('================================================================');
    console.log('  [1] Administrator (Owner / Superadmin)');
    console.log(`      Email       : ${adminEmail}`);
    console.log(`      Password    : ${adminPlainPassword}`);
    console.log(`      Role        : Superadmin / Owner`);
    console.log(`      MFA Code    : 123456 (or any 6 digits)`);
    console.log(`      Backup Code : ${adminRecoveryCode}`);
    console.log('----------------------------------------------------------------');
    console.log('  [2] Operator (Mobile Outreach User)');
    console.log(`      Email       : ${operatorEmail}`);
    console.log(`      Password    : ${operatorPlainPassword}`);
    console.log(`      Role        : Operator`);
    console.log(`      MFA Code    : 123456 (or any 6 digits)`);
    console.log(`      Backup Code : ${operatorRecoveryCode}`);
    console.log('----------------------------------------------------------------');
    console.log(`  Workspace       : ${workspace.name} (${workspace.id})`);
    console.log('================================================================\n');
  });

  await pool.end();
}

seedDemoCredentials().catch((err) => {
  console.error('Failed to seed demo credentials:', err);
  process.exit(1);
});
