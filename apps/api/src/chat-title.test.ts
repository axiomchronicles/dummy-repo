import { describe, it, expect } from 'vitest';
import { deriveThreadTitle } from './chat';

describe('deriveThreadTitle', () => {
  it('strips a leading vocative, collapses whitespace and keeps ~6 words', () => {
    expect(
      deriveThreadTitle(
        'Sarvam AI,   call Pawan Kumar\n on the supplied number to ask about the interview',
      ),
    ).toBe('Call Pawan Kumar on the supplied');
  });
  it('keeps an instruction that merely ends in a comma', () => {
    expect(deriveThreadTitle('Call Pawan, then summarize')).toBe(
      'Call Pawan, then summarize',
    );
  });
  it('never includes phone numbers', () => {
    const title = deriveThreadTitle('ring +91 98765 43210 now please') ?? '';
    expect(title).toBe('Ring now please');
    expect(deriveThreadTitle('call 9876543210')).toBe('Call');
    expect(deriveThreadTitle('9876543210')).toBeUndefined();
    expect(deriveThreadTitle('book 2 seats for 2026')).toBe(
      'Book 2 seats for 2026',
    );
  });
  it('caps at 48 characters with an ellipsis', () => {
    const title = deriveThreadTitle(
      'internationalization localization accessibility documentation verification',
    )!;
    expect(title.length).toBeLessThanOrEqual(48);
    expect(title.endsWith('…')).toBe(true);
    expect(title.startsWith('Internationalization')).toBe(true);
  });
});
