import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import {
  pool,
  transaction,
  enqueueOutbox,
  appendCampaignEvent,
  appendAudit,
} from '@outreach/database';
import { ReportRequestSchema, SettingsSchema } from '@outreach/contracts';
import { liveReady, liveConfigurationIssues } from '@outreach/config';
import { config } from './auth';
import {
  clean,
  owned,
  parse,
  requireWrite,
  pagination,
  paged,
  offsetCursor,
  DomainError,
  type SessionIdentity,
} from './common';
@Injectable()
export class OperationsService {
  async me(identity: SessionIdentity): Promise<unknown> {
    const workspace = (
      await pool.query('SELECT * FROM workspaces WHERE id=$1', [
        identity.workspaceId,
      ])
    ).rows[0];
    return clean({
      ...identity,
      workspaceName: workspace.name,
      workspace,
      development: config.DEV_AUTH && config.NODE_ENV !== 'production',
    });
  }
  async overview(identity: SessionIdentity): Promise<unknown> {
    const [campaigns, contacts, reports, attempts, activity] =
      await Promise.all([
        pool.query(
          'SELECT mode,status,count(*)::int count FROM campaigns WHERE workspace_id=$1 GROUP BY mode,status',
          [identity.workspaceId],
        ),
        pool.query(
          'SELECT count(*)::int total,count(*) FILTER(WHERE consent)::int consented FROM contacts WHERE workspace_id=$1',
          [identity.workspaceId],
        ),
        pool.query(
          'SELECT status,count(*)::int count FROM reports WHERE workspace_id=$1 GROUP BY status',
          [identity.workspaceId],
        ),
        pool.query(
          'SELECT mode,outcome,count(*)::int count FROM call_attempts WHERE workspace_id=$1 GROUP BY mode,outcome',
          [identity.workspaceId],
        ),
        pool.query(
          'SELECT * FROM campaign_events WHERE workspace_id=$1 ORDER BY id DESC LIMIT 10',
          [identity.workspaceId],
        ),
      ]);
    return clean({
      campaignCount: campaigns.rows.reduce((sum, row) => sum + row.count, 0),
      contactCount: contacts.rows[0].total,
      simulationAttempts: attempts.rows
        .filter((row) => row.mode === 'simulation')
        .reduce((sum, row) => sum + row.count, 0),
      liveAttempts: attempts.rows
        .filter((row) => row.mode === 'live')
        .reduce((sum, row) => sum + row.count, 0),
      campaignCounts: campaigns.rows,
      contacts: contacts.rows[0],
      reportCounts: reports.rows,
      attemptCounts: attempts.rows,
      recentEvents: activity.rows,
    });
  }
  async reports(
    identity: SessionIdentity,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    return paged(
      (
        await pool.query(
          'SELECT r.id,r.campaign_id,c.name campaign_name,r.format,r.status,r.filename,r.content_type,r.row_count,r.failure_code,r.expires_at,r.created_at FROM reports r JOIN campaigns c ON c.id=r.campaign_id AND c.workspace_id=r.workspace_id WHERE r.workspace_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT $2 OFFSET $3',
          [identity.workspaceId, limit + 1, offset],
        )
      ).rows,
      limit,
      offset,
    );
  }
  async requestReport(
    identity: SessionIdentity,
    campaignId: string,
    body: unknown,
    key: string,
  ): Promise<unknown> {
    requireWrite(identity);
    const input = parse(ReportRequestSchema, body);
    return clean(
      await transaction(async (client) => {
        const campaign = await owned(
          client,
          'campaigns',
          campaignId,
          identity.workspaceId,
          true,
        );
        const existing = (
          await client.query(
            'SELECT * FROM reports WHERE workspace_id=$1 AND request_key=$2',
            [identity.workspaceId, key],
          )
        ).rows[0];
        if (existing) {
          if (
            existing.campaign_id !== campaignId ||
            existing.format !== input.format
          )
            throw new DomainError(
              'IDEMPOTENCY_CONFLICT',
              'Report key belongs to another request',
              409,
            );
          return existing;
        }
        const active = (
          await client.query(
            "SELECT count(*)::int count FROM campaign_contacts WHERE campaign_id=$1 AND workspace_id=$2 AND status IN ('pending','queued','calling')",
            [campaignId, identity.workspaceId],
          )
        ).rows[0].count;
        if (active)
          throw new DomainError(
            'REPORT_NOT_READY',
            'Wait until campaign outcomes are terminal before generating a final report',
            409,
          );
        if (!['completed', 'cancelled', 'failed'].includes(campaign.status))
          throw new DomainError(
            'REPORT_NOT_READY',
            'Simulate or launch the campaign before requesting its report',
            409,
          );
        const row = (
          await client.query(
            'INSERT INTO reports(workspace_id,campaign_id,format,request_key,expires_at) VALUES($1,$2,$3,$4,$5) RETURNING *',
            [
              identity.workspaceId,
              campaignId,
              input.format,
              key,
              new Date(Date.now() + config.RETENTION_DAYS * 86400000),
            ],
          )
        ).rows[0];
        await enqueueOutbox(
          client,
          'reports',
          { id: row.id },
          identity.workspaceId,
        );
        await appendCampaignEvent(
          client,
          identity.workspaceId,
          campaignId,
          'report.requested',
          { reportId: row.id, format: input.format, mode: campaign.mode },
        );
        await appendAudit(
          client,
          identity.workspaceId,
          identity.userId,
          'report.requested',
          row.id,
          { campaignId, format: input.format },
        );
        return row;
      }),
    );
  }
  async download(
    identity: SessionIdentity,
    id: string,
    response: Response,
  ): Promise<void> {
    requireWrite(identity);
    const row = await owned(pool, 'reports', id, identity.workspaceId);
    if (new Date(row.expires_at).getTime() < Date.now())
      throw new DomainError(
        'REPORT_EXPIRED',
        'Report expired; generate a new report',
        410,
      );
    if (row.status !== 'completed' || !row.artifact)
      throw new DomainError(
        'REPORT_NOT_READY',
        'Report file is not ready',
        409,
      );
    await transaction((client) =>
      appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        'report.downloaded',
        id,
        { format: row.format },
      ),
    );
    const filename = String(row.filename || `report.${row.format}`).replace(
      /[^A-Za-z0-9._-]/g,
      '_',
    );
    response.setHeader(
      'Content-Type',
      row.content_type ||
        (row.format === 'csv'
          ? 'text/csv'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    );
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.send(row.artifact);
  }
  async events(
    identity: SessionIdentity,
    query: Record<string, unknown>,
    campaignId?: string,
  ): Promise<unknown> {
    if (campaignId)
      await owned(pool, 'campaigns', campaignId, identity.workspaceId);
    const after = query.after === undefined ? '0' : String(query.after);
    if (!/^\d{1,19}$/.test(after) || BigInt(after) > 9223372036854775807n)
      throw new DomainError(
        'INVALID_CURSOR',
        'Event cursor must be an integer string',
      );
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
    const result = await pool.query(
      'SELECT * FROM campaign_events WHERE workspace_id=$1 AND id>$2::bigint AND ($3::uuid IS NULL OR campaign_id=$3) ORDER BY id LIMIT $4',
      [identity.workspaceId, after, campaignId || null, limit],
    );
    return {
      items: clean(result.rows),
      nextCursor: result.rows.length
        ? String(result.rows[result.rows.length - 1].id)
        : after,
    };
  }
  integrations(): unknown {
    return {
      provider: config.VOICE_PROVIDER,
      simulationReady: true,
      liveReady: liveReady(config),
      liveEnabled: config.LIVE_CALLS_ENABLED,
      missingConfiguration: liveConfigurationIssues(config),
      capabilities: { termination: false, recordings: false },
      webhookSecurity:
        'Acknowledged high-entropy HTTPS bearer route; no provider signature documented',
      costNote:
        'Live spend is a configured estimate; provider invoice may differ',
      planner: {
        provider: config.MODEL_PROVIDER,
        configurationReady:
          config.MODEL_PROVIDER === 'local' ||
          Boolean(config.SARVAM_MODEL_API_KEY?.trim()),
        model:
          config.MODEL_PROVIDER === 'sarvam' ? config.SARVAM_MODEL_NAME : null,
        simulationProvider: 'local',
        requiresLiveCampaign: true,
      },
    };
  }
  async settings(identity: SessionIdentity): Promise<unknown> {
    return clean(
      (
        await pool.query(
          'SELECT id,name,timezone,settings FROM workspaces WHERE id=$1',
          [identity.workspaceId],
        )
      ).rows[0],
    );
  }
  async updateSettings(
    identity: SessionIdentity,
    body: unknown,
  ): Promise<unknown> {
    requireWrite(identity);
    const input = parse(SettingsSchema, body);
    await transaction(async (client) => {
      const row = (
        await client.query('SELECT * FROM workspaces WHERE id=$1 FOR UPDATE', [
          identity.workspaceId,
        ])
      ).rows[0];
      await client.query(
        'UPDATE workspaces SET name=$1,timezone=$2,settings=$3 WHERE id=$4',
        [
          input.name || row.name,
          input.timezone || row.timezone,
          JSON.stringify({
            ...row.settings,
            ...(input.defaultRegion !== undefined
              ? { defaultRegion: input.defaultRegion }
              : {}),
          }),
          identity.workspaceId,
        ],
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        'workspace.settings_changed',
        identity.workspaceId,
        { fields: Object.keys(input) },
      );
    });
    return this.settings(identity);
  }
  async audit(
    identity: SessionIdentity,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    return paged(
      (
        await pool.query(
          'SELECT * FROM audit_log WHERE workspace_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3',
          [identity.workspaceId, limit + 1, offset],
        )
      ).rows,
      limit,
      offset,
    );
  }
}
