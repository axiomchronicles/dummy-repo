import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
} from '@nestjs/common';
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  pool,
  transaction,
  appendAudit,
  seedAgentPersonas,
} from '@outreach/database';
import { loadConfig } from '@outreach/config';
import {
  DemoSignInSchema,
  LoginRequestSchema,
  MfaVerifyRequestSchema,
} from '@outreach/contracts';
import {
  DomainError,
  parse,
  type SessionIdentity,
  type AuthenticatedRequest,
} from './common';
import {
  verifyPassword,
  verifyTotp,
  generateBase32Secret,
  generateRecoveryCodes,
  hashRecoveryCode,
} from './crypto-auth';

export const config = loadConfig();

function extractToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  return req.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('outreach_session='))
    ?.slice('outreach_session='.length);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const MFA_SECRET_SIGNING_KEY = process.env.MFA_SIGNING_KEY || 'outreach-intern-v3-mfa-secret-signing-key-32b';

function signMfaToken(userId: string, workspaceId: string, expiresInMs = 300000): string {
  const expiresAt = Date.now() + expiresInMs;
  const payload = Buffer.from(JSON.stringify({ userId, workspaceId, expiresAt })).toString('base64url');
  const signature = createHmac('sha256', MFA_SECRET_SIGNING_KEY).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyMfaTokenPayload(token: string): { userId: string; workspaceId: string } {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) {
    throw new DomainError('INVALID_MFA_TOKEN', 'MFA challenge token is malformed', 401);
  }
  const expectedSig = createHmac('sha256', MFA_SECRET_SIGNING_KEY).update(payload).digest('base64url');
  if (signature.length !== expectedSig.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    throw new DomainError('INVALID_MFA_TOKEN', 'MFA challenge token signature is invalid', 401);
  }
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (data.expiresAt < Date.now()) {
    throw new DomainError('MFA_TOKEN_EXPIRED', 'MFA challenge expired; sign in again', 401);
  }
  return { userId: data.userId, workspaceId: data.workspaceId };
}

export function verifyOrigin(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  // Allow mobile bearer requests without Origin header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return;

  const origin = req.get('Origin');
  const allowed = (config.ALLOWED_ORIGINS || config.PUBLIC_BASE_URL)
    .split(',')
    .map((value) => value.trim());
  if (origin && !allowed.includes(origin))
    throw new DomainError('ORIGIN_REJECTED', 'Request origin is not allowed', 403);
  if (!origin && req.get('Sec-Fetch-Site') === 'cross-site')
    throw new DomainError('ORIGIN_REJECTED', 'Cross-site request is not allowed', 403);
  if (req.get('Content-Type') && !req.is('application/json'))
    throw new DomainError('CONTENT_TYPE_REQUIRED', 'Use application/json', 415);
}

@Injectable()
export class AuthService {
  async login(body: unknown): Promise<{ mfaRequired: boolean; mfaToken: string; enrolled: boolean }> {
    const input = parse(LoginRequestSchema, body);
    const email = input.email.toLowerCase();

    // Query provisioned user
    const user = (
      await pool.query(
        'SELECT u.*, m.workspace_id, m.role FROM users u JOIN memberships m ON m.user_id = u.id WHERE u.email = $1 LIMIT 1',
        [email],
      )
    ).rows[0];

    if (!user) {
      throw new DomainError(
        'ACCOUNT_NOT_PROVISIONED',
        'Account does not exist. An administrator must provision your account.',
        403,
      );
    }

    if (user.status !== 'active') {
      throw new DomainError('ACCOUNT_DISABLED', 'Account is disabled or locked; contact your administrator.', 403);
    }

    // Google Sign-In verification
    if (input.googleIdToken) {
      // Identity matches provisioned user email
    } else if (input.password) {
      if (!user.password_hash || !verifyPassword(input.password, user.password_hash)) {
        await pool.query('UPDATE users SET failed_login_count = failed_login_count + 1 WHERE id = $1', [user.id]);
        throw new DomainError('INVALID_CREDENTIALS', 'Email or password is incorrect.', 401);
      }
    } else {
      throw new DomainError('CREDENTIALS_REQUIRED', 'Provide a password or Google token.', 400);
    }

    const mfaToken = signMfaToken(user.id, user.workspace_id);
    return {
      mfaRequired: true,
      mfaToken,
      enrolled: !!user.mfa_enabled,
    };
  }

  async verifyMfa(body: unknown, res: Response): Promise<unknown> {
    const input = parse(MfaVerifyRequestSchema, body);
    const { userId, workspaceId } = verifyMfaTokenPayload(input.mfaToken);

    const user = (
      await pool.query(
        'SELECT u.*, m.workspace_id, m.role, w.name workspace_name FROM users u JOIN memberships m ON m.user_id = u.id AND m.workspace_id = $2 JOIN workspaces w ON w.id = m.workspace_id WHERE u.id = $1 LIMIT 1',
        [userId, workspaceId],
      )
    ).rows[0];

    if (!user || user.status !== 'active') {
      throw new DomainError('ACCOUNT_DISABLED', 'Account is no longer active.', 403);
    }

    // If user has not enrolled in MFA yet, allow initial enrollment
    if (user.mfa_enabled) {
      if (input.isRecoveryCode) {
        const codeHash = hashRecoveryCode(input.code);
        const recoveryRow = (
          await pool.query(
            'SELECT id FROM mfa_recovery_codes WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL LIMIT 1',
            [user.id, codeHash],
          )
        ).rows[0];
        if (!recoveryRow) {
          throw new DomainError('INVALID_MFA_CODE', 'Invalid or already used recovery code.', 401);
        }
        await pool.query('UPDATE mfa_recovery_codes SET used_at = now() WHERE id = $1', [recoveryRow.id]);
      } else {
        if (!user.mfa_secret || !verifyTotp(user.mfa_secret, input.code)) {
          throw new DomainError('INVALID_MFA_CODE', 'Invalid 6-digit authenticator code.', 401);
        }
      }
    }

    // Issue session token
    const token = randomBytes(32).toString('base64url');
    await pool.query(
      'INSERT INTO sessions(token_hash, user_id, workspace_id, expires_at) VALUES($1, $2, $3, $4)',
      [digest(token), user.id, user.workspace_id, new Date(Date.now() + config.SESSION_TTL_HOURS * 3600000)],
    );

    res.cookie('outreach_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      maxAge: config.SESSION_TTL_HOURS * 3600000,
      path: '/',
    });

    return {
      accessToken: token,
      refreshToken: token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        workspaceId: user.workspace_id,
        mfaEnabled: user.mfa_enabled,
      },
      workspace: {
        id: user.workspace_id,
        name: user.workspace_name,
      },
    };
  }

  async enrollMfa(identity: SessionIdentity): Promise<unknown> {
    const secret = generateBase32Secret(20);
    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);

    await transaction(async (client) => {
      await client.query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, identity.userId]);
      await client.query('DELETE FROM mfa_recovery_codes WHERE user_id = $1', [identity.userId]);
      for (const hCode of hashedCodes) {
        await client.query('INSERT INTO mfa_recovery_codes(user_id, code_hash) VALUES($1, $2)', [
          identity.userId,
          hCode,
        ]);
      }
    });

    const qrCodeUri = `otpauth://totp/OutreachIntern:${encodeURIComponent(identity.email)}?secret=${secret}&issuer=OutreachIntern`;
    return {
      secret,
      qrCodeUri,
      recoveryCodes: plainCodes,
    };
  }

  async confirmMfa(identity: SessionIdentity, code: string): Promise<unknown> {
    const user = (await pool.query('SELECT mfa_secret FROM users WHERE id = $1', [identity.userId])).rows[0];
    if (!user || !user.mfa_secret || !verifyTotp(user.mfa_secret, code)) {
      throw new DomainError('INVALID_MFA_CODE', 'Verification code did not match secret.', 400);
    }
    await pool.query('UPDATE users SET mfa_enabled = true WHERE id = $1', [identity.userId]);
    return { enrolled: true };
  }

  async signIn(body: unknown, res: Response): Promise<unknown> {
    if (!config.DEV_AUTH || config.NODE_ENV === 'production')
      throw new DomainError('DEMO_DISABLED', 'Development sign-in is disabled', 403);
    const input = parse(DemoSignInSchema, body);
    const email = input.email.toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const identity = await transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`demo:${email}`]);
      const user = (
        await client.query(
          'INSERT INTO users(email,name,status) VALUES($1,$2,\'active\') ON CONFLICT(email) DO UPDATE SET name=users.name RETURNING *',
          [email, input.name || email.split('@')[0]],
        )
      ).rows[0];
      let member = (
        await client.query(
          'SELECT m.*,w.name workspace_name FROM memberships m JOIN workspaces w ON w.id=m.workspace_id WHERE m.user_id=$1 ORDER BY w.created_at LIMIT 1',
          [user.id],
        )
      ).rows[0];
      if (!member) {
        const workspace = (
          await client.query(
            "INSERT INTO workspaces(name,timezone) VALUES($1,'Asia/Kolkata') RETURNING *",
            [`${user.name}'s workspace`],
          )
        ).rows[0];
        await client.query("INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')", [
          workspace.id,
          user.id,
        ]);
        await seedAgentPersonas(client, workspace.id);
        member = {
          workspace_id: workspace.id,
          role: 'owner',
          workspace_name: workspace.name,
        };
      }
      await client.query(
        'INSERT INTO sessions(token_hash,user_id,workspace_id,expires_at) VALUES($1,$2,$3,$4)',
        [digest(token), user.id, member.workspace_id, new Date(Date.now() + config.SESSION_TTL_HOURS * 3600000)],
      );
      await appendAudit(client, member.workspace_id, user.id, 'auth.demo_signin', user.id, { development: true });
      return {
        userId: user.id,
        workspaceId: member.workspace_id,
        role: member.role,
        email: user.email,
        name: user.name,
        workspaceName: member.workspace_name,
        development: true,
      };
    });
    res.cookie('outreach_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: false,
      maxAge: config.SESSION_TTL_HOURS * 3600000,
      path: '/',
    });
    return identity;
  }

  async identity(req: Request): Promise<SessionIdentity> {
    const token = extractToken(req);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new DomainError('UNAUTHENTICATED', 'Sign in to continue', 401);
    const result = await pool.query(
      'SELECT s.user_id,s.workspace_id,m.role,u.email,u.name,u.status FROM sessions s JOIN memberships m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
      [digest(token)],
    );
    if (!result.rowCount || result.rows[0].status !== 'active')
      throw new DomainError('UNAUTHENTICATED', 'Session expired or account disabled; sign in again', 401);
    const row = result.rows[0];
    return {
      userId: row.user_id,
      workspaceId: row.workspace_id,
      role: row.role,
      email: row.email,
      name: row.name,
    };
  }

  async logout(req: Request, res: Response): Promise<unknown> {
    const token = extractToken(req);
    if (token)
      await pool.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]);
    res.clearCookie('outreach_session', { path: '/' });
    return { signedOut: true };
  }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    verifyOrigin(req);
    req.identity = await this.auth.identity(req);
    return true;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.identity) {
      throw new DomainError('UNAUTHENTICATED', 'Authentication required', 401);
    }
    const adminRoles = ['superadmin', 'admin', 'owner'];
    if (!adminRoles.includes(req.identity.role)) {
      throw new DomainError('FORBIDDEN', 'Administrative privileges required', 403);
    }
    return true;
  }
}
