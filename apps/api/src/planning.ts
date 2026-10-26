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
  if (context.mode === 'simulation' && content.source !== 'local')
    throw new DomainError(
      'MODEL_PROVENANCE_INVALID',
      'Simulation content must be produced locally',
      503,
    );
  if (content.source === 'sarvam' && !content.model)
    throw new DomainError(
      'MODEL_PROVENANCE_INVALID',
      'Model content requires its actual model provenance',
      503,
    );
  return CampaignPlanSchema.parse({
    version: 1,
    planner: content.source === 'sarvam' ? 'sarvam-sdk' : 'deterministic-local',
    model: content.source === 'sarvam' ? content.model : null,
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
              'Local deterministic mock: no paid provider calls and zero billed usage',
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
