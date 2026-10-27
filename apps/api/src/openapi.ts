import { z } from 'zod';
import * as c from '@outreach/contracts';
type Route = {
  method: string;
  path: string;
  summary: string;
  input?: z.ZodType;
  output: z.ZodType;
  status?: number;
  public?: boolean;
  idempotent?: boolean;
  binary?: boolean;
  stream?: boolean;
};
const list = c.ListSchema;
const events = z.object({
  items: z.array(c.CampaignEventSchema),
  nextCursor: z.string(),
});
export const routes: Route[] = [
  {
    method: 'post',
    path: '/auth/demo',
    summary: 'Development-only isolated demo sign-in',
    input: c.DemoSignInSchema,
    output: c.IdentitySchema,
    public: true,
  },
  {
    method: 'post',
    path: '/auth/login',
    summary: 'Authenticate with email/password or Google',
    input: c.LoginRequestSchema,
    output: c.MfaChallengeResponseSchema,
    public: true,
  },
  {
    method: 'post',
    path: '/auth/mfa/verify',
    summary: 'Verify TOTP MFA challenge',
    input: c.MfaVerifyRequestSchema,
    output: c.AuthSessionSchema,
    public: true,
  },
  {
    method: 'post',
    path: '/auth/mfa/enroll',
    summary: 'Enroll TOTP MFA secret',
    output: c.MfaEnrollResponseSchema,
  },
  {
    method: 'post',
    path: '/auth/mfa/confirm',
    summary: 'Confirm TOTP MFA enrollment with first code',
    input: z.object({ code: z.string().min(6).max(8) }),
    output: z.object({ confirmed: z.boolean(), recoveryCodes: z.array(z.string()) }),
  },
  {
    method: 'get',
    path: '/auth/me',
    summary: 'Current session user identity',
    output: z.object({
      user: z.object({
        id: c.IdSchema,
        email: z.string(),
        name: z.string(),
        role: z.string(),
        workspaceId: c.IdSchema,
      }),
      identity: z.unknown().optional(),
    }),
  },
  {
    method: 'post',
    path: '/auth/logout',
    summary: 'Revoke cookie session',
    output: z.object({ signedOut: z.boolean() }),
    public: true,
  },
  {
    method: 'get',
    path: '/me',
    summary: 'Current authorized identity and workspace',
    output: c.IdentitySchema,
  },
  {
    method: 'get',
    path: '/overview',
    summary: 'Database aggregates separated by execution mode',
    output: c.OverviewSchema,
  },
  {
    method: 'get',
    path: '/agents',
    summary: 'List editable personas',
    output: list(c.AgentSchema),
  },
  {
    method: 'post',
    path: '/agents',
    summary: 'Create persona with immutable version',
    input: c.AgentInputSchema,
    output: c.AgentSchema,
    status: 201,
  },
  {
    method: 'get',
    path: '/agents/{id}',
    summary: 'Read persona',
    output: c.AgentSchema,
  },
  {
    method: 'patch',
    path: '/agents/{id}',
    summary: 'Create updated immutable persona version',
    input: c.AgentInputSchema,
    output: c.AgentSchema,
  },
  {
    method: 'get',
    path: '/agents/{id}/versions',
    summary: 'Read persona version history',
    output: list(c.AgentVersionSchema),
  },
  {
    method: 'post',
    path: '/agents/{id}/sandbox',
    summary: 'Network-free synthetic provider sandbox',
    output: z.object({
      mode: z.literal('simulation'),
      kind: z.literal('terminal'),
      event: c.NormalizedCallEventSchema,
    }),
  },
  {
    method: 'get',
    path: '/imports',
    summary: 'List persisted imports',
    output: list(c.ImportSchema),
  },
  {
    method: 'post',
    path: '/imports',
    summary: 'Upload bounded base64 CSV/XLSX for asynchronous validation',
    input: c.ImportInputSchema,
    output: c.ImportSchema,
    status: 202,
  },
  {
    method: 'get',
    path: '/imports/{id}',
    summary: 'Read import job summary',
    output: c.ImportSchema,
  },
  {
    method: 'get',
    path: '/imports/{id}/rows',
    summary: 'Read ordered validation rows',
    output: list(c.ImportRowSchema),
  },
  {
    method: 'post',
    path: '/imports/{id}/validate',
    summary: 'Revalidate explicit mapping and source row corrections',
    input: c.ImportCorrectionSchema,
    output: c.ImportSchema,
    status: 202,
  },
  {
    method: 'get',
    path: '/contacts',
    summary: 'List contacts and durable suppression',
    output: list(c.ContactSchema),
  },
  {
    method: 'post',
    path: '/contacts/{id}/suppress',
    summary: 'Persist opt-out independently of imports',
    input: c.SuppressionSchema,
    output: z.object({ id: c.IdSchema, suppressed: z.literal(true) }),
  },
  {
    method: 'get',
    path: '/campaigns',
    summary: 'List campaigns with real persisted progress',
    output: list(c.CampaignSchema),
  },
  {
    method: 'post',
    path: '/campaigns',
    summary: 'Save campaign draft without telephony',
    input: c.CampaignInputSchema,
    output: c.CampaignSchema,
    status: 201,
  },
  {
    method: 'get',
    path: '/campaigns/{id}',
    summary: 'Read campaign, plan, policy and progress',
    output: c.CampaignSchema,
  },
  {
    method: 'patch',
    path: '/campaigns/{id}',
    summary: 'Edit unlaunched campaign and invalidate plan',
    input: c.CampaignPatchSchema,
    output: c.CampaignSchema,
  },
  {
    method: 'delete',
    path: '/campaigns/{id}',
    summary: 'Cancel eligible campaign without deleting audit history',
    output: c.CampaignSchema,
  },
  {
    method: 'post',
    path: '/campaigns/{id}/plan',
    summary:
      'Validated content plan; simulation is local, optional live SDK proposes content only',
    output: c.CampaignSchema,
  },
  ...['simulate', 'launch'].map((action) => ({
    method: 'post',
    path: `/campaigns/{id}/${action}`,
    summary:
      action === 'simulate'
        ? 'Explicitly confirmed free simulation'
        : 'Explicitly confirmed guarded live launch',
    input: c.ConfirmLaunchSchema,
    output: c.CampaignSchema,
    idempotent: true,
  })),
  ...['pause', 'resume', 'cancel'].map((action) => ({
    method: 'post',
    path: `/campaigns/{id}/${action}`,
    summary: `${action} pending dispatch; active calls may finish`,
    output: c.CampaignSchema,
  })),
  {
    method: 'get',
    path: '/campaigns/{id}/contacts',
    summary: 'Read campaign contact outcomes and attempts',
    output: list(c.CampaignContactSchema),
  },
  {
    method: 'get',
    path: '/campaigns/{id}/attempts',
    summary: 'Read provider-neutral persisted attempts',
    output: list(c.AttemptSchema),
  },
  {
    method: 'get',
    path: '/calls',
    summary: 'List recent call attempts across workspace',
    output: list(c.AttemptSchema),
  },
  {
    method: 'get',
    path: '/calls/{id}',
    summary: 'Authorized call inspector and analysis/transcript',
    output: c.AttemptSchema,
  },
  {
    method: 'get',
    path: '/campaigns/{id}/events',
    summary: 'Replay persisted events after string cursor',
    output: events,
  },
  {
    method: 'get',
    path: '/campaigns/{id}/stream',
    summary: 'SSE persisted events with Last-Event-ID replay',
    output: c.CampaignEventSchema,
    stream: true,
  },
  {
    method: 'get',
    path: '/events',
    summary: 'Workspace event replay after cursor',
    output: events,
  },
  {
    method: 'get',
    path: '/reports',
    summary: 'List asynchronous report jobs',
    output: list(c.ReportSchema),
  },
  {
    method: 'post',
    path: '/campaigns/{id}/reports',
    summary: 'Request CSV/XLSX export of terminal campaign outcomes',
    input: c.ReportRequestSchema,
    output: c.ReportSchema,
    status: 202,
    idempotent: true,
  },
  {
    method: 'get',
    path: '/reports/{id}/download',
    summary: 'Download private authorized unexpired artifact',
    output: z.string(),
    binary: true,
  },
  {
    method: 'get',
    path: '/integrations',
    summary: 'Sanitized provider readiness and limitations',
    output: c.IntegrationSchema,
  },
  {
    method: 'get',
    path: '/settings',
    summary: 'Read workspace settings',
    output: c.WorkspaceSchema,
  },
  {
    method: 'patch',
    path: '/settings',
    summary: 'Update workspace settings with audit',
    input: c.SettingsSchema,
    output: c.WorkspaceSchema,
  },
  {
    method: 'get',
    path: '/audit',
    summary: 'Read ordered audit records',
    output: list(c.AuditSchema),
  },
  {
    method: 'get',
    path: '/chat/threads',
    summary: 'List user chat threads',
    output: list(c.ChatThreadSchema),
  },
  {
    method: 'post',
    path: '/chat/threads',
    summary: 'Create user chat thread',
    input: z.object({ title: z.string().optional() }),
    output: c.ChatThreadSchema,
  },
  {
    method: 'get',
    path: '/chat/threads/{id}/messages',
    summary: 'Get thread messages',
    output: z.array(c.ChatMessageSchema),
  },
  {
    method: 'post',
    path: '/chat/threads/{id}/messages',
    summary: 'Post message to chat thread and invoke agent harness',
    input: c.SendMessageRequestSchema,
    output: z.object({
      thread: c.ChatThreadSchema.optional(),
      userMessage: c.ChatMessageSchema,
      assistantMessage: c.ChatMessageSchema.optional(),
      draft: z.any().optional(),
      campaignDraft: z.any().optional(),
    }),
  },
  {
    method: 'post',
    path: '/chat/threads/{id}/stream',
    summary: 'Stream conversational SSE response token-by-token from real LLM',
    input: c.SendMessageRequestSchema,
    output: z.any(),
    stream: true,
  },
  {
    method: 'get',
    path: '/admin/overview',
    summary: 'Operator system overview, health, and kill-switch status',
    output: z.object({
      killSwitch: z.object({ active: z.boolean(), reason: z.string().optional() }),
      userCount: z.number(),
      attemptCount: z.number(),
      campaignCount: z.number(),
      mode: z.string(),
    }),
  },
  {
    method: 'get',
    path: '/admin/users',
    summary: 'List provisioned operators and users',
    output: list(c.AdminUserSchema),
  },
  {
    method: 'post',
    path: '/admin/users/invite',
    summary: 'Invite new operator or administrator',
    input: c.UserInviteRequestSchema,
    output: z.object({
      user: c.AdminUserSchema,
      invitation: z.object({ token: z.string(), expiresAt: z.string() }),
    }),
  },
  {
    method: 'post',
    path: '/admin/users/{id}/reset-mfa',
    summary: 'Admin-initiated MFA reset with mandatory reason',
    input: z.object({ reason: z.string().optional() }),
    output: z.object({ reset: z.boolean(), userId: z.string() }),
  },
  {
    method: 'post',
    path: '/admin/users/{id}/revoke-sessions',
    summary: 'Admin session revocation immediately invalidating user tokens',
    output: z.object({ revoked: z.boolean(), userId: z.string() }),
  },
  {
    method: 'patch',
    path: '/admin/users/{id}/status',
    summary: 'Update user account status (active, disabled, locked)',
    input: z.object({ status: c.UserStatusSchema }),
    output: z.object({ updated: z.boolean(), status: c.UserStatusSchema }),
  },
  {
    method: 'post',
    path: '/admin/kill-switch',
    summary: 'Engage or disarm emergency telephony kill-switch',
    input: c.KillSwitchRequestSchema,
    output: z.object({ updated: z.boolean(), active: z.boolean(), reason: z.string().optional() }),
  },
  {
    method: 'post',
    path: '/webhooks/sarvam/{token}',
    summary:
      'Validated bearer-route terminal callback persisted in durable inbox',
    input: c.SarvamWebhookSchema,
    output: z.object({ accepted: z.literal(true), duplicate: z.boolean() }),
    public: true,
  },
];
function schema(value: z.ZodType, input = false): unknown {
  return z.toJSONSchema(value, {
    target: 'draft-2020-12',
    io: input ? 'input' : 'output',
  });
}
export function openApiDocument(): unknown {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of routes) {
    const parameters: unknown[] = [];
    if (route.path.includes('{id}'))
      parameters.push({
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'string', format: 'uuid' },
      });
    if (route.path.includes('{token}'))
      parameters.push({
        name: 'token',
        in: 'path',
        required: true,
        schema: { type: 'string', minLength: 43 },
        description: 'Secret bearer route, excluded from general access logs',
      });
    if (route.idempotent)
      parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: {
          type: 'string',
          minLength: 8,
          maxLength: 128,
          pattern: '^[A-Za-z0-9_-]+$',
        },
      });
    if (route.method === 'get' && route.summary.match(/List|ordered/))
      parameters.push(
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
        },
        {
          name: 'cursor',
          in: 'query',
          schema: { type: 'string', pattern: '^\\d+$' },
        },
      );
    if (
      route.path.endsWith('/events') ||
      route.path === '/events' ||
      route.stream
    )
      parameters.push({
        name: 'after',
        in: 'query',
        schema: { type: 'string', pattern: '^\\d+$', default: '0' },
      });
    if (route.stream)
      parameters.push({
        name: 'Last-Event-ID',
        in: 'header',
        schema: { type: 'string', pattern: '^\\d+$' },
      });
    const success = route.binary
      ? {
          description: 'Private artifact',
          content: {
            'text/csv': { schema: { type: 'string', format: 'binary' } },
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
              { schema: { type: 'string', format: 'binary' } },
          },
        }
      : {
          description: route.stream
            ? 'SSE id/data frames with heartbeat comments'
            : 'Success',
          content: {
            [route.stream ? 'text/event-stream' : 'application/json']: {
              schema: schema(route.output),
            },
          },
        };
    const operation = {
      summary: route.summary,
      operationId: `${route.method}_${route.path.replace(/[^A-Za-z0-9]/g, '_')}`,
      security: route.public ? [] : [{ cookieSession: [] }],
      parameters,
      ...(route.input
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: schema(route.input, true) },
              },
            },
          }
        : {}),
      responses: {
        [String(route.status || 200)]: success,
        ...Object.fromEntries(
          [400, 401, 403, 404, 409, 410, 415, 429, 500].map((status) => [
            String(status),
            {
              description: 'Safe structured error',
              content: {
                'application/json': { schema: schema(c.ErrorSchema) },
              },
            },
          ]),
        ),
      },
    };
    (paths[route.path] ||= {})[route.method] = operation;
  }
  paths['/openapi.json'] = {
    get: {
      summary: 'Read this generated OpenAPI document',
      responses: { '200': { description: 'OpenAPI 3.1 document' } },
    },
  };
  for (const health of ['live', 'ready'])
    paths[`/health/${health}`] = {
      get: {
        summary:
          health === 'live'
            ? 'Process liveness'
            : 'Actual PostgreSQL schema and Redis readiness',
        servers: [{ url: '/' }],
        security: [],
        responses: {
          '200': {
            description: 'Healthy',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    status: { type: 'string' },
                    database: { type: 'boolean' },
                    redis: { type: 'boolean' },
                  },
                  required: ['status'],
                },
              },
            },
          },
          ...(health === 'ready'
            ? {
                '503': {
                  description: 'Dependencies unavailable',
                  content: {
                    'application/json': { schema: schema(c.ErrorSchema) },
                  },
                },
              }
            : {}),
        },
      },
    };
  return {
    openapi: '3.1.0',
    info: {
      title: 'Outreach Intern API',
      version: '0.1.0',
      description:
        'Mock-first tenant campaign operations. Deterministic plans and development identity are explicit. Live launch requires complete server prerequisites.',
    },
    servers: [{ url: '/api/v1' }],
    paths,
    components: {
      securitySchemes: {
        cookieSession: {
          type: 'apiKey',
          in: 'cookie',
          name: 'outreach_session',
        },
      },
    },
  };
}
