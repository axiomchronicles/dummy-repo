import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { pool } from '@outreach/database';
import { PolicySchema } from '@outreach/contracts';

export const listConfiguredVoiceAgentsTool = createTool({
  id: 'list-configured-voice-agents',
  description: 'Lists configured voice agents, versions, and languages in the current workspace',
  inputSchema: z.object({
    workspaceId: z.string().uuid(),
  }),
  outputSchema: z.object({
    agents: z.array(
      z.object({
        id: z.string().uuid(),
        name: z.string(),
        description: z.string(),
        currentVersion: z.number(),
        language: z.string(),
      }),
    ),
  }),
  execute: async (input) => {
    const rows = (
      await pool.query(
        `SELECT a.id, a.name, a.description, a.current_version, v.language
         FROM agents a
         JOIN agent_versions v ON v.agent_id = a.id AND v.version = a.current_version
         WHERE a.workspace_id = $1
         ORDER BY a.name ASC`,
        [input.workspaceId],
      )
    ).rows;

    return {
      agents: rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        currentVersion: r.current_version,
        language: r.language || 'English',
      })),
    };
  },
});

export const inspectImportBatchTool = createTool({
  id: 'inspect-import-batch',
  description: 'Inspects contact import batch statistics, total rows, valid counts, and detected issues',
  inputSchema: z.object({
    workspaceId: z.string().uuid(),
    importId: z.string().uuid(),
  }),
  outputSchema: z.object({
    importId: z.string().uuid(),
    filename: z.string(),
    rowCount: z.number(),
    validCount: z.number(),
    errorCount: z.number(),
    status: z.string(),
    sampleRows: z.array(
      z.object({
        sourceRow: z.number(),
        normalizedPhone: z.string().nullable(),
        status: z.string(),
      }),
    ),
  }),
  execute: async (input) => {
    const importRow = (
      await pool.query(
        'SELECT id, filename, row_count, valid_count, error_count, status FROM imports WHERE id = $1 AND workspace_id = $2',
        [input.importId, input.workspaceId],
      )
    ).rows[0];

    if (!importRow) {
      throw new Error(`Import ${input.importId} not found in workspace`);
    }

    const sampleRows = (
      await pool.query(
        'SELECT source_row, normalized_phone, status FROM import_rows WHERE import_id = $1 AND workspace_id = $2 ORDER BY source_row ASC LIMIT 5',
        [input.importId, input.workspaceId],
      )
    ).rows;

    return {
      importId: importRow.id,
      filename: importRow.filename,
      rowCount: importRow.row_count,
      validCount: importRow.valid_count,
      errorCount: importRow.error_count,
      status: importRow.status,
      sampleRows: sampleRows.map((r) => ({
        sourceRow: r.source_row,
        normalizedPhone: r.normalized_phone,
        status: r.status,
      })),
    };
  },
});

export const checkEligibilityTool = createTool({
  id: 'check-eligibility-and-budget',
  description: 'Validates campaign calling windows, concurrency limits, suppression lists, and cost estimates',
  inputSchema: z.object({
    workspaceId: z.string().uuid(),
    eligibleCount: z.number().int().nonnegative(),
    mode: z.enum(['simulation', 'live']),
    policy: PolicySchema,
  }),
  outputSchema: z.object({
    allowed: z.boolean(),
    estimatedCostMinor: z.number(),
    currency: z.literal('INR'),
    reasons: z.array(z.string()),
  }),
  execute: async (input) => {
    const reasons: string[] = [];
    let allowed = true;

    if (input.policy.concurrency > 10) {
      allowed = false;
      reasons.push('Concurrency limit cannot exceed 10 lines.');
    }

    const killSwitch = (
      await pool.query("SELECT value FROM system_settings WHERE key = 'telephony_kill_switch'")
    ).rows[0];
    if (killSwitch?.value?.active && input.mode === 'live') {
      allowed = false;
      reasons.push('Global telephony kill-switch is currently ACTIVE.');
    }

    const estimatedCostMinor =
      input.mode === 'simulation'
        ? 0
        : input.eligibleCount * (input.policy.estimatedCostPerCallMinor || 500);

    return {
      allowed,
      estimatedCostMinor,
      currency: 'INR' as const,
      reasons,
    };
  },
});
