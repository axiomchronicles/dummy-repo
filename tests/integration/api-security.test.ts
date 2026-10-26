import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { pool } from '@outreach/database';
import {
  AgentSchema,
  AgentVersionSchema,
  IdentitySchema,
  ImportSchema,
  ImportRowSchema,
  ContactSchema,
  CampaignSchema,
  CampaignContactSchema,
  AttemptSchema,
  ReportSchema,
  WorkspaceSchema,
  IntegrationSchema,
  AuditSchema,
  OverviewSchema,
  CampaignEventSchema,
  ErrorSchema,
  ListSchema,
} from '@outreach/contracts';
import { base, Client, type Entity, type Identity, type Page } from './helpers';

type Operation = {
  responses: Record<string, unknown>;
  requestBody?: unknown;
  security?: unknown[];
};
type OpenApi = {
  openapi: string;
  paths: Record<string, Record<string, Operation>>;
};

describe('public API contracts, persona history and access control', () => {
  const client = new Client();
  let identity: Identity;
  let imported: Entity;
  let campaign: Entity;
  let agentId: string;
  let reportId: string;
  beforeAll(async () => {
    expect((await fetch(base + '/health/ready')).status).toBe(200);
    identity = await client.signIn();
    const agents = ListSchema(AgentSchema).parse(await client.json('/agents'));
    agentId = agents.items[0].id;
    imported = await client.imported();
    expect(imported.status).toBe('ready');
    campaign = await client.campaign(imported.id, agentId);
    reportId = randomUUID();
    await pool.query(
      "INSERT INTO reports(id,workspace_id,campaign_id,format,status,request_key,filename,content_type,artifact,row_count,expires_at) VALUES($1,$2,$3,'csv','completed',$4,'access-fixture.csv','text/csv',$5,0,now()+interval '1 hour')",
      [
        reportId,
        identity.workspaceId,
        campaign.id,
        randomUUID(),
        Buffer.from('name,outcome\n'),
      ],
    );
  });
  afterAll(async () => {
    await pool.end();
  });

  it('publishes every actual controller operation, health route and strict command contract', async () => {
    const document = await client.json<OpenApi>('/openapi.json');
    expect(document.openapi).toBe('3.1.0');
    const source = [
      readFileSync(resolve('apps/api/src/controllers.ts'), 'utf8'),
      readFileSync(resolve('apps/api/src/main.ts'), 'utf8'),
    ].join('\n');
    const actual = new Set<string>();
    for (const controller of source.split(/(?=@Controller\()/).slice(1)) {
      const prefix = controller.match(/@Controller\('([^']+)'\)/)?.[1];
      if (!prefix) continue;
      for (const match of controller.matchAll(
        /@(Get|Post|Patch|Delete)\((?:'([^']*)')?\)/g,
      )) {
        const route = ('/' + prefix + (match[2] ? '/' + match[2] : ''))
          .replace(/^\/api\/v1/, '')
          .replace(/:([A-Za-z]+)/g, '{$1}');
        actual.add(match[1].toLowerCase() + ' ' + route);
      }
    }
    const published = new Set(
      Object.entries(document.paths).flatMap(([path, methods]) =>
        Object.keys(methods).map((method) => method + ' ' + path),
      ),
    );
    for (const operation of actual)
      expect(published.has(operation), operation).toBe(true);
    expect(published).toEqual(actual);
    for (const health of ['live', 'ready']) {
      expect(published.has('get /health/' + health)).toBe(true);
      expect((await fetch(base + '/health/' + health)).status).toBe(200);
    }
    for (const action of ['simulate', 'launch']) {
      const operation = document.paths['/campaigns/{id}/' + action].post;
      expect(operation.security).toEqual([{ cookieSession: [] }]);
      expect(operation.requestBody).toMatchObject({
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['confirmed'],
            },
          },
        },
      });
    }
  });

  it('validates every exposed GET read-model family with its shared inferred schema', async () => {
    const rows = ListSchema(ImportRowSchema).parse(
      await client.json('/imports/' + imported.id + '/rows'),
    );
    expect(rows.items).toHaveLength(4);
    const checks: [string, z.ZodType][] = [
      ['/me', IdentitySchema],
      ['/overview', OverviewSchema],
      ['/agents', ListSchema(AgentSchema)],
      ['/agents/' + agentId, AgentSchema],
      ['/agents/' + agentId + '/versions', ListSchema(AgentVersionSchema)],
      ['/imports', ListSchema(ImportSchema)],
      ['/imports/' + imported.id, ImportSchema],
      ['/contacts', ListSchema(ContactSchema)],
      ['/campaigns', ListSchema(CampaignSchema)],
      ['/campaigns/' + campaign.id, CampaignSchema],
      [
        '/campaigns/' + campaign.id + '/contacts',
        ListSchema(CampaignContactSchema),
      ],
      ['/campaigns/' + campaign.id + '/attempts', ListSchema(AttemptSchema)],
      ['/reports', ListSchema(ReportSchema)],
      ['/settings', WorkspaceSchema],
      ['/integrations', IntegrationSchema],
      ['/audit', ListSchema(AuditSchema)],
      ['/events', ListSchema(CampaignEventSchema)],
      [
        '/campaigns/' + campaign.id + '/events',
        ListSchema(CampaignEventSchema),
      ],
    ];
    for (const [path, schema] of checks) {
      const response = await client.response(path);
      expect(response.status, path).toBe(200);
      const body = await response.json();
      expect(schema.safeParse(body).success, path).toBe(true);
      expect(JSON.stringify(body)).not.toMatch(
        /"(?:sourceBytes|providerAttemptId|providerConfig|tokenHash|SARVAM_API_KEY)"\s*:/,
      );
    }
  });

  it('pins campaign personas while edits append immutable versions and new personas persist', async () => {
    const original = AgentSchema.parse(await client.json('/agents/' + agentId));
    const originalVersions = ListSchema(AgentVersionSchema).parse(
      await client.json('/agents/' + agentId + '/versions'),
    );
    const edited = AgentSchema.parse(
      await client.json(
        '/agents/' + agentId,
        {
          name: 'Edited synthetic persona',
          description: 'Integration fixture',
          prompt: 'Ask only synthetic questions.',
          questions: ['May we follow up?'],
          language: 'English',
        },
        undefined,
        'PATCH',
      ),
    );
    expect(edited.currentVersion).toBe(original.currentVersion + 1);
    expect(edited.versionId).not.toBe(original.versionId);
    const versions = ListSchema(AgentVersionSchema).parse(
      await client.json('/agents/' + agentId + '/versions'),
    );
    expect(versions.items).toHaveLength(originalVersions.items.length + 1);
    expect(
      versions.items.find((version) => version.id === original.versionId),
    ).toEqual(
      originalVersions.items.find(
        (version) => version.id === original.versionId,
      ),
    );
    const pinned = CampaignSchema.parse(
      await client.json('/campaigns/' + campaign.id),
    );
    expect(pinned.agentVersionId).toBe(original.versionId);
    const created = AgentSchema.parse(
      await client.json('/agents', {
        name: 'New synthetic persona',
        prompt: 'Use explicitly synthetic conversation data.',
        questions: ['Synthetic feedback?'],
        language: 'English',
      }),
    );
    expect(created.currentVersion).toBe(1);
    expect(created.questions).toEqual(['Synthetic feedback?']);
    expect(
      ListSchema(AgentVersionSchema).parse(
        await client.json('/agents/' + created.id + '/versions'),
      ).items,
    ).toHaveLength(1);
  });

  it('refuses default webhook ingress before body parsing and persists no forged callback', async () => {
    const foreign = new Client();
    const foreignIdentity = await foreign.signIn();
    const foreignImport = await foreign.imported();
    const foreignAgents = await foreign.json<Page<Entity>>('/agents');
    const foreignCampaign = await foreign.campaign(
      foreignImport.id,
      foreignAgents.items[0].id,
    );
    const before = await pool.query<{ workspace_id: string; count: number }>(
      'SELECT workspace_id,count(*)::int count FROM webhook_inbox WHERE workspace_id=ANY($1::uuid[]) GROUP BY workspace_id',
      [[identity.workspaceId, foreignIdentity.workspaceId]],
    );
    for (const localAttemptId of [
      randomUUID(),
      campaign.id,
      foreignCampaign.id,
    ]) {
      const response = await client.response(
        '/webhooks/sarvam/' + randomUUID().replaceAll('-', '') + 'forgedtoken',
        {
          attempt_id: 'forged-' + randomUUID(),
          status: 'connected',
          channel_info: {
            channel_type: 'v2v',
            channel_provider: 'vobiz',
            agent_phone_number: '+12025550100',
          },
          webhook_config: {
            url: 'https://untrusted.invalid/webhook',
            metadata: {
              localAttemptId,
              workspaceId: foreignIdentity.workspaceId,
            },
          },
        },
      );
      expect(response.status).toBe(404);
      expect(ErrorSchema.parse(await response.json()).error.code).toBe(
        'NOT_FOUND',
      );
    }
    const malformed = await client.response(
      '/webhooks/sarvam/unconfigured-route',
      { attempt_id: 'malformed' },
    );
    expect(malformed.status).toBe(404);
    const after = await pool.query<{ workspace_id: string; count: number }>(
      'SELECT workspace_id,count(*)::int count FROM webhook_inbox WHERE workspace_id=ANY($1::uuid[]) GROUP BY workspace_id',
      [[identity.workspaceId, foreignIdentity.workspaceId]],
    );
    expect(after.rows).toEqual(before.rows);
    expect(
      (
        await pool.query(
          'SELECT id FROM call_attempts WHERE workspace_id=ANY($1::uuid[])',
          [[identity.workspaceId, foreignIdentity.workspaceId]],
        )
      ).rows,
    ).toHaveLength(0);
  });

  it('permits viewer inspection while blocking every state mutation and export download', async () => {
    await pool.query(
      "UPDATE memberships SET role='viewer' WHERE workspace_id=$1 AND user_id=$2",
      [identity.workspaceId, identity.userId],
    );
    try {
      expect(IdentitySchema.parse(await client.json('/me')).role).toBe(
        'viewer',
      );
      expect((await client.response('/campaigns/' + campaign.id)).status).toBe(
        200,
      );
      const contactId = (
        await client.json<Page<Entity>>('/imports/' + imported.id + '/rows')
      ).items[0].contactId;
      const mutations: [string, unknown, string?][] = [
        ['/agents', { name: 'Blocked persona', prompt: 'Never create this.' }],
        [
          '/agents/' + agentId,
          { name: 'Blocked edit', prompt: 'Never edit this.' },
          'PATCH',
        ],
        [
          '/imports',
          {
            filename: 'blocked.csv',
            contentBase64: 'QQ==',
            mapping: { phone: 'phone' },
          },
        ],
        ['/imports/' + imported.id + '/validate', { corrections: [] }],
        [
          '/contacts/' + contactId + '/suppress',
          { reason: 'Blocked mutation' },
        ],
        ['/campaigns/' + campaign.id + '/plan', {}],
        ['/campaigns/' + campaign.id + '/simulate', { confirmed: true }],
        ['/campaigns/' + campaign.id + '/launch', { confirmed: true }],
        ['/campaigns/' + campaign.id + '/cancel', {}],
        ['/campaigns/' + campaign.id, {}, 'DELETE'],
        ['/campaigns/' + campaign.id, { name: 'Blocked campaign' }, 'PATCH'],
        ['/campaigns/' + campaign.id + '/reports', { format: 'csv' }],
        ['/settings', { name: 'Blocked workspace' }, 'PATCH'],
      ];
      for (const [path, body, method] of mutations) {
        const response = await client.response(
          path,
          body,
          randomUUID(),
          method,
        );
        expect(response.status, path).toBe(403);
        expect(ErrorSchema.parse(await response.json()).error.code).toBe(
          'FORBIDDEN',
        );
      }
      expect(
        (await client.response('/reports/' + reportId + '/download')).status,
      ).toBe(403);
      expect(
        CampaignSchema.parse(await client.json('/campaigns/' + campaign.id))
          .status,
      ).toBe('draft');
      expect(
        (
          await pool.query(
            'SELECT id FROM call_attempts WHERE workspace_id=$1',
            [identity.workspaceId],
          )
        ).rows,
      ).toHaveLength(0);
    } finally {
      await pool.query(
        "UPDATE memberships SET role='owner' WHERE workspace_id=$1 AND user_id=$2",
        [identity.workspaceId, identity.userId],
      );
    }
    expect(
      (await client.response('/reports/' + reportId + '/download')).status,
    ).toBe(200);
  });

  it('returns structured validation errors for bad IDs, cursors, schemas and keys without side effects', async () => {
    for (const path of [
      '/campaigns/not-a-uuid',
      '/imports/' + imported.id + '/rows?cursor=-1',
      '/contacts?limit=0',
      '/events?after=9223372036854775808',
      '/campaigns?cursor=1000001',
    ]) {
      const response = await client.response(path);
      expect(response.status, path).toBe(400);
      expect(ErrorSchema.safeParse(await response.json()).success).toBe(true);
    }
    for (const [path, body] of [
      [
        '/campaigns',
        {
          name: 'Invalid',
          objective: 'Unknown tenant authorization',
          workspaceId: identity.workspaceId,
        },
      ],
      [
        '/imports',
        {
          filename: 'bad.exe',
          contentBase64: 'QQ==',
          mapping: { phone: 'phone' },
        },
      ],
      [
        '/campaigns/' + campaign.id + '/simulate',
        { confirmed: true, bypassPolicy: true },
      ],
    ] as const) {
      const response = await client.response(path, body, randomUUID());
      expect(response.status).toBe(400);
      expect(ErrorSchema.parse(await response.json()).error.code).toBe(
        'VALIDATION_ERROR',
      );
    }
    const missing = await client.response(
      '/campaigns/' + campaign.id + '/simulate',
      { confirmed: true },
    );
    expect(missing.status).toBe(400);
    expect(ErrorSchema.parse(await missing.json()).error.code).toBe(
      'IDEMPOTENCY_KEY_REQUIRED',
    );
    expect(
      (
        await pool.query('SELECT id FROM call_attempts WHERE workspace_id=$1', [
          identity.workspaceId,
        ])
      ).rows,
    ).toHaveLength(0);
  });

  it('rejects invented correction rows or columns without enqueueing revalidation', async () => {
    const correctable = await client.imported(
      'name,phone,consent,outcome\nCorrectable fixture,+12025550109,true,no_answer',
    );
    const before = (
      await pool.query<{ count: number }>(
        "SELECT count(*)::int count FROM outbox WHERE workspace_id=$1 AND kind='imports' AND payload->>'id'=$2",
        [identity.workspaceId, correctable.id],
      )
    ).rows[0].count;
    for (const correction of [
      { sourceRow: 2, cells: { injected_column: 'unexpected' } },
      { sourceRow: 9999, cells: { phone: '+12025550109' } },
    ]) {
      const response = await client.response(
        '/imports/' + correctable.id + '/validate',
        { corrections: [correction] },
      );
      expect(response.status).toBe(400);
      expect(ErrorSchema.parse(await response.json()).error.code).toBe(
        'INVALID_CORRECTION',
      );
    }
    expect(
      ImportSchema.parse(await client.json('/imports/' + correctable.id))
        .status,
    ).toBe('ready');
    const after = (
      await pool.query<{ count: number }>(
        "SELECT count(*)::int count FROM outbox WHERE workspace_id=$1 AND kind='imports' AND payload->>'id'=$2",
        [identity.workspaceId, correctable.id],
      )
    ).rows[0].count;
    expect(after).toBe(before);
  });

  it('refuses correction after private import source retention expiry', async () => {
    const expired = await client.imported(
      'name,phone,consent,outcome\nExpiry fixture,+12025550108,true,no_answer',
    );
    await pool.query(
      "UPDATE imports SET source_bytes=''::bytea,corrections='{}'::jsonb,failure_code='SOURCE_EXPIRED' WHERE id=$1 AND workspace_id=$2",
      [expired.id, identity.workspaceId],
    );
    const before = (
      await pool.query<{ count: number }>(
        "SELECT count(*)::int count FROM outbox WHERE workspace_id=$1 AND kind='imports' AND payload->>'id'=$2",
        [identity.workspaceId, expired.id],
      )
    ).rows[0].count;
    const response = await client.response(
      '/imports/' + expired.id + '/validate',
      { corrections: [] },
    );
    expect(response.status).toBe(410);
    expect(ErrorSchema.parse(await response.json()).error.code).toBe(
      'IMPORT_SOURCE_EXPIRED',
    );
    const after = (
      await pool.query<{ count: number }>(
        "SELECT count(*)::int count FROM outbox WHERE workspace_id=$1 AND kind='imports' AND payload->>'id'=$2",
        [identity.workspaceId, expired.id],
      )
    ).rows[0].count;
    expect(after).toBe(before);
  });

  it('revokes a real session on logout and refuses replay of its cookie', async () => {
    const disposable = new Client();
    const signed = await disposable.signIn();
    const before = (
      await pool.query<{ count: number }>(
        'SELECT count(*)::int count FROM sessions WHERE workspace_id=$1 AND user_id=$2',
        [signed.workspaceId, signed.userId],
      )
    ).rows[0].count;
    expect(before).toBe(1);
    expect((await disposable.response('/auth/logout', {})).status).toBe(200);
    const denied = await disposable.response('/me');
    expect(denied.status).toBe(401);
    expect(ErrorSchema.parse(await denied.json()).error.code).toBe(
      'UNAUTHENTICATED',
    );
    expect(
      (
        await pool.query<{ count: number }>(
          'SELECT count(*)::int count FROM sessions WHERE workspace_id=$1 AND user_id=$2',
          [signed.workspaceId, signed.userId],
        )
      ).rows[0].count,
    ).toBe(0);
  });
});
