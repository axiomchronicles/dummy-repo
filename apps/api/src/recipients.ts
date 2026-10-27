import { parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { pool } from '@outreach/database';
import {
  normalizeDestination,
  maskDestination,
  type Mode,
} from '@outreach/contracts';
import { DomainError } from './common';
export {
  contactFacts,
  eligibility,
  type ResolvedContact,
} from '@outreach/database';
import {
  contactFacts,
  eligibility,
  type ResolvedContact,
} from '@outreach/database';
export async function resolveContact(
  workspaceId: string,
  query: { name?: string; phone?: string; contactId?: string },
) {
  const workspace = (
    await pool.query<{ settings: { defaultRegion?: string } }>(
      'SELECT settings FROM workspaces WHERE id=$1',
      [workspaceId],
    )
  ).rows[0];
  const all = await contactFacts(workspaceId, query.contactId);
  const named = query.name
    ? all.filter(
        (c) =>
          c.name.trim().toLocaleLowerCase() ===
          query.name!.trim().toLocaleLowerCase(),
      )
    : all;
  const phone = query.phone
    ? normalizeDestination(
        query.phone,
        workspace?.settings?.defaultRegion ??
          (named.length === 1
            ? parsePhoneNumberFromString(named[0]!.phone)?.country
            : undefined),
      )
    : null;
  if (query.phone && !phone)
    throw new DomainError(
      'INVALID_PHONE',
      'Provide a valid international number or configure the workspace country.',
    );
  const matches = phone ? named.filter((c) => c.phone === phone) : named;
  if (!query.name && !query.phone && !query.contactId)
    throw new DomainError('CONTACT_REQUIRED', 'Specify the intended contact.');
  if (!matches.length)
    throw new DomainError(
      phone && named.length && query.name
        ? 'IDENTITY_NUMBER_MISMATCH'
        : 'CONTACT_NOT_FOUND',
      'No exact contact matches the supplied identity and destination. Select or import the intended contact before preparing a call.',
      409,
    );
  if (matches.length !== 1)
    throw new DomainError(
      'CONTACT_AMBIGUOUS',
      'Multiple contacts match. Select a contact ID or supply their destination number.',
      409,
    );
  return matches[0]!;
}
export function safeContact(contact: ResolvedContact, mode: Mode) {
  return {
    contactId: contact.id,
    name: contact.name,
    destinationMasked: maskDestination(contact.phone),
    eligible: eligibility(contact, mode).length === 0,
    blockers: eligibility(contact, mode),
    consent: {
      granted: contact.consent && contact.evidence_granted === true,
      source: contact.evidence_source,
      scope: contact.evidence_scope,
      recordedAt: contact.evidence_at?.toISOString() ?? null,
    },
  };
}
