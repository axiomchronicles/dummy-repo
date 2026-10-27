import { describe, it, expect } from 'vitest';
import {
  callState,
  hadConversation,
  extractEventDate,
  ToolErrorCategorySchema,
} from './index';
describe('attempt state vs connected interaction', () => {
  it('maps every persisted attempt to a distinct operator state', () => {
    const cases: [string, string | null, string][] = [
      ['created', null, 'queued'],
      ['dispatching', null, 'dialing'],
      ['accepted', null, 'ringing'],
      ['connected', null, 'connected'],
      ['completed', 'connected', 'completed'],
      ['completed', 'no_answer', 'no_answer'],
      ['completed', 'busy', 'busy'],
      ['failed', 'failed', 'failed'],
      ['cancelled', null, 'cancelled'],
      ['unknown', null, 'unknown'],
    ];
    for (const [status, outcome, state] of cases)
      expect(callState({ status, outcome })).toBe(state);
    expect(callState(null)).toBe('queued');
  });
  it('only a connected interaction may carry conversation content', () => {
    for (const state of [
      'ringing',
      'no_answer',
      'busy',
      'failed',
      'queued',
    ] as const)
      expect(hadConversation(state)).toBe(false);
    expect(hadConversation('completed')).toBe(true);
    expect(hadConversation('connected')).toBe(true);
  });
});
describe('event date extraction', () => {
  it('extracts explicit dates in common forms and rejects impossible ones', () => {
    expect(extractEventDate('CyberCube interview 27 October 2026')).toBe(
      '2026-10-27',
    );
    expect(extractEventDate('on October 27th, 2026')).toBe('2026-10-27');
    expect(extractEventDate('on 2026-10-27')).toBe('2026-10-27');
    expect(extractEventDate('31 February 2026')).toBeNull();
    expect(extractEventDate('tomorrow')).toBeNull();
  });
  it('lists every brief error category', () => {
    expect(ToolErrorCategorySchema.options).toHaveLength(9);
  });
});
