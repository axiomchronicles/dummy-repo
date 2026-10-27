import { createHash } from 'node:crypto';
import {
  CampaignPlanSchema,
  ModelContentProposalSchema,
  type CampaignPolicy,
  type Mode,
} from '@outreach/contracts';
import { DomainError } from './common';

type PlanningSnapshot = {
  objective: string;
  mode: Mode;
  agent_version_id: string;
  import_id: string;
  policy: Record<string, unknown>;
  status: string;
  updated_at: Date;
};
export function planningSnapshot(row: PlanningSnapshot): string {
  return JSON.stringify({
    objective: row.objective,
    mode: row.mode,
    agentVersionId: row.agent_version_id,
    importId: row.import_id,
    policy: row.policy,
    status: row.status,
    updatedAt: row.updated_at.toISOString(),
  });
}
export function assertPlanningSnapshot(
  snapshot: string,
  row: PlanningSnapshot,
): void {
  if (planningSnapshot(row) !== snapshot)
    throw new DomainError(
      'PLAN_STALE',
      'Campaign changed while content was being prepared; review the latest settings and plan again',
      409,
    );
}
export function buildCampaignPlan(
  context: {
    mode: Mode;
    objective: string;
    agentId: string;
    agentVersionId: string;
    eligibleCount: number;
    exclusions: { reason: string; count: number }[];
    policy: CampaignPolicy;
  },
  untrustedContent: unknown,
) {
  const content = ModelContentProposalSchema.parse(untrustedContent);
  if (context.mode === 'simulation' && content.source === 'sarvam')
    throw new DomainError(
      'MODEL_PROVENANCE_INVALID',
      'Simulation content must be produced locally',
      503,
    );
  if (
    (content.source === 'sarvam' || content.source === 'openai') &&
    !content.model
  )
    throw new DomainError(
      'MODEL_PROVENANCE_INVALID',
      'Model content requires its actual model provenance',
      503,
    );
  const planner =
    content.source === 'openai'
      ? ('openai' as const)
      : content.source === 'sarvam'
        ? ('sarvam-sdk' as const)
        : ('deterministic-local' as const);
  return CampaignPlanSchema.parse({
    version: 1,
    planner,
    model: content.model || null,
    mode: context.mode,
    objective: context.objective,
    agentId: context.agentId,
    agentVersionId: context.agentVersionId,
    eligibleCount: context.eligibleCount,
    excludedCount: context.exclusions.reduce(
      (sum, item) => sum + item.count,
      0,
    ),
    exclusions: context.exclusions,
    questions: content.questions,
    steps: content.steps,
    policy: context.policy,
    cost: {
      currency: 'INR',
      estimatedTotalMinor:
        context.mode === 'simulation'
          ? 0
          : context.eligibleCount * context.policy.estimatedCostPerCallMinor,
      isEstimate: context.mode === 'live',
      assumptions:
        context.mode === 'simulation'
          ? [
              'Plan content generated for outreach execution with zero billed telephony usage',
            ]
          : [
              'Configured per-call reservation estimate; actual duration/telephony/GST can differ',
              'This is not a guaranteed provider invoice cap',
              'Live calls use the server-configured committed Sarvam app/version; local persona prompt edits require deploying matching Sarvam configuration',
            ],
    },
    createdAt: new Date().toISOString(),
  });
}

/** PostgreSQL jsonb does not preserve object insertion order. */
export function planSnapshotHash(plan: unknown): string {
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, canonical(item)]),
      );
    return value;
  }
  return createHash('sha256')
    .update(JSON.stringify(canonical(plan)))
    .digest('hex');
}

/** Stored plans from removed code paths must not break reads: they surface as planIssue with plan null. */
export function readablePlan(plan: unknown): {
  plan: unknown;
  planIssue?: 'LEGACY_PLAN_INVALID';
} {
  if (plan == null) return { plan: null };
  return CampaignPlanSchema.safeParse(plan).success
    ? { plan }
    : { plan: null, planIssue: 'LEGACY_PLAN_INVALID' };
}
export function launchablePlan(plan: unknown) {
  const parsed = CampaignPlanSchema.safeParse(plan);
  if (!parsed.success)
    throw new DomainError(
      'PLAN_INVALID',
      'Re-plan this campaign before launching',
      409,
    );
  return parsed.data;
}
