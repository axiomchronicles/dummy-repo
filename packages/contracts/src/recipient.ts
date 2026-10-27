import {
  parsePhoneNumberFromString,
  isSupportedCountry,
  type CountryCode,
} from 'libphonenumber-js/max';
export function normalizeDestination(
  value: string,
  region?: string,
): string | null {
  const country =
    region && isSupportedCountry(region) ? (region as CountryCode) : undefined;
  if (!value.trim().startsWith('+') && !country) return null;
  const phone = parsePhoneNumberFromString(value, country);
  return phone?.isValid() ? phone.number : null;
}
export function maskDestination(value: string): string {
  return value.replace(/.(?=.{4})/g, '•');
}
export type RecipientFacts = {
  consent: boolean;
  synthetic: boolean;
  suppressed: boolean;
  evidenceGranted: boolean | null;
  evidenceSource: string | null;
  evidenceScope: string | null;
};
export function recipientBlockers(
  facts: RecipientFacts,
  mode: 'live' | 'simulation',
): string[] {
  const blockers: string[] = [];
  if (facts.suppressed) blockers.push('suppressed');
  if (!facts.consent || facts.evidenceGranted === false)
    blockers.push('consent_missing_or_revoked');
  if (mode === 'live') {
    if (facts.synthetic) blockers.push('synthetic_destination');
    if (!facts.evidenceGranted || !facts.evidenceSource)
      blockers.push('consent_evidence_missing');
    if (!['outreach', 'interview'].includes(facts.evidenceScope ?? ''))
      blockers.push('consent_scope_unverified');
  }
  return blockers;
}
