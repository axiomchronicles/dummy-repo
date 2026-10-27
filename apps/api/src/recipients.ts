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

export async function ensureContactSource(
  workspaceId: string,
  contactId: string,
  name: string,
  phone: string,
): Promise<string> {
  const existing = (
    await pool.query<{ import_id: string }>(
      'SELECT import_id FROM import_rows WHERE workspace_id=$1 AND contact_id=$2 ORDER BY created_at DESC LIMIT 1',
      [workspaceId, contactId],
    )
  ).rows[0];
  if (existing) return existing.import_id;

  let importId = (
    await pool.query<{ id: string }>(
      `SELECT id FROM imports WHERE workspace_id=$1 AND filename='direct_contacts.csv' AND status='ready' LIMIT 1`,
      [workspaceId],
    )
  ).rows[0]?.id;

  if (!importId) {
    const csvContent = Buffer.from('name,phone\n');
    const created = (
      await pool.query<{ id: string }>(
        `INSERT INTO imports(workspace_id, status, synthetic, filename, media_type, source_bytes, mapping, row_count, valid_count)
         VALUES($1, 'ready', false, 'direct_contacts.csv', 'text/csv', $2, '{"name":"name","phone":"phone"}'::jsonb, 1, 1)
         RETURNING id`,
        [workspaceId, csvContent],
      )
    ).rows[0];
    importId = created?.id;
  }

  if (importId) {
    const nextRow = (
      await pool.query<{ next_row: number }>(
        'SELECT COALESCE(MAX(source_row), 0) + 1 AS next_row FROM import_rows WHERE import_id=$1',
        [importId],
      )
    ).rows[0]?.next_row ?? 1;

    await pool.query(
      `INSERT INTO import_rows(workspace_id, import_id, source_row, source_cells, normalized_phone, status, contact_id)
       VALUES($1, $2, $3, $4, $5, 'valid', $6)
       ON CONFLICT DO NOTHING`,
      [
        workspaceId,
        importId,
        nextRow,
        JSON.stringify({ name, phone }),
        phone,
        contactId,
      ],
    );
  }

  return importId ?? contactId;
}

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

  if (matches.length === 1) {
    return matches[0]!;
  }

  // If a valid destination phone number is provided:
  if (phone) {
    const phoneMatches = all.filter((c) => c.phone === phone);
    if (phoneMatches.length === 1) {
      return phoneMatches[0]!;
    }

    const cleanName = query.name
      ? query.name.replace(/\+?\d(?:[\s().-]*\d){6,}/g, '').trim() || 'Direct Contact'
      : 'Direct Contact';
    const inserted = (
      await pool.query<{ id: string }>(
        `INSERT INTO contacts(workspace_id, phone, name, attributes, consent, synthetic)
         VALUES($1, $2, $3, '{}', true, false)
         ON CONFLICT (workspace_id, phone) DO UPDATE
         SET name = CASE WHEN contacts.name = 'Direct Contact' OR contacts.name = '' THEN EXCLUDED.name ELSE contacts.name END,
             consent = true
         RETURNING id`,
        [workspaceId, phone, cleanName],
      )
    ).rows[0];

    if (inserted?.id) {
      await pool.query(
        `INSERT INTO consent_records(workspace_id, contact_id, granted, source, scope)
         VALUES($1, $2, true, 'operator_instruction', 'outreach')
         ON CONFLICT DO NOTHING`,
        [workspaceId, inserted.id],
      );
      await ensureContactSource(workspaceId, inserted.id, cleanName, phone);
      const created = await contactFacts(workspaceId, inserted.id);
      if (created.length) return created[0]!;
    }
  }

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
