import { describe, it, expect } from 'vitest';
import { normalizeDestination, recipientBlockers } from './recipient';
describe('recipient domain gates', () => {
  it('does not infer a country without context or accept invalid E.164-looking numbers', () => {
    expect(normalizeDestination('2025550101')).toBeNull();
    expect(normalizeDestination('2025550101', 'US')).toBe('+12025550101');
    expect(normalizeDestination('+19999999999')).toBeNull();
    expect(normalizeDestination('abc', 'IN')).toBeNull();
  });
  it('requires target evidence, scope and no suppression for live', () => {
    const contact = {
      consent: true,
      synthetic: false,
      suppressed: false,
      evidenceGranted: true,
      evidenceSource: 'signed form',
      evidenceScope: 'interview',
    };
    expect(recipientBlockers(contact, 'live')).toEqual([]);
    expect(
      recipientBlockers(
        {
          ...contact,
          evidenceGranted: null,
          evidenceSource: null,
          evidenceScope: null,
        },
        'live',
      ),
    ).toContain('consent_evidence_missing');
    expect(recipientBlockers({ ...contact, consent: false }, 'live')).toContain(
      'consent_missing_or_revoked',
    );
    expect(
      recipientBlockers({ ...contact, suppressed: true }, 'simulation'),
    ).toContain('suppressed');
    expect(
      recipientBlockers({ ...contact, synthetic: true }, 'live'),
    ).toContain('synthetic_destination');
  });
});
