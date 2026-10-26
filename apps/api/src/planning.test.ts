import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  PolicySchema,
  ModelContentSchema,
  ErrorSchema,
} from '@outreach/contracts';
import { DomainError } from './common';
import {
  assertPlanningSnapshot,
  buildCampaignPlan,
  planningSnapshot,
} from './planning';

function expectDomainFailure(
  operation: () => unknown,
  code: string,
  status: number,
) {
  try {
    operation();
    throw new Error('Expected domain failure');
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    if (!(error instanceof DomainError)) throw error;
    expect(error.getStatus()).toBe(status);
    expect(ErrorSchema.parse(error.getResponse()).error.code).toBe(code);
  }
}
const policy = PolicySchema.parse({
  timezone: 'UTC',
  budgetMinor: 1234,
  concurrency: 1,
  estimatedCostPerCallMinor: 250,
});
const context = {
  mode: 'live' as const,
  objective: 'Discuss only authorized follow-up requests',
  agentId: randomUUID(),
  agentVersionId: randomUUID(),
  eligibleCount: 3,
  exclusions: [{ reason: 'suppressed', count: 2 }],
  policy,
};
const content = {
  steps: [
    {
      name: 'Conversation',
      description:
        'Ask the reviewed questions; never authorize additional calls.',
    },
  ],
  questions: ['May we follow up?'],
  source: 'sarvam',
  model: 'sarvam-105b',
};
describe('model content has no policy or launch authority', () => {
  it('rejects model-supplied authorization, IDs and policy fields', () => {
    expect(
      ModelContentSchema.safeParse({
        steps: content.steps,
        questions: content.questions,
        confirmed: true,
      }).success,
    ).toBe(false);
    for (const extra of [
      { eligibleCount: 1000 },
      { policy: { budgetMinor: 999999 } },
      { agentVersionId: randomUUID() },
      { mode: 'live' },
      { status: 'running' },
    ])
      expect(() =>
        buildCampaignPlan(context, { ...content, ...extra }),
      ).toThrow();
  });
  it('merges only content while recalculating trusted IDs, exclusions and cost', () => {
    const plan = buildCampaignPlan(context, content);
    expect(plan).toMatchObject({
      planner: 'sarvam-sdk',
      model: 'sarvam-105b',
      agentId: context.agentId,
      agentVersionId: context.agentVersionId,
      eligibleCount: 3,
      excludedCount: 2,
      policy,
      cost: { estimatedTotalMinor: 750 },
    });
    expect(plan).not.toHaveProperty('status');
    expect(plan).not.toHaveProperty('confirmed');
    expect(plan.questions).toEqual(content.questions);
  });
  it('forces simulation to local provenance and zero billed usage', () => {
    expectDomainFailure(
      () => buildCampaignPlan({ ...context, mode: 'simulation' }, content),
      'MODEL_PROVENANCE_INVALID',
      503,
    );
    const plan = buildCampaignPlan(
      { ...context, mode: 'simulation' },
      { ...content, source: 'local', model: null },
    );
    expect(plan).toMatchObject({
      planner: 'deterministic-local',
      model: null,
      cost: { estimatedTotalMinor: 0, isEstimate: false },
    });
  });
});
describe('planning snapshot is rechecked after asynchronous model work', () => {
  const row = {
    objective: context.objective,
    mode: 'live' as const,
    agent_version_id: context.agentVersionId,
    import_id: randomUUID(),
    policy,
    status: 'draft',
    updated_at: new Date('2026-10-24T00:00:00Z'),
  };
  it('accepts an unchanged immutable snapshot', () => {
    expect(() =>
      assertPlanningSnapshot(planningSnapshot(row), { ...row }),
    ).not.toThrow();
  });
  it('rejects edits to objective, persona, policy, import, execution mode or status', () => {
    for (const edit of [
      { objective: 'Changed objective' },
      { agent_version_id: randomUUID() },
      { policy: { ...policy, concurrency: 2 } },
      { import_id: randomUUID() },
      { mode: 'simulation' as const },
      { status: 'running' },
      { updated_at: new Date('2026-10-24T00:00:01Z') },
    ])
      expectDomainFailure(
        () =>
          assertPlanningSnapshot(planningSnapshot(row), { ...row, ...edit }),
        'PLAN_STALE',
        409,
      );
  });
});
