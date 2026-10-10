# Sales leftovers (web) - test manifest, 2026-10-10

Branch: fix/sales-leftovers-ui (off origin/Staging). Full vitest run: 442 tests in 37 files, all passed (parsed from the JSON report).
`npx tsc --noEmit -p tsconfig.app.json` and `npx eslint src/sales` are clean.

All of these run in jsdom. They check markup, state and class names. They do not check layout, real control heights or how anything looks.

| File | Covers |
| --- | --- |
| src/sales/data/sync.test.ts (hidden entries block, 8 tests) | A `hidden` feed entry removes the record even when its rev is not newer or missing; unsaved edits are discarded with a notice; no save is sent afterwards; other records and never-loaded ids are untouched; an unsent local create is kept; restored access clears the flag. |
| src/sales/pages/companies/Revoked.test.tsx | Company, Contact and Deal pages show "You no longer have access to this record" after a hidden entry; an id that never existed still says not found. |
| src/sales/pages/inbox/parts/Research.test.tsx | Invalid website shows the plain inline message and runs no research; server INVALID_URL (research call or create) shows it inline; error clears on edit; valid and empty websites still work. |
| src/sales/pages/inbox/Inbox.test.tsx | Narrow layout state: starts on the list, opening a thread sets `has-sel` with a back control, back returns to the list, private unshared thread has a way back. |
| src/sales/kit/charts.test.tsx | Charts have a name, a description and a text table alternative; stacked bars list each series; lines differ by dash pattern as well as colour; legend swatches; funnel summary. |
| src/sales/styles.test.ts | Reads source text only: no CSS or inline font size under 12px; narrow inbox rules exist; filter bar controls are at least 36px in the narrow/touch block; SalesOS font families do not overlap the main site's; fonts.css holds only @font-face; every sales.css selector is under `.sos` and keyframes are `sos-` prefixed. |

Not verified in a browser: the 390px inbox layout, the rendered 36-40px control heights, legibility of 12px text and one-letter small avatars, screen-reader behaviour of the charts.
