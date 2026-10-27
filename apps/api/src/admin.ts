import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import { pool, transaction, appendAudit } from '@outreach/database';
import {
  UserInviteRequestSchema,
  KillSwitchRequestSchema,
} from '@outreach/contracts';
import {
  DomainError,
  parse,
  pagination,
  paged,
  offsetCursor,
  type SessionIdentity,
} from './common';

@Injectable()
export class AdminService {
  async getOverview(_identity: SessionIdentity): Promise<unknown> {
    const userCount = (await pool.query('SELECT count(*)::int as c FROM users')).rows[0].c;
    const campaignCount = (await pool.query('SELECT count(*)::int as c FROM campaigns')).rows[0].c;
    const attemptCount = (await pool.query('SELECT count(*)::int as c FROM call_attempts')).rows[0].c;

    const killSwitchRow = (
      await pool.query("SELECT value FROM system_settings WHERE key = 'telephony_kill_switch'")
    ).rows[0];
    const killSwitchActive = !!killSwitchRow?.value?.active;
    const killSwitchReason = killSwitchRow?.value?.reason;

    return {
      killSwitch: {
        active: killSwitchActive,
        ...(killSwitchReason ? { reason: killSwitchReason } : {}),
      },
      userCount,
      attemptCount,
      campaignCount,
      mode: process.env.LIVE_CALLS_ENABLED === 'true' ? 'live' : 'simulation',
    };
  }

  async listUsers(identity: SessionIdentity, query: Record<string, unknown>): Promise<unknown> {
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    const result = await pool.query(
      `SELECT u.id, u.email, u.name, u.status, u.mfa_enabled, u.created_at, m.role, w.name as workspace_name
       FROM users u
       LEFT JOIN memberships m ON m.user_id = u.id
       LEFT JOIN workspaces w ON w.id = m.workspace_id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit + 1, offset],
    );
    return paged(result.rows, limit, offset);
  }

  async inviteUser(identity: SessionIdentity, body: unknown): Promise<unknown> {
    const input = parse(UserInviteRequestSchema, body);
    const email = input.email.toLowerCase();
    const token = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 48 * 3600000); // 48 hours

    return transaction(async (client) => {
      // Check if user already exists
      const existing = (await client.query('SELECT id FROM users WHERE email = $1', [email])).rows[0];
      if (existing) {
        throw new DomainError('USER_ALREADY_EXISTS', 'A user with this email address is already provisioned.', 409);
      }

      // Create user record in 'invited' status
      const user = (
        await client.query(
          `INSERT INTO users(email, name, status, mfa_enabled)
           VALUES($1, $2, 'invited', false)
           RETURNING *`,
          [email, input.name],
        )
      ).rows[0];

      // Assign membership
      await client.query(
        `INSERT INTO memberships(workspace_id, user_id, role)
         VALUES($1, $2, $3)`,
        [identity.workspaceId, user.id, input.role],
      );

      // Record invitation
      const invite = (
        await client.query(
          `INSERT INTO user_invitations(workspace_id, email, name, role, token_hash, expires_at)
           VALUES($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [identity.workspaceId, email, input.name, input.role, tokenHash, expiresAt],
        )
      ).rows[0];

      await appendAudit(client, identity.workspaceId, identity.userId, 'user.invite', user.id, {
        invitedEmail: email,
        role: input.role,
      });

      return {
        invitationId: invite.id,
        email: invite.email,
        name: invite.name,
        role: invite.role,
        invitationToken: token,
        expiresAt: invite.expires_at,
      };
    });
  }

  async resetUserMfa(identity: SessionIdentity, targetUserId: string, reason: string): Promise<unknown> {
    return transaction(async (client) => {
      const user = (await client.query('SELECT id, email FROM users WHERE id = $1', [targetUserId])).rows[0];
      if (!user) throw new DomainError('USER_NOT_FOUND', 'Target user does not exist', 404);

      await client.query(
        'UPDATE users SET mfa_secret = NULL, mfa_enabled = false WHERE id = $1',
        [targetUserId],
      );
      await client.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [targetUserId]);

      await appendAudit(client, identity.workspaceId, identity.userId, 'user.reset_mfa', targetUserId, {
        targetEmail: user.email,
        reason,
      });

      return { success: true, targetUserId };
    });
  }

  async revokeUserSessions(identity: SessionIdentity, targetUserId: string): Promise<unknown> {
    return transaction(async (client) => {
      await client.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [targetUserId]);
      const deleteResult = await client.query('DELETE FROM sessions WHERE user_id = $1', [targetUserId]);

      await appendAudit(client, identity.workspaceId, identity.userId, 'user.revoke_sessions', targetUserId, {
        revokedSessionsCount: deleteResult.rowCount,
      });

      return { revokedCount: deleteResult.rowCount };
    });
  }

  async updateUserStatus(
    identity: SessionIdentity,
    targetUserId: string,
    status: 'active' | 'disabled' | 'locked',
  ): Promise<unknown> {
    return transaction(async (client) => {
      const user = (
        await client.query('UPDATE users SET status = $1 WHERE id = $2 RETURNING id, email, status', [
          status,
          targetUserId,
        ])
      ).rows[0];
      if (!user) throw new DomainError('USER_NOT_FOUND', 'Target user does not exist', 404);

      if (status !== 'active') {
        await client.query('DELETE FROM sessions WHERE user_id = $1', [targetUserId]);
      }

      await appendAudit(client, identity.workspaceId, identity.userId, 'user.update_status', targetUserId, {
        newStatus: status,
      });

      return user;
    });
  }

  async setKillSwitch(identity: SessionIdentity, body: unknown): Promise<unknown> {
    const input = parse(KillSwitchRequestSchema, body);
    return transaction(async (client) => {
      await client.query(
        `INSERT INTO system_settings(key, value, updated_by, updated_at)
         VALUES('telephony_kill_switch', $1, $2, now())
         ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [JSON.stringify({ active: input.active, reason: input.reason }), identity.userId],
      );

      await appendAudit(client, identity.workspaceId, identity.userId, 'system.kill_switch', 'system', {
        active: input.active,
        reason: input.reason,
      });

      return { killSwitchActive: input.active, reason: input.reason };
    });
  }
}
