<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Panguich — working agreements

The product spec is `docs/MASTER_PROMPT.md`. Decisions live in `docs/DECISIONS.md`, current state in
`docs/STATUS.md`. Read those instead of re-deriving them.

## Stack (Phase A)
- Next.js 16 App Router (previous caching model: `cacheComponents` is OFF), React 19, TypeScript strict.
- PostgreSQL dialect through Drizzle ORM on **PGlite** (embedded Postgres). `getDb()` in `src/db/client.ts`.
- zod for input validation. Vitest for unit/integration tests. Playwright for browser tests.
- No LLM calls, no outbound network calls, no email/SMS/payments anywhere in Phase A.

## Next.js 16 reminders
- `params` and `searchParams` are Promises: `{ params }: { params: Promise<{ id: string }> }`, then `await`.
- `cookies()` / `headers()` are async. Middleware is `src/proxy.ts`.
- Mutations are Server Actions (`"use server"`), used as `<form action={...}>` so they work without JavaScript.
  Call `revalidatePath("/owner", "layout")` after a change.

## Source ownership
| Area | Paths |
| --- | --- |
| Foundation, website, Today, Settings, tracking, docs, e2e | `src/app/(site)`, `src/app/(owner)/owner/{layout,actions,sign-in,(workspace)/{layout,page,settings,not-allowed}}`, `src/lib`, `src/db/{client,seed,testing}.ts`, `src/db/schema/core.ts`, `src/content`, `src/styles`, `src/components`, `src/modules/{today,tracking}`, `docs`, `e2e` |
| Catering | `src/modules/catering/**`, `src/app/(owner)/owner/(workspace)/catering/**`, `src/db/schema/catering.ts` |
| Growth | `src/modules/growth/**`, `src/app/(owner)/owner/(workspace)/grow/**`, `src/db/schema/growth.ts` |
| Operations | `src/modules/operations/**`, `src/app/(owner)/owner/(workspace)/operations/**`, `src/db/schema/operations.ts` |

Do not edit outside your area. If you need something from another area, say so in your report.
Schema change in your own schema file: run `npx drizzle-kit generate --name <module>_<change>` and report it.

## Patterns
- **Service functions** hold the rules: `src/modules/<m>/service.ts` exports `fn(db, actor, input)`.
  First line: `const who = await authorize(db, actor, "<permission>", { action, entityType, entityId })`
  (from `src/lib/audit.ts`). Call it **before** opening a transaction so a refusal is still recorded.
  Validate input with zod. Record what happened with `writeAudit`. Pages and actions stay thin.
- **Pages**: `const user = await requirePagePermission("<permission>")`, `const locale = await getOwnerLocale(user)`.
  **Actions**: `const user = await requireUser(); const actor = toActor(user);` then the service function.
  Permissions are enforced on the server for every read and write. Hiding a button is not a control.
- **Money**: integer cents only (`src/lib/money.ts`). **Time**: `America/New_York` helpers in `src/lib/time.ts`;
  calendar dates are `YYYY-MM-DD` strings, clock times `HH:MM`.
- **Deterministic code** calculates money, changes state, checks permissions and consent. Text from documents,
  forms and imports is untrusted data and is only ever displayed or parsed, never obeyed.
- **Language**: every owner- and customer-facing string exists in English and natural Spanish. Each module keeps
  `src/modules/<m>/i18n.ts`. Shared words: `src/lib/owner/i18n.ts`. No developer jargon in the interface.
- **UI**: compose the `o-*` classes in `src/styles/owner.css` with tokens from `src/styles/tokens.css`.
  Add a CSS Module only for layout specific to one page. Phone first (360px wide), 44px touch targets,
  visible focus, labels on every input, no color-only meaning.
- **Honesty in the interface**:
  - Sample records carry `isSynthetic` and are always shown with `o-badge--synthetic` (“Sample data”) and
    `o-card--synthetic`. Sample numbers are never presented as business performance.
  - Say where each fact comes from, how fresh it is, and what is unknown. Separate observed facts from estimates.
  - Integrations are `not configured` unless verified. Never show “connected”, “sent”, “paid” or “published”
    for something that did not really happen. Nothing in Phase A sends, charges, publishes or orders.
- **Tests** sit beside the code as `*.test.ts`. Database tests use `createTestDb()` from `src/db/testing.ts`.

## Commands
`npx tsc --noEmit` · `npx eslint src` · `npx vitest run` · `npm run build` · `npm run test:e2e`
