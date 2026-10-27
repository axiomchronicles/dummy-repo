# ADR-003: Identity Architecture — Admin-Only Provisioning & Mandatory TOTP MFA

**Status:** Accepted  
**Date:** 2026-10-27  
**Context:**  
The V2 codebase allowed open development sign-in via `POST /api/v1/auth/demo`, which auto-created users on conflict.
V3 mandates strict security:
"An administrator creates or invites a user from the admin console. Registration/self-sign-up is unavailable in the mobile app and must not be enabled by direct API calls either... The server then enforces the configured second factor. Google sign-in is authentication, not just-in-time registration; the verified Google identity must match an already provisioned and active account."

**Decision:**
1. Eliminate all public registration endpoints. The API will return 404/403 for any attempt to register without a valid, unexpired administrator invitation token.
2. Store passwords using salted Scrypt (`node:crypto` standard).
3. Google Sign-In verifies the ID token against Google's JWKS and asserts that `email` exists in `users` with `status = 'active'`. If unprovisioned, returns HTTP 403 `ACCOUNT_NOT_PROVISIONED`.
4. Enforce mandatory TOTP MFA (RFC 6238) for all users. Primary authentication returns a short-lived `mfa_token`. Full session tokens (`accessToken`, `refreshToken`) are issued only upon valid 6-digit TOTP code or single-use recovery code.
5. Provide a first-admin bootstrap CLI (`scripts/bootstrap-admin.ts`) that generates a random secure password and refuses repeated execution.

**Consequences:**
- Eliminates unauthorized access and brute-force self-registration attacks.
- Complies with OWASP Authentication and MFA Cheat Sheets.
