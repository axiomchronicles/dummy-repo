# Tailwind and shadcn monochrome redesign

Accessed 2026-10-24. Current user instruction explicitly replaces the earlier native CSS choice with Tailwind and actual shadcn components. Existing working domain/API/worker workflows and tenant/security rules remain authoritative. The new surface uses Linear/Geist-inspired operational layout and shadcn neutral semantic tokens; it does not claim to reproduce proprietary product code.

## Verified packages and contracts

| Package                         | Stable version inspected | Evidence                                                                                 |
| ------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------- |
| tailwindcss / @tailwindcss/vite | 4.3.3                    | Plugin peer Vite ^5.2/^6/^7/^8; matches Vite8.3.5                                        |
| radix-ui                        | 1.8.1                    | React/react-dom ^19 peers; official current registry uses unified package                |
| cn                              | 0.2.4                    | Official current shadcn utility package; root verified registry utils re-export          |
| class-variance-authority        | 0.7.1                    | Actual Button/Badge/Tabs source imports cva                                              |
| tw-animate-css                  | 1.4.0                    | Tailwind v4 animations used by Dialog/Sheet/Select registry classes                      |
| shadcn CLI                      | 4.22.1                   | Node>=20.18.1, compatible Node24; inspected only, not added as unused runtime dependency |

Current official new-york-v4 registry components use React19 direct ref props, unified radix-ui, cn, data-slot styling, Tailwind v4 utilities and semantic tokens. Components are copied directly from authoritative registry JSON into apps/web/src/components/shadcn; only local import paths and repository formatting change. Upstream paths, URLs and SHA256 hashes are preserved in provenance.json. This is authentic upstream source, not custom controls relabeled shadcn.

Use actual Button, Input, Textarea, NativeSelect, Select, Dialog, Sheet, Table, Badge, Tabs, DropdownMenu, Separator, Label and Skeleton wherever their behaviors are justified. NativeSelect retains explicit browser-native form mapping/validation and existing RHF register semantics; Radix Select provides operational filters. Dialog and Sheet retain keyboard focus containment, Escape, accessible titles and controlled close. Standalone controlled dialogs capture their opener and restore focus through onCloseAutoFocus; navigation Sheet uses a real trigger. No CLI install mutates root package configuration; the lead owns package/lockfile installation and TypeScript aliases.

## Design and layout changes

Use a white application canvas, neutral/zinc copy and borders, a compact black navigation rail and monochrome actions. Simulation and live badges retain limited amber/red semantic accents and explicit labels; global badges describe SIMULATION DEFAULT while entity badges use persisted actual mode. No emerald brand styling or large rounded card wall remains.

Typography: system sans without network fonts, body14, controls13–14, quiet secondary12–13, headings28–32, tabular operation counts. Navigation220px, application gutters24–36px, topbar56px, thin neutral dividers, restrained4–6px control radius. Focus rings remain visible; reduced motion disables non-essential animation.

Overview becomes an open operations canvas with an unboxed count strip and separated campaign table/activity column. Campaign lists and contacts use full-width open table sections. Campaign detail separates an open execution column and restrained review rail, with tabs for outcomes/activity. Personas become horizontal information rows with version/actions and questions, avoiding a five-card wall. Wizard uses a compact step rail, generous form whitespace and a separate review/launch stage. Reports show an open request toolbar above the persisted table. Integration/settings/audit screens use lists and dividers. Mobile navigation is an accessible Sheet; detail regions stack and wide tables scroll within their container.

All existing persisted actions, remote Query state, RHF/shared schemas, upload bounds, corrections, confirmed calls, SSE cursor replay, unknown answers, persona versions and report downloads remain implemented. Changing appearance must not create client-generated campaign state or progress.

## Authoritative sources

All accessed 2026-10-24:

- shadcn/ui, Vite: https://ui.shadcn.com/docs/installation/vite — Vite plugin, CSS import and @ alias setup.
- shadcn/ui, Tailwind v4: https://ui.shadcn.com/docs/tailwind-v4 — React19 compatibility, data-slot attributes, @theme inline and OKLCH migration.
- shadcn/ui, Theming: https://ui.shadcn.com/docs/theming — semantic background/foreground pairs and CSS variable themes.
- shadcn/ui, CLI: https://ui.shadcn.com/docs/cli — current migration to cn/radix-ui, initialization behavior and workspace ownership.
- shadcn/ui, Button: https://ui.shadcn.com/docs/components/button — variants, sizes and actual upstream source behavior.
- Official registry: https://ui.shadcn.com/r/styles/new-york-v4/button.json and corresponding component JSON URLs listed in provenance.json — exact imported source and dependencies.
- Tailwind, Using Vite: https://tailwindcss.com/docs/installation/using-vite and Theme Variables: https://tailwindcss.com/docs/theme — website HTTP403 here. Retrieved and read official Theme Variables source https://raw.githubusercontent.com/tailwindlabs/tailwindcss.com/main/src/docs/theme.mdx and plugin API README https://raw.githubusercontent.com/tailwindlabs/tailwindcss/main/packages/%40tailwindcss-vite/README.md (default plugin import, production optimization behavior). The guessed GitHub using-vite.mdx path returned404 and was not treated as documentation. Official plugin package metadata and shadcn Vite guide establish the installation contract.
- Vercel Geist: https://vercel.com/geist/introduction — first-party neutral system reference; typography/layout details also audited in ui-reference-audit.md.
- Linear, Features: https://linear.app/features — first-party product reference for compact information hierarchy, quiet separators and operational lists.
- Official npm metadata: https://registry.npmjs.org/tailwindcss , https://registry.npmjs.org/@tailwindcss%2fvite , https://registry.npmjs.org/radix-ui , https://registry.npmjs.org/cn , https://registry.npmjs.org/class-variance-authority , https://registry.npmjs.org/tw-animate-css , https://registry.npmjs.org/shadcn . Exact versions above were inspected rather than assumed latest.

Acceptance: TypeScript/lint/build; actual Compose workflow and exports; Radix Dialog/Sheet keyboard/Escape/opener focus; mobile no page overflow; no external font/analytics calls; screenshot review of desktop and mobile open layouts. Record results only after execution.

## Executed verification

The redesigned Compose UI was inspected at 1440px desktop and 390px mobile using an existing synthetic tenant. Read-only previews reported zero browser runtime errors and no mobile page overflow. Actual upstream data-slot nodes were present for controls and Sheet. Whole-repository TypeScript, frontend ESLint and Vite production build passed. Updated Playwright acceptance passed 3/3 in 38.3 seconds, including genuine Radix Sheet/Dialog focus/Escape, corrected-row refresh, simulation/SSE/report downloads, mapped XLSX import and an unconfigured LIVE review with no launch. A row-cache race found by the first run was fixed by invalidating queries on the completed import revision; the assertion was preserved.
