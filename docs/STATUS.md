# Status — Phase A owner demonstration

Updated 2026-10-13. Branch `phase-a/owner-demo`. Nothing is deployed, pushed, published, or sent.

## 1. Flows that genuinely work (end to end, persisted)

| Flow | What happens | Proof |
| --- | --- | --- |
| **Website → order** | Bilingual site (EN/ES) with 113 real menu items, search, hours, directions. *Order pickup* is a plain link to Panguich's Toast ordering page; the tap is counted anonymously. Works with JavaScript off. | Browser tests `e2e/site.spec.ts` |
| **Catering request → confirmed event** | Customer sends the public form → request is saved with consent evidence → appears first on the owner's Today → quote drafted (integer cents) → owner approves → quoted → accepted → deposit recorded *(marked unverified)* → confirmed → kitchen/packing/handoff checklists generated. Survives a new browser session. | `e2e/catering-flow.spec.ts`, 126 unit/integration tests |
| **Campaign draft → owner approval** | Manager starts a draft from a template (weekday lunch, weekend breakfast, catering) → checks run against real hours and menu → manager submits → only the owner can approve *exactly what is shown* → export as text. Any later edit makes the approval stale and the export says DRAFT again. | `e2e/grow-and-operations.spec.ts`, 54 tests |
| **Invoice question (sample data)** | Invented invoices are imported → deterministic check finds one like-for-like price increase ($2.10 → $2.48 per lb, +18.1%, $45.60 on 120 lb) and correctly ignores a bigger case at the same price per lb → evidence, arithmetic, caveats and a neutral draft question → manager marks "looks right" → owner approves the question. Nothing is sent. | same spec, 71 tests |
| **Facts to confirm** | The three places Panguich's own public pages disagree are shown with sources; the owner records the answer; the Today card counts down. | `e2e/owner-access.spec.ts`, `today.test.ts` |
| **Roles** | Owner / manager / staff enforced on the server for every page, action and download; refusals are written to the activity log. | unit + browser tests |
| **Language** | Every customer and owner screen in English and Spanish; the choice is remembered. | browser tests |
| **Demo housekeeping** | Reset demo data, download everything as JSON, activity log. | `seed.test.ts`, browser tests |

Screenshots from the running production build: [`docs/screenshots/`](screenshots/) (30 files, phone and desktop).

## 2. What was tested, and what was not

Ran on 2026-10-13, all passing:

| Check | Result |
| --- | --- |
| `tsc --noEmit` (strict) | clean |
| `eslint src e2e scripts` | clean |
| `vitest run` | **304 tests in 27 files** (in-memory PostgreSQL via PGlite) |
| `next build` (production) | succeeds; public pages are static, workspace is dynamic |
| `playwright test` | **52 passing** = 26 scenarios × phone (Pixel 7 emulation) and desktop (1440×900), Chromium, against the production build with a throwaway database |
| `npm audit --omit=dev` | 0 advisories in runtime dependencies |

Covered from the spec's list: phone menu use · owner permissions · persistent catering state · consent
rejection · unsubscribe suppression (`canMessage` is false after `suppressContact`) · duplicate imports and
duplicate events · wrong invoice units (case size, weight vs count) · credit lines · stale facts and stale
approvals · daylight-saving boundaries (Mar 8 and Nov 1, 2026) · a document that says "wire $9,999" changes
nothing and is shown as inert text.

Measured page loads (lab, one machine, production build; **not** Lighthouse and not field data):

| Page | Largest paint | Layout shift | Transferred | of which script |
| --- | --- | --- | --- | --- |
| `/en` | 0.61 s | 0.006 | 306 kB | 158 kB |
| `/es` | 0.76 s | 0.001 | 307 kB | 158 kB |
| `/en/menu` | 0.59 s | 0 | 314 kB | 158 kB |
| `/es/catering` | 0.56 s | 0 | 305 kB | 158 kB |
| `/en/visit` | 0.58 s | 0 | 303 kB | 158 kB |

Conditions: Pixel 7 viewport, 4× CPU slowdown, download capped at 1.6 Mbps, cold cache, server on the same
machine (so network latency is not represented), and photo slots are placeholders. Real photos and a real
network will make these slower. Re-run: `node scripts/measure.mjs <baseUrl>`.

**Not tested:** Safari, Firefox, real phones, screen readers, an automated accessibility scanner, Lighthouse,
load, hosted PostgreSQL, any real provider. Keyboard skip-link, focus visibility, labels and no-JavaScript
operation were checked; a full accessibility audit was not.

## 3. Integrations: what is real and what is not

| Thing | State | Notes |
| --- | --- | --- |
| Toast ordering link | **Real link, verified by loading it** on 2026-10-13 | A public link, not an account connection. The workspace cannot see orders. Flagged stale after 30 days. |
| Toast sales / orders / menu API | Not connected | Standard API access is read-only, GET-only, no sandbox, and must be requested by the owner. No Toast data of any kind is in this build. |
| Toast IQ, Toast rewards, gift cards | Not touched | They exist on Toast. Nothing here duplicates them. |
| SpotHopper (current site, catering form, newsletter, social) | Not connected | The demo's catering form stores requests locally. It does **not** reach the restaurant. |
| Email, SMS, WhatsApp | Not connected | Nothing is sent. Quotes, campaign text and supplier questions are copy-and-send-yourself. |
| Payments / deposits | Not connected | No card data. Deposits are typed in and labeled "not verified by a payment provider". "Verified" cannot be set by a person. |
| Instagram / Facebook publishing, ads | Not connected | Export only. No spend is possible. |
| AI | Not used | Drafts are fixed templates; all numbers come from ordinary, tested code. |
| Sign-in | **Demo only** | Pick-a-role, no passwords. Off in production builds unless `PANGUICH_DEMO_MODE=1`. |
| Database | Embedded PostgreSQL (PGlite) on disk | Real persistence, single process. Hosted Postgres is a one-file switch that has not been built or tested. |
| Invoices, supplier, amounts | **Invented sample data** | Labeled "Sample data" on every screen, card and export. |
| Catering samples (2), sample campaign (1), demo people (3) | **Invented** | Same labeling. `@example.com`, 555-01xx. |
| Photos, logo | **Placeholders** | See [ASSETS.md](ASSETS.md). |
| Website tap counts | Real, but from this demo environment only | Never shown as orders, sales or visits. "Orders and revenue: not available" is stated on the Grow screen. |

## 4. Sources and assumptions

See [SOURCES.md](SOURCES.md). In one line: name, address, phone, hours, menu, prices and the order link
were read from Panguich's own public pages on 2026-10-13; nothing came from the restaurant directly; revenue,
traffic, costs and contracts are unknown and nothing in the app pretends otherwise.

## 5. Decisions needed from the owner before a live pilot

**Facts**
1. Sunday closing time: 5:00 PM (Toast, panguich.us) or 4:00 PM (panguichfl.com)?
2. Is panguichfl.com intentional? Who controls it? Should its different prices stay?
3. Which price list is official where panguich.us and Toast differ (5 items)?
4. Are breakfasts and starters meant to be missing from Toast online ordering?

**Ownership and contracts**
5. Who owns each domain and can change DNS?
6. SpotHopper: what is paid for, which features are switched on, contract term, and can data be exported?
7. Toast: which plan; is Toast IQ in use; is there invoice or catering tooling already; will the owner request read-only API access or provide exports?

**Direction**
8. Replace the SpotHopper site with this one, or keep SpotHopper and only fix facts? (No third domain either way.)
9. Is Toast the only order destination to promote?
10. If SpotHopper or Toast marketing is already in use, drop the Grow module rather than run two tools.

**Catering**
11. Packages, prices, minimums, lead time, delivery area and fee, deposit policy, daily capacity.
12. Who answers requests, and how fast. Keep SpotHopper's form (and feed this pipeline) or use this one?

**Brand and content**
13. Approved photos and logo files, with rights confirmed. The story, in the owner's words.
14. Review the 34 short dish explanations we wrote and the Spanish translations.

**People, privacy, money**
15. Real accounts: who is owner / manager / staff.
16. Consent wording and a privacy notice reviewed before collecting real customer details.
17. A monthly budget ceiling for hosting, and whether any ad spend is wanted at all.
18. A WhatsApp business number, only if there is a real workflow behind it.

## 6. Costs and access needed for a pilot (estimates to confirm, none committed)

| Item | Expected | Needs |
| --- | --- | --- |
| Hosting for one small Node app | low tens of dollars a month or less | Owner's account and card |
| Hosted PostgreSQL with backups | free tier to low tens a month | same |
| Sign-in provider | usually free at this size | Owner's email domain |
| Transactional email (owner notifications only at first) | usually free at this volume | Verified sending domain |
| Toast read-only API | stated by Toast as part of Restaurant Management Essentials (US) | Owner must confirm plan and request credentials |
| SMS, ads, AI | $0 planned | Not in a first pilot |
| Existing SpotHopper and Toast fees | unknown | Owner |

Prices above are expectations, not quotes; verify each with the provider before deciding.

## 7. Known issues and limits

- Demo sign-in is not real authentication. Do not expose a demo-mode build on the internet.
- The menu is a typed file (`src/content/menu.ts`). No edit screen and no sync with Toast yet, so it will drift.
- Preview labels on the static public pages are fixed at build time (`PANGUICH_DEMO_MODE` at `next build`).
- Rate limits and the embedded database are single-process. Fine for a laptop demo, not for a hosted fleet.
- No Content-Security-Policy header yet (other security headers are set).
- Catering: a confirmed event's quote cannot be edited (cancel and reopen instead); no delete; no Today card for a confirmed event whose date passed without being marked completed; `fulfilled` is only reachable on or after the event date, so it is covered by unit tests rather than browser tests.
- Campaigns: the sample campaign's dates are relative to when the demo data was created; after its last day, re-seed.
- Operations: no upload screen. The sample invoices are loaded by the seed. Extraction from scanned documents is not built.
- Workspace page titles in the browser tab are English only.
- Dev-only tooling (`drizzle-kit`) reports 9 advisories through an old esbuild helper. It is not part of the running app.
- Screenshots are 11 MB in the repository.
- Two bugs found by looking at the running app and fixed with regression tests: the sticky phone order bar could cover the catering form's Send button; a background link prefetch could switch a Spanish-speaking owner's workspace to English.

## 8. Next bounded milestone

**"Owner review and pilot readiness"** — no new features until the owner has seen this.

1. Walk the owner through the demo on a phone (README has a five-minute script). Collect answers to §5.
2. Correct the public facts the owner confirms (on the existing sites first).
3. Swap placeholders for approved photos, logo and story.
4. Real sign-in, hosted Postgres with backups, error monitoring; test the driver switch.
5. Feed real catering requests into the pipeline (from the existing form or this one) with an owner-only notification.
6. Get Toast read-only access or a first export, so "orders" can be a verified number instead of "not available".

Deliberately not next: custom checkout, loyalty, SMS, ad buying, inventory, forecasting, an AI assistant.
