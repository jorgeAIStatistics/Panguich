# Decisions — build, configure, or integrate

Last reviewed: 2026-10-13. Sources and check dates are in [SOURCES.md](SOURCES.md).

## 1. The first decision

Panguich already pays for (or at least uses) two capable platforms. The public evidence says most of
what a restaurant "growth system" would do **already exists there**. So the rule for this project is:

> Configure what Toast and SpotHopper already do. Build only the gap between them, and only where the
> gap is a real business problem.

Three gaps were found, and Phase A builds exactly those plus the website demonstration:

1. **Nobody owns the truth.** Two public domains, three sets of prices, two Sunday closing times.
   No tool flags this to the owner. → *Facts to confirm* (Settings) and a Today card.
2. **A catering inquiry stops at the inbox.** SpotHopper captures the inquiry; nothing visible tracks
   quote → deposit → confirmation → what the kitchen must pack. → *Catering pipeline*.
3. **Marketing is not tied to one measurable action with the owner's sign-off.** → a thin
   *campaign draft + approval record*, explicitly not a publishing tool.

The invoice exception is a **single worked example on invented data**. Whether to build it for real
depends on whether Panguich already has Toast's invoice tooling (unknown).

## 2. Capability matrix

Status: **V** verified from a public page · **O** owner confirmation needed · **U** unknown.

| Capability | What exists today | Status | Decision |
| --- | --- | --- | --- |
| Website (menu, hours, photos, reviews, events, specials, jobs) | panguich.us on SpotHopper | V | **Configure / owner decides.** Phase A is a private preview of a more distinctive, bilingual, faster site. It is `noindex` and must not become a third domain. Replacing SpotHopper is an owner decision with a migration plan (§5). |
| Second ordering site | panguichfl.com (platform not identified; Stripe checkout) with different prices and Sunday hours | V exists · O whether intentional | **Owner decision.** Keep, fix, or retire. We do nothing to it. |
| Online ordering, pickup, delivery | Toast hosted ordering (`toasttab.com/local/order/panguich`) | V | **Integrate by link only.** No custom cart. Never pre-fill a third-party cart. |
| Loyalty / rewards | Toast page shows "1 point per $5, 25 points for signing up" | V shown · O how it is run | **Configure in Toast.** Do not build loyalty. |
| Gift cards | Linked from the Toast ordering page | V | **Use Toast.** |
| Authoritative prices, hours, availability | Toast (POS) is the operational source; panguich.us mostly matches it | V match · O which is official | **Toast is the single operational source.** This site displays Toast prices and keeps the differences visible to the owner. |
| Catering inquiry capture | SpotHopper catering page + pop-up ("Catering Packages" leads to an inquiry form, no public prices) | V | **Do not duplicate capture long-term.** Phase A has its own form so the demo works end to end; in a pilot the pipeline should ingest SpotHopper inquiries (forward/export) or replace that form — owner decision. |
| Catering quote → deposit → fulfillment tracking | Not visible publicly. Toast offers a Catering & Events product (to verify with Toast, including price) | U | **Build thin (Phase A)**, then compare with Toast Catering & Events pricing before investing more. |
| Email newsletter | SpotHopper newsletter signup on panguich.us | V | **Configure in SpotHopper.** Not built. |
| Social posts, "AI promotions", review generation | Advertised by SpotHopper | V advertised · O which are enabled | **Configure in SpotHopper.** Phase A only drafts text for the owner to post. |
| Marketing automation | Toast IQ Grow (paid) and SpotHopper | V advertised · O subscribed? | **Do not build.** |
| Sales / labor / menu-performance Q&A, forecasting, prep lists | Toast IQ — "included with Toast POS at no additional cost" | V advertised · O in use? | **Use Toast IQ.** Not built. No sales numbers appear anywhere in this workspace. |
| Supplier invoice capture, price tracking, recipe costing | Toast offers invoice and recipe-costing tools (xtraCHEF by Toast; to verify, including price) | U whether subscribed | **One synthetic example only.** Decide after the owner confirms what they have. |
| Delivery-platform settlement reconciliation | No evidence of third-party marketplaces beyond Toast delivery | U | **Not built.** Phase C at the earliest, only with real statements. |
| Inventory, purchasing, forecasting | Toast IQ covers forecasting; inventory unknown | U | **Not built.** |
| Reporting of website activity | SpotHopper reports site visits; this demo counts taps locally | V / demo | Phase A counts anonymous taps to prove the handoff works. In a pilot, prefer one analytics source. |
| Toast API | Standard API access: **read-only, GET only, no sandbox**, part of Restaurant Management Essentials (US); owner must request credentials | V (docs) · O (eligible? willing?) | **Do not assume.** Hosted ordering + owner-provided exports until credentials exist and are tested. Local fixtures are not Toast verification. |
| Instagram | Profile exists; could not be inspected reliably | U | No social metrics are stated anywhere. |

## 3. What was built, and why each piece earns its keep

| Module | Business problem | Measurable outcome | Needs | Existing alternative | Added cost | Upkeep |
| --- | --- | --- | --- | --- | --- | --- |
| Public website preview | Current site is a generic template; menu lacks plain-English explanations; Spanish speakers get English only | Taps on Order / Directions / Call / Catering per visit (counted) | Owner-approved photos, logo, story, confirmed facts | Reconfigure the SpotHopper template | Hosting ≈ $0–20/mo; no new subscription | Menu is a typed file today; needs a sync or an edit screen before launch |
| Order handoff | Ordering must stay on proven infrastructure | Handoff taps (never called orders) | The Toast link | None needed | $0 | Re-check the link monthly (staleness is flagged) |
| Facts to confirm | Guests can arrive to a closed door; prices disagree across sites | Conflicts answered; pages corrected | Owner's answer | None found | $0 | Re-read public pages monthly |
| Catering pipeline | Inquiries are not tracked to a fulfilled, paid event | Reply time; inquiry → quote → confirmed conversion; forgotten follow-ups | Owner's packages, minimums, lead times, deposit policy | Toast Catering & Events (paid), spreadsheets, SpotHopper inbox | $0 software; owner time | Low: one table set, one state machine, covered by tests |
| Campaign draft + approval | Posts go out without a goal, an approval, or a way to tell if they worked | Approved campaigns; taps per campaign code | Photos, owner approval | SpotHopper AI promotions, Toast IQ Grow | $0 | Low. **If SpotHopper/Toast marketing is already in use, drop this module.** |
| Invoice exception (synthetic) | Supplier price creep and duplicate bills go unnoticed | Questions sent; credits received; cash recovered (kept separate) | Real invoices; contract prices | Toast invoice tooling | $0 now; extraction costs later | Medium once real documents arrive. **Do not build further before the owner confirms need and existing tools.** |

Not built on purpose: custom cart/checkout, loyalty, newsletter/SMS sending, review requests, ad
management, inventory, forecasting, settlement reconciliation, an AI assistant.

## 4. Engineering decisions

| Decision | Choice | Why | Revisit when |
| --- | --- | --- | --- |
| Shape | One Next.js app (modular monolith): `content/`, `modules/{catering,growth,operations,tracking,today}`, `lib/`, `db/` | One deploy, one language, clear module ownership | Never, unless load proves otherwise |
| Framework | Next.js 16 (App Router), React 19, TypeScript strict | Static public pages (fast, no JS needed to read the menu or order); server actions work without JavaScript | — |
| Database | PostgreSQL dialect via Drizzle ORM, running on **PGlite** (embedded Postgres) | The demo needs zero infrastructure and runs on a laptop; schema and SQL are plain Postgres | Pilot: switch the driver in `src/db/client.ts` to hosted Postgres (Neon/Supabase/RDS). One file. Not yet tested against a server. |
| Validation | zod | Small, typed, widely used | — |
| Auth | Demo pick-a-role sign-in with signed, http-only session cookies; roles checked on the server on every read/write; refusals audited | Real accounts are pointless before the owner agrees to a pilot | **Before any pilot:** an established provider (Auth.js, Clerk, or similar) with real accounts and MFA. Demo sign-in is off in production builds unless `PANGUICH_DEMO_MODE=1`. |
| Money | Integer cents everywhere; no floats | Exactness | — |
| Time | `America/New_York` via `Intl`; dates as `YYYY-MM-DD`, times as `HH:MM` | DST-safe without a date library | — |
| AI | **None in Phase A.** Drafts are deterministic templates; all math is ordinary code | The menu, ordering and every workflow must work with AI unavailable; no model cost; no injection surface | Add extraction/translation later behind typed, permission-scoped tools with spend limits |
| Background jobs | None yet | Nothing is scheduled or sent in Phase A | Reminders/imports in Phase B: a single cron-driven job table, idempotent |
| Styling | Hand-written CSS with design tokens; no UI framework | A distinctive identity; small CSS; no dependency | — |
| Fonts | Bricolage Grotesque + Instrument Sans via `next/font` (self-hosted at build) | Sign-painter confidence + readable body; no runtime request to Google | Swap if the owner supplies brand fonts |
| Photos | Labeled placeholders only | Image rights are unknown. See [ASSETS.md](ASSETS.md) | Owner approves real photos |
| Search engines | Blocked (`robots.txt` disallow + `noindex`) | Must not become a third competing domain | Launch approval + migration plan |
| Tracking | First-party anonymous tap counts; honors Do-Not-Track / Global Privacy Control; no cookies for analytics; no PII; campaign code only | Prove the handoff; avoid a third-party tag | Reconcile with Toast reports before claiming any order |

Dependencies (runtime): `next`, `react`, `react-dom`, `drizzle-orm`, `@electric-sql/pglite`, `zod`.
Dev: `typescript`, `eslint`, `eslint-config-next`, `drizzle-kit`, `vitest`, `@playwright/test`.

## 5. If the owner wants this site live (not done, needs approval)

1. Decide the one domain that survives. Do **not** add a third.
2. URL inventory of panguich.us and panguichfl.com → redirect map → owner approval.
3. Confirm authoritative hours/prices; fix the losing pages first.
4. Replace placeholders with approved photos, logo and the owner's story.
5. Real sign-in, hosted Postgres, backups, error monitoring.
6. Launch behind the existing domain with a tested rollback (DNS TTL lowered beforehand; old site kept intact for 30 days).

No DNS, redirect, publishing, message, spend, or provider change has been made by this project.
