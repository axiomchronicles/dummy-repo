# Outreach Intern V3 — Security & Privacy Threat Model Specification

**Document:** `docs/rebuild/11-security-and-privacy-threat-model.md`  
**Date:** 2026-10-27  
**Status:** Approved (Phase 2 Design Pack Gate)  
**Lead Architect:** Principal Security & Privacy Architect  

---

## 1. Threat Modeling Methodology (STRIDE)

In accordance with OWASP Top 10, ASVS, and Telephony Security Guidelines, Outreach Intern V3 identifies and mitigates threats across 6 core vectors:

### 1.1 Threat Evaluation & Countermeasures
| Threat Category | Specific Attack Vector | Potential Impact | Implemented Countermeasure |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Uninvited user attempts to register or bypass login | Unauthorized tenant access | No registration endpoint; admin-only invitations; Google OAuth matches pre-existing active email only |
| **Tampering** | User modifies campaign parameters between plan and confirm | Unapproved calls or script injection | Cryptographic SHA-256 snapshot hash; server returns `409 Conflict: PLAN_STALE` on divergence |
| **Repudiation** | Operator denies initiating an outbound campaign or resetting MFA | Regulatory/audit failure | Immutable `audit_log` with actor ID, IP address, timestamp, and entity diffs |
| **Information Disclosure** | Leakage of phone numbers, transcripts, or secrets in logs | PII / Privacy violation | Automatic regex phone masking (`+91 ••••• ••793`); write-only secrets; presigned audio URLs |
| **Denial of Service** | Telephony trunk exhaustion or infinite redial loop | Financial loss / Telephony carrier suspension | Concurrency throttle (max 10); emergency kill-switch; 3-attempt retry ceiling |
| **Elevation of Privilege** | Normal operator accesses admin endpoints or other workspace data | Multi-tenant compromise | Server-enforced RBAC in NestJS guards; tenant isolation on all queries (`WHERE workspace_id = $1`) |

---

## 2. Telephony & Consumer Protection Safeguards

1. **AI Call Disclosure:** Every campaign prompt template must begin with an explicit automated AI identifier:
   - *"Hello, this is an automated AI notification on behalf of [Company]..."*
   - Impersonation of real individuals is strictly prohibited by application policy.
2. **Opt-Out / Suppression Enforcement:**
   - If a recipient states "do not call again", "stop calling", or "wrong number":
     - The Post-Call Analysis Agent detects the opt-out intent.
     - Inserts the normalized E.164 number into `suppressions` table.
     - Cancels all queued retries for that recipient.
     - Subsequent imports will mark that contact as `excluded` permanently.
3. **Strict Calling Windows:** Automated enforcement of local calling hours (default: `10:00 - 18:00 IST`). Dispatches outside this window are rejected or deferred.

---

## 3. Data Privacy & Export Safety

1. **Formula-Injection Defense (CSV / XLSX Export):**
   - Spreadsheet software (Excel, Google Sheets, LibreOffice) executes cells beginning with `=`, `+`, `-`, `@` as formulas, enabling remote code execution.
   - **Countermeasure:** The `reports` worker inspects every text cell and prepends a single quote (`'`) to neutralise formula interpretation.
2. **Data Retention & Expiry:**
   - Raw audio recordings and sensitive turn transcripts are scheduled for deletion after `retention_days` (default: 30 days).
   - Only non-PII aggregate outcomes (`completed`, `duration_seconds`) remain permanently for historical accounting.
