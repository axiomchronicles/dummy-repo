import { describe, it, expect } from 'vitest';
import {
  ConfirmLaunchSchema,
  PolicySchema,
  CampaignPlanSchema,
  SarvamWebhookSchema,
  canTransition,
  isWithinCallingWindow,
  sanitizeSpreadsheetCell,
} from './index';

describe('command and lifecycle safety', () => {
  it('requires explicit confirmation and rejects model-supplied authorization fields', () => {
    expect(ConfirmLaunchSchema.safeParse({ confirmed: true }).success).toBe(
      true,
    );
    for (const value of [
      {},
      { confirmed: false },
      { confirmed: true, bypassPolicy: true },
    ])
      expect(ConfirmLaunchSchema.safeParse(value).success).toBe(false);
  });
  it('never permits uncertain/completed attempts to dispatch again', () => {
    for (const from of ['unknown', 'completed', 'failed', 'cancelled'])
      for (const to of ['created', 'dispatching', 'accepted'])
        expect(canTransition('attempt', from, to)).toBe(false);
    expect(canTransition('attempt', 'unknown', 'completed')).toBe(true);
  });
  it('separates campaign controls from contact and analysis state', () => {
    expect(canTransition('campaign', 'running', 'paused')).toBe(true);
    expect(canTransition('campaign', 'completed', 'running')).toBe(false);
    expect(canTransition('contact', 'completed', 'queued')).toBe(false);
    expect(canTransition('analysis', 'failed', 'pending')).toBe(true);
    expect(canTransition('report', 'completed', 'pending')).toBe(false);
  });
  it('evaluates windows in the configured timezone including overnight', () => {
    const policy = PolicySchema.parse({
      timezone: 'Asia/Kolkata',
      windowStart: '22:00',
      windowEnd: '06:00',
    });
    expect(
      isWithinCallingWindow(policy, new Date('2026-10-24T18:00:00Z')),
    ).toBe(true);
    expect(
      isWithinCallingWindow(policy, new Date('2026-10-24T07:00:00Z')),
    ).toBe(false);
    expect(PolicySchema.safeParse({ timezone: 'Unknown/Place' }).success).toBe(
      false,
    );
  });
  it('cannot treat arbitrary natural-language planner output as a validated plan', () => {
    expect(
      CampaignPlanSchema.safeParse({
        objective: 'Call everyone now',
        approved: true,
      }).success,
    ).toBe(false);
  });
});
describe('untrusted spreadsheet and provider values', () => {
  it.each([
    '=1+1',
    '+12025550100',
    '-2+3',
    '@SUM(A1)',
    '\t=cmd',
    '  =cmd',
    '＝cmd',
    '＋cmd',
    '－cmd',
    '＠cmd',
    '\rformula',
  ])(
    'escapes dangerous export prefix %j without changing stored input',
    (value) => {
      expect(sanitizeSpreadsheetCell(value)).toBe(`'${value}`);
    },
  );
  it('preserves ordinary business text and null values', () => {
    expect(sanitizeSpreadsheetCell('Product - starter')).toBe(
      'Product - starter',
    );
    expect(sanitizeSpreadsheetCell(null)).toBe('');
  });
  it('accepts missing optional vendor data without fabricating it, rejects invented status', () => {
    const base = {
      attempt_id: 'attempt-1',
      status: 'no_answer',
      channel_info: {
        channel_type: 'v2v',
        channel_provider: 'vobiz',
        agent_phone_number: '+12025550100',
      },
    };
    expect(
      SarvamWebhookSchema.parse(base).interaction_transcript,
    ).toBeUndefined();
    expect(
      SarvamWebhookSchema.safeParse({ ...base, status: 'successful_sale' })
        .success,
    ).toBe(false);
  });
});
