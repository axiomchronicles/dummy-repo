import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Inject,
} from '@nestjs/common';
import { randomBytes, createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  pool,
  transaction,
  appendAudit,
  seedAgentPersonas,
} from '@outreach/database';
import { loadConfig } from '@outreach/config';
import { DemoSignInSchema } from '@outreach/contracts';
import {
  DomainError,
  parse,
  type SessionIdentity,
  type AuthenticatedRequest,
} from './common';

export const config = loadConfig();
function cookie(req: Request): string | undefined {
  return req.headers.cookie
    ?.split(';')
    .map((value) => value.trim())
    .find((value) => value.startsWith('outreach_session='))
    ?.slice('outreach_session='.length);
}
function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
export function verifyOrigin(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const origin = req.get('Origin');
  const allowed = (config.ALLOWED_ORIGINS || config.PUBLIC_BASE_URL)
    .split(',')
    .map((value) => value.trim());
  if (origin && !allowed.includes(origin))
    throw new DomainError(
      'ORIGIN_REJECTED',
      'Request origin is not allowed',
      403,
    );
  if (!origin && req.get('Sec-Fetch-Site') === 'cross-site')
    throw new DomainError(
      'ORIGIN_REJECTED',
      'Cross-site request is not allowed',
      403,
    );
  if (req.get('Content-Type') && !req.is('application/json'))
    throw new DomainError('CONTENT_TYPE_REQUIRED', 'Use application/json', 415);
}
@Injectable()
export class AuthService {
  async signIn(body: unknown, res: Response): Promise<unknown> {
    if (!config.DEV_AUTH || config.NODE_ENV === 'production')
      throw new DomainError(
        'DEMO_DISABLED',
        'Development sign-in is disabled',
        403,
      );
    const input = parse(DemoSignInSchema, body);
    const email = input.email.toLowerCase();
    const token = randomBytes(32).toString('base64url');
    const identity = await transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `demo:${email}`,
      ]);
      const user = (
        await client.query(
          'INSERT INTO users(email,name) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET name=users.name RETURNING *',
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
        await client.query(
          "INSERT INTO memberships(workspace_id,user_id,role) VALUES($1,$2,'owner')",
          [workspace.id, user.id],
        );
        await seedAgentPersonas(client, workspace.id);
        member = {
          workspace_id: workspace.id,
          role: 'owner',
          workspace_name: workspace.name,
        };
      }
      await client.query(
        'INSERT INTO sessions(token_hash,user_id,workspace_id,expires_at) VALUES($1,$2,$3,$4)',
        [
          digest(token),
          user.id,
          member.workspace_id,
          new Date(Date.now() + config.SESSION_TTL_HOURS * 3600000),
        ],
      );
      await appendAudit(
        client,
        member.workspace_id,
        user.id,
        'auth.demo_signin',
        user.id,
        { development: true },
      );
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
    const token = cookie(req);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new DomainError('UNAUTHENTICATED', 'Sign in to continue', 401);
    const result = await pool.query(
      'SELECT s.user_id,s.workspace_id,m.role,u.email,u.name FROM sessions s JOIN memberships m ON m.workspace_id=s.workspace_id AND m.user_id=s.user_id JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now()',
      [digest(token)],
    );
    if (!result.rowCount)
      throw new DomainError(
        'UNAUTHENTICATED',
        'Session expired; sign in again',
        401,
      );
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
    const token = cookie(req);
    if (token)
      await pool.query('DELETE FROM sessions WHERE token_hash=$1', [
        digest(token),
      ]);
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
