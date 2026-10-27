# ADR-001: Client Surface Architecture — Flutter Mobile & Private Vite Admin

**Status:** Accepted  
**Date:** 2026-10-27  
**Context:**  
The V2 codebase contained a general-purpose customer-facing web dashboard (`apps/web`). The V3 Product Specification explicitly defines the product surfaces:
"Product surfaces: Flutter mobile app + Vite admin console only. Do not build a user-facing web app."
"Flutter mobile app (`apps/mobile`): the primary user experience. There is no general-purpose React/Vite customer application, no separate public dashboard..."
"Vite admin console (`apps/admin`): a small, private operator interface using the same design system and visual language as the mobile app. Its purpose is to provision and manage accounts, enforce security, administer system configuration, and inspect operations. It is not a second user-facing product."

**Decision:**
1. Retire the customer-facing `apps/web` application.
2. Build the primary user experience in Flutter (`apps/mobile`), utilizing Riverpod for reactive state management, Sliver primitives for performant list rendering, and HugeIcons for UI iconography.
3. Build the operator interface as a private Vite + React 19 + TypeScript application (`apps/admin`) using the identical monochrome visual design system.
4. Compose will serve `apps/admin` on port 5173 for operator management; Flutter runs on host/emulator with configurable API endpoint routing.

**Consequences:**
- Clear, unambiguous product surface boundaries matching user requirements.
- Customer workflows (campaign planning, file upload, confirmation, call history) are exclusively native mobile.
- Administrative workflows (user invitation, MFA reset, kill switch) are isolated to the private admin console.
