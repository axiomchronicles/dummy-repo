# Outreach Intern V3 — Authentication, MFA, Account Provisioning & Security Research

**Document:** `docs/rebuild/research/auth-security.md`  
**Date:** 2026-10-27  
**Status:** Complete (Phase 1 Research — Agent D)  
**Author:** Identity & Security Engineering Workstream  
**Verified Source References:** Recorded in `docs/rebuild/source-register.md`

---

## 1. Threat Model & Security Principles

In accordance with OWASP Authentication and Multifactor Authentication Cheat Sheets:
- OWASP Auth Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP MFA Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html

### Core Invariants
1. **Zero Public Self-Registration:** There is no public registration endpoint on the API and no sign-up button in mobile or web clients. An account must be explicitly provisioned or invited by an administrator.
2. **No JIT Google Provisioning:** Google Sign-In validates an OpenID Connect ID token. If the verified email does not belong to an active, provisioned user, the server rejects the request with `ACCOUNT_NOT_PROVISIONED` (HTTP 403).
3. **Mandatory Multi-Factor Authentication (MFA):** All user accounts (admins and operators) are subject to mandatory TOTP (RFC 6238) secondary verification. Primary credential validation yields a temporary pending challenge token; full session tokens are never issued without completing MFA.
4. **Tenant Isolation:** Every protected database query enforces `workspace_id` scoping derived exclusively from the verified server-side session identity.
5. **No Default Credentials:** The system boots with zero default accounts. A dedicated one-time bootstrap CLI creates the initial superadmin.

---

## 2. Identity & Provisioning Flows

```
                                  [Admin Console: /users]
                                             │
                                             ▼
                               [POST /api/v1/admin/users/invite]
                                             │
                                             ▼
                               [Generate 48h Invite Token]
                                             │
                                             ▼
                    ┌────────────────────────┴────────────────────────┐
                    │                                                 │
                    ▼                                                 ▼
      [Email Invite / Admin Link]                       [Mobile App: First Sign-In]
                    │                                                 │
                    ▼                                                 ▼
      [POST /auth/invitations/accept]                   [Password Set + TOTP Setup]
                    │                                                 │
                    └────────────────────────┬────────────────────────┘
                                             │
                                             ▼
                                 [Account Status: ACTIVE]
```

### 2.1 Password Hashing Architecture
Passwords are salted and hashed using `node:crypto` Scrypt (`scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 })`) or Argon2id:
- Output format: `scrypt$N=16384,r=8,p=1$salt$derived_key`.
- Constant-time verification using `crypto.timingSafeEqual`.
- Minimum password entropy: 12 characters, requiring lowercase, uppercase, number, and symbol.

### 2.2 Google Identity Federation
- Client retrieves Google ID token via native OAuth on mobile or web.
- Server validates ID token against Google's public JWKS (`https://www.googleapis.com/oauth2/v3/certs`) checking `aud`, `iss`, and expiry.
- Verified email is queried in `users` table:
  - If user does not exist or `status != 'active'`: rejected with `403 ACCOUNT_NOT_PROVISIONED`.
  - If user exists: server issues an MFA challenge token (`mfa_token`). Google auth is primary authentication, not a substitute for MFA.

### 2.3 TOTP Multi-Factor Authentication & Recovery Codes
- **TOTP Standard:** RFC 6238 HMAC-SHA1 with 30-second time step, 6 digits, and ±1 step window tolerance.
- **Secret Storage:** Base32 secret stored in encrypted column in `users.mfa_secret`.
- **Recovery Codes:** 8 single-use alphanumeric backup codes generated at enrollment (e.g. `K7X9-M2W4`). The database stores only the SHA-256 hash of each code. Upon use, the code is marked as spent.

---

## 3. Session & Token Architecture

### 3.1 Mobile Client (Flutter)
- Mobile uses Bearer token authentication.
- Upon successful primary auth + MFA, server issues:
  - `accessToken`: JWT with 15-minute expiration, containing `userId`, `workspaceId`, `role`.
  - `refreshToken`: 32-byte opaque base64url token with 30-day sliding expiration, hashed with SHA-256 and stored in `sessions` table.
- Flutter stores tokens in `flutter_secure_storage` (backed by iOS Keychain and Android EncryptedSharedPreferences).
- Rotating Refresh: Refreshing rotates the `refreshToken` and invalidates the previous token family if reuse is detected.

### 3.2 Vite Admin Console
- Operator console uses HTTP-only, SameSite=Strict, Secure cookies (`outreach_admin_session`).
- Protection against CSRF via Origin validation and double-submit Anti-CSRF token in `X-CSRF-Token` header.
- Admin session timeout: 8 hours maximum.

### 3.3 Session Invalidation & Revocation
- `POST /auth/logout`: Revokes current session token.
- `POST /auth/logout-all`: Revokes all active sessions for the user by updating `users.token_version`.
- Admin Action: Admin can revoke all active sessions of any user instantly.

---

## 4. Role-Based Access Control (RBAC) Matrix

| Endpoint Group | Capability | Superadmin | Admin | Operator | Viewer |
| :--- | :--- | :---: | :---: | :---: | :---: |
| `/api/v1/auth/*` | Login, MFA verification, Refresh, Logout | Yes | Yes | Yes | Yes |
| `/api/v1/campaigns` | Create draft, upload contacts, simulate, confirm | Yes | Yes | Yes | Read-only |
| `/api/v1/campaigns/:id/action`| Pause, resume, cancel running campaign | Yes | Yes | Yes | No |
| `/api/v1/reports/*` | Request report generation, download reports | Yes | Yes | Yes | Yes |
| `/api/v1/admin/users` | List, invite, disable, reactivate, reset MFA | Yes | Yes | No | No |
| `/api/v1/admin/kill-switch` | Global telephony halt / resume | Yes | Yes | No | No |
| `/api/v1/admin/integrations`| Update Sarvam/LLM provider configurations | Yes | Yes | No | No |
| `/api/v1/admin/audit` | Inspect security and mutation audit logs | Yes | Yes | No | No |

---

## 5. First-Admin Bootstrap CLI

To prevent insecure default credentials:
- Script `scripts/bootstrap-admin.ts` provides a one-time execution command:
  ```bash
  npm run admin:bootstrap -- --email admin@example.com --name "System Administrator"
  ```
- Generates a cryptographically strong 16-character temporary password and prints it to stdout once.
- Refuses execution if an active superadmin account already exists in the database.
- Forces immediate password change and TOTP MFA setup upon first login.
