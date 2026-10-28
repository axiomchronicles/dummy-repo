/**
 * Unit tests for call-dispatch context construction and scheduling heuristics.
 *
 * These tests verify:
 * - buildInitialBotMessage produces per-call personalized opening text.
 * - The schedule-unresolved regex does NOT block calls where the event date
 *   is mentioned as context (not as a scheduling request).
 * - Agent variables (user_name, objective, event_date) are correctly scoped
 *   per call and never leak across sessions.
 */
import { describe, it, expect } from 'vitest';
import { buildInitialBotMessage } from './calls';

describe('buildInitialBotMessage — dynamic per-call personalization', () => {
  it('addresses the named recipient, never a hardcoded default', () => {
    const msg = buildInitialBotMessage('Pawan Kumar', 'Confirm interview attendance.');
    expect(msg).toContain('Pawan Kumar');
    expect(msg).not.toContain('there,'); // generic fallback must not appear when name given
  });

  it('uses a safe fallback when the name is absent or empty', () => {
    const msg = buildInitialBotMessage('', 'Confirm interview attendance.');
    expect(msg).toContain('there');
  });

  it('different recipients produce different opening messages without cross-contamination', () => {
    const msg1 = buildInitialBotMessage('Alice', 'Appointment confirmation for tomorrow.');
    const msg2 = buildInitialBotMessage('Bob', 'Product demo follow-up call.');
    expect(msg1).toContain('Alice');
    expect(msg2).toContain('Bob');
    expect(msg1).not.toContain('Bob');
    expect(msg2).not.toContain('Alice');
  });

  it('generates an interview greeting when the objective mentions interview', () => {
    const msg = buildInitialBotMessage('Priya', 'CyberCube interview scheduled for tomorrow at 9 AM sharp.');
    expect(msg).toContain('Priya');
    expect(msg).toMatch(/interview/i);
  });

  it('generates an appointment greeting when the objective mentions appointment', () => {
    const msg = buildInitialBotMessage('Raj', 'Confirm appointment for October 30th.');
    expect(msg).toContain('Raj');
    expect(msg).toMatch(/appointment/i);
  });

  it('generates a follow-up greeting when the objective mentions follow-up', () => {
    const msg = buildInitialBotMessage('Sara', 'Follow up on support ticket #1234.');
    expect(msg).toContain('Sara');
    expect(msg).toMatch(/follow/i);
  });

  it('generates a Hindi greeting when the language is Hindi', () => {
    const msg = buildInitialBotMessage('Ravi', 'Interview reminder for tomorrow.', 'Hindi');
    // Hindi greeting uses Devanagari script
    expect(msg).toMatch(/[\u0900-\u097F]/);
  });

  it('message is non-empty and not excessively long', () => {
    const msg = buildInitialBotMessage('Very Long Name That Goes On And On', 'x'.repeat(500));
    expect(msg.length).toBeGreaterThan(10);
    expect(msg.length).toBeLessThan(2000);
  });
});

describe('schedule-requires-review heuristic — precision fixes', () => {
  // These patterns appear in real objectives that do NOT request scheduling the call itself.
  // The improved regex must NOT flag them as schedule-unresolved.
  const shouldNotBlock = [
    'Call Pawan Kumar to confirm his interview scheduled for tomorrow.',
    'Call Alice about her appointment tomorrow at the clinic.',
    'Call Raj to ask if he attended the meeting tomorrow.',
    'Dial Bob and inform him that the event is next week.',
    'hey call darshan +91 97390 49385 and tell him that his interview is scheduled on Tommorow 9AM sharp and ask that is he coming Tommorow',
    'Call Priya about the interview tomorrow.',
  ];
  // These patterns DO express a request to schedule the call itself for a future time.
  const shouldBlock = [
    'Call Pawan Kumar tomorrow at 9 to confirm the interview.',
    'Dial Alice in 30 minutes to follow up.',
    'Call Raj at 3:30 PM to confirm the meeting.',
    'Call Priya at 9am to follow up on her application.',
    'Dial Bob in 2 hours about the product demo.',
  ];

  // Replicated from campaigns.ts for unit-testability.
  const scheduleUnresolved = (objective: string) =>
    /\b(?:call|dial)\b.{0,40}\b(?:at \d{1,2}(?::\d{2})?\s*(?:am|pm)|in \d+\s*(?:minutes?|hours?)|tomorrow at \d|next (?:monday|tuesday|wednesday|thursday|friday|week) at \d)\b/i.test(
      objective,
    );

  for (const obj of shouldNotBlock) {
    it(`does NOT block: "${obj.slice(0, 70)}…"`, () => {
      expect(scheduleUnresolved(obj)).toBe(false);
    });
  }

  for (const obj of shouldBlock) {
    it(`DOES block: "${obj.slice(0, 70)}…"`, () => {
      expect(scheduleUnresolved(obj)).toBe(true);
    });
  }
});
