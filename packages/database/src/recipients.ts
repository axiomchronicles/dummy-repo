import { pool } from './index';
import {
  normalizeDestination,
  recipientBlockers,
  type Mode,
} from '@outreach/contracts';
export type ResolvedContact = {
  id: string;
  name: string;
  phone: string;
  consent: boolean;
  synthetic: boolean;
  suppressed: boolean;
  evidence_granted: boolean | null;
  evidence_source: string | null;
  evidence_scope: string | null;
  evidence_at: Date | null;
};
export async function contactFacts(
  workspaceId: string,
  contactId?: string,
): Promise<ResolvedContact[]> {
  return (
    await pool.query<ResolvedContact>(
      `SELECT c.*, EXISTS(SELECT 1 FROM suppressions s WHERE s.workspace_id=c.workspace_id AND s.phone=c.phone) suppressed,
       e.granted evidence_granted,e.source evidence_source,e.scope evidence_scope,e.created_at evidence_at
     FROM contacts c LEFT JOIN LATERAL (
       SELECT granted,source,scope,created_at FROM consent_records e WHERE e.workspace_id=c.workspace_id AND e.contact_id=c.id
       ORDER BY created_at DESC,id DESC LIMIT 1
     ) e ON true WHERE c.workspace_id=$1 AND ($2::uuid IS NULL OR c.id=$2)`,
      [workspaceId, contactId ?? null],
    )
  ).rows;
}
export function eligibility(contact: ResolvedContact, mode: Mode): string[] {
  return [
    ...(!normalizeDestination(contact.phone) ? ['invalid_destination'] : []),
    ...recipientBlockers(
      {
        consent: contact.consent,
        synthetic: contact.synthetic,
        suppressed: contact.suppressed,
        evidenceGranted: contact.evidence_granted,
        evidenceSource: contact.evidence_source,
        evidenceScope: contact.evidence_scope,
      },
      mode,
    ),
  ];
}
