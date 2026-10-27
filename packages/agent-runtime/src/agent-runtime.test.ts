import { describe, it, expect } from 'vitest';
import { MastraAgentHarness, DeterministicLocalPlanner } from './index';
import { PolicySchema } from '@outreach/contracts';

describe('Mastra Agent Harness Suite', () => {
  it('initializes Mastra instance with specialized agents', () => {
    const harness = new MastraAgentHarness({ provider: 'local' });
    const mastra = harness.getMastra();
    expect(mastra).toBeDefined();
    expect(harness.getPlanner()).toBeDefined();
    expect(harness.getAnalyst()).toBeDefined();
    expect(harness.getSupervisor()).toBeDefined();
  });

  it('runs deterministic local planner with zero keys or network dependency', () => {
    const planner = new DeterministicLocalPlanner();
    const policy = PolicySchema.parse({});
    const plan = planner.planOutreach({
      instruction: 'Call students about Acme Corp interview on Thursday at 2pm. Ask to confirm attendance and bring government ID.',
      mode: 'simulation',
      agentId: '00000000-0000-4000-8000-000000000001',
      agentVersionId: '00000000-0000-4000-8000-000000000002',
      eligibleCount: 45,
      exclusions: [{ reason: 'duplicate', count: 2 }],
      policy,
    });

    expect(plan.planner).toBe('deterministic-local');
    expect(plan.mode).toBe('simulation');
    expect(plan.eligibleCount).toBe(45);
    expect(plan.excludedCount).toBe(2);
    expect(plan.cost.estimatedTotalMinor).toBe(0);
    expect(plan.steps.length).toBeGreaterThanOrEqual(4);
    expect(plan.questions).toContain('Will you be able to attend this scheduled interview?');
    expect(plan.questions).toContain('Can you bring the required government photo ID and resume?');
  });

  it('analyzes transcripts deterministically without hallucination', () => {
    const planner = new DeterministicLocalPlanner();
    const result = planner.analyzeTranscript({
      transcript: [
        { role: 'agent', text: 'Hello, am I speaking with Rahul?' },
        { role: 'user', text: 'Yes, this is Rahul. I will definitely attend the interview.' },
      ],
    });

    expect(result.disposition).toBe('confirmed');
    expect(result.attendanceConfirmed).toBe(true);
    expect(result.followUpRequired).toBe(false);
  });
});
