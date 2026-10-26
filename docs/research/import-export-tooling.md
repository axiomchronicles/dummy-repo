# Import/export and build tooling verification

Lead inspected on 2026-10-24. Dependencies selected from stable official npm package metadata, without claiming latest is necessarily compatible.

| Official source                                     | Title                             | Version / verified detail                                                                                                                                      |
| --------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| https://github.com/exceljs/exceljs/tree/v4.4.0      | ExcelJS README                    | 4.4.0; workbook.xlsx.load and writeBuffer; streaming WorkbookReader accepts stream/path and cache/emit options; formula cell objects are distinct from strings |
| https://csv.js.org/parse/options/max_record_size/   | CSV Parse max_record_size         | csv-parse 7.0.3 metadata; per-record bounded parser option complements upload and row/column limits                                                            |
| https://github.com/catamphetamine/libphonenumber-js | libphonenumber-js README          | 1.13.15; parsePhoneNumberFromString requires explicit defaultCountry for national format; isValid and E.164 number available                                   |
| https://esbuild.github.io/api/                      | esbuild API                       | 0.28.2; JavaScript build API supports bundle/platform/node/target/external/format/outfile; TypeScript stripping does not typecheck                             |
| https://typescript-eslint.io/getting-started/       | typescript-eslint Getting Started | ESLint 10.13.0/typescript-eslint 8.72.0 metadata peers allow ESLint10 and TS5.9.3                                                                              |
| https://prettier.io/docs/install                    | Install Prettier                  | 3.9.10 metadata; check and write are distinct verification/formatting commands                                                                                 |
| https://nodejs.org/en/about/previous-releases       | Node.js releases                  | Node24 selected LTS runtime; Docker node:24.13.0-bookworm-slim manifest directly inspected and supports amd64/arm64                                            |

ExcelJS pinned README was retrieved from the upstream GitHub source via jsDelivr after a slow raw GitHub request; registry metadata returned an empty README, so it was not used as API evidence. XLSX decoding needs a bounded expanded archive/worksheet/row/cell policy as well as compressed file size. CSV is untrusted text, never executed. Export sanitization is a presentation transform; stored data remains unchanged. Prefix handling must preserve E.164 phone validation on input while making exported plus-prefixed cells safe.

Server build uses esbuild with third-party dependencies external and workspace source bundled. Nest dependency injection must use explicit @Inject/useFactory metadata rather than assume esbuild emits TypeScript design metadata. TypeScript is separately checked. tsup was evaluated and rejected because its current upstream README says it is no longer actively maintained; no migration-sensitive extra build framework is needed.

## Integrated dependency audit

Actual npm audit initially reported6 moderate findings: Drizzle Kit's development-only legacy esbuild chain and ExcelJS's UUID dependency. Upstream ExcelJS uses only named v4 in conditional-format IDs; UUID11.1.1 retains CommonJS named exports and fixes advisory GHSA-w5hq-g745-h8pq. Targeted override uses UUID11.1.1 for ExcelJS. Legacy loader esbuild override0.28.2 fixes development-server advisory GHSA-67mh-4wv8-2f99; migration generation is tested against override. Sources https://registry.npmjs.org/uuid/11.1.1 , https://github.com/advisories/GHSA-w5hq-g745-h8pq , https://github.com/advisories/GHSA-67mh-4wv8-2f99 . No force audit downgrade to obsolete Drizzle/ExcelJS performed.

Node CLI https://nodejs.org/api/cli.html inspected for --env-file-if-exists=.env; host developer scripts load safe local config, container environment remains Compose-owned. Existing host5432/6379 occupied by unrelated floral services; Outreach defaults5442/6389 configurable and preserves unrelated containers.
