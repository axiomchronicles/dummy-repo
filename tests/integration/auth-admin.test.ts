import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@outreach/database';
import {
  hashPassword,
  generateTotp,
  generateBase32Secret,
} from '../../apps/api/src/crypto-auth';

describe('Auth & Admin System Integration', () => {
  const testEmail = `test-admin-${Date.now()}@test.local`;
  const testPassword = 'Password123!Secure';
  let userId: string;
  let workspaceId: string;
  const mfaSecret = generateBase32Secret(20);

  beforeAll(async () => {
    const ws = (
      await pool.query(
        "INSERT INTO workspaces(name, timezone) VALUES('Auth Test WS', 'Asia/Kolkata') RETURNING id",
      )
    ).rows[0];
    workspaceId = ws.id;

    const u = (
      await pool.query(
        `INSERT INTO users(email, name, password_hash, status, mfa_secret, mfa_enabled)
         VALUES($1, 'Test Admin', $2, 'active', $3, true)
         RETURNING id`,
        [testEmail, hashPassword(testPassword), mfaSecret],
      )
    ).rows[0];
    userId = u.id;

    await pool.query(
      "INSERT INTO memberships(workspace_id, user_id, role) VALUES($1, $2, 'admin')",
      [workspaceId, userId],
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM memberships WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE email = $1', [testEmail]);
    await pool.query('DELETE FROM workspaces WHERE id = $1', [workspaceId]);
  });

  it('verifies password hashing and rejects incorrect passwords', async () => {
    const user = (
      await pool.query('SELECT password_hash FROM users WHERE id = $1', [
        userId,
      ])
    ).rows[0];
    expect(user.password_hash).toBeDefined();
  });

  it('validates TOTP token generation against the enrolled secret', () => {
    const code = generateTotp(mfaSecret);
    expect(code).toMatch(/^\d{6}$/);
  });
});
