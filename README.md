# Panguich — Growth & Operations (Phase A owner demonstration)

A private, working demonstration for Panguich (Peruvian restaurant, 10215 Stirling Road, Cooper City, FL):

- a bilingual, phone-first **website preview** with the real menu and a genuine hand-off to Panguich's Toast ordering page;
- a small **owner workspace** (Today · Grow · Catering · Operations · Settings) where a catering request
  submitted on the website is saved and worked through to a confirmed event, a campaign is drafted and
  approved, and one clearly labeled **sample** supplier-invoice question is reviewed.

It is a demo. Nothing here sends messages, takes payments, publishes posts, spends money, or changes
Panguich's live website, Toast, SpotHopper, or DNS. Search engines are blocked.

Read next: [docs/STATUS.md](docs/STATUS.md) (what works, what is mocked, owner decisions) ·
[docs/DECISIONS.md](docs/DECISIONS.md) (build vs configure vs integrate) ·
[docs/SOURCES.md](docs/SOURCES.md) · [docs/ASSETS.md](docs/ASSETS.md) · [docs/MASTER_PROMPT.md](docs/MASTER_PROMPT.md) (the spec).

## Run it

Requires Node.js 22+ (developed on 24). No database server, no accounts, no API keys.

```bash
npm install
npm run dev
```

Open http://localhost:3000 (website) and http://localhost:3000/owner (workspace; choose a sample role).
The first request creates an embedded database in `.data/` and fills it with labeled sample records.

To run the optimized build the way the browser tests do:

```bash
npm run demo
```

### A five-minute walkthrough

1. **Website** `/en` → switch to Español → Menu → search "chicharron" → *Order pickup* opens Toast in a new tab.
2. **Catering** `/en/catering` → send a request. Note the reference number.
3. **Owner** `/owner` → *Continue as Owner* → Today shows the new request first.
4. **Catering** → open the request → add a quote → approve it → move it through the stages. Reload: it is saved.
5. **Grow** → open the sample campaign → read "what you are approving" → approve → export the text.
6. **Operations** → open the sample invoice question → see the two invoice lines and the arithmetic.
7. **Settings** → answer "Which Sunday closing time is correct?" → see that every connection says *Not connected*.
8. Sign out, come back as **Staff**: no Grow, no Operations, no approvals.

Reset everything: Settings → *Reset demo data*, or stop the app and run `npm run db:reset`.

## Check it

```bash
npm run typecheck     # TypeScript, strict
npm run lint          # ESLint
npm test              # unit + integration tests (in-memory Postgres)
npm run test:e2e      # builds, starts on :3211 with a throwaway database, runs phone + desktop browser tests
npm run check         # all of the above
```

Browser tests need Playwright's Chromium once: `npx playwright install chromium`.
Real screenshots: `npm run screenshots -- http://localhost:3000 docs/screenshots`.

## How it is put together

```
src/content/      verified business facts, the menu, website words (EN/ES), connection states
src/app/(site)/   public website, statically rendered per language: /en, /es
src/app/(owner)/  owner workspace (always server-rendered, never indexed)
src/app/api/      anonymous tap counter
src/modules/      catering · growth · operations · tracking · today  (rules + tests live here)
src/lib/          money (integer cents), time (America/New_York), roles, sessions, audit
src/db/           Drizzle schema (PostgreSQL), embedded PGlite client, seed, test helper
drizzle/          SQL migrations
e2e/              Playwright browser tests
```

Working agreements for contributors (human or AI) are in [AGENTS.md](AGENTS.md).

## Configuration

Copy `.env.example` to `.env.local` if you need to change anything. Defaults work for a local demo.

| Variable | Meaning |
| --- | --- |
| `PANGUICH_DEMO_MODE` | `1` enables the pick-a-role sign-in and preview labels. On in `npm run dev`; **off in production builds unless set**. Static pages read it at build time. |
| `PANGUICH_DATA_DIR` | Where the embedded database lives. Default `.data/pglite`. |
| `SESSION_SECRET` | Session signing key. Required when demo mode is off. In demo mode a random key is generated in `.data/`. |
| `PANGUICH_SITE_URL` | Canonical origin for metadata and the sitemap. Do not point at a live domain without owner approval. |
| `PANGUICH_ALLOW_INDEXING` | `1` lets search engines in, and only on a non-demo build. Leave unset. |

## Data: backup, restore, export, delete

- **Where:** everything is in `.data/` (git-ignored). Demo records only.
- **Backup:** stop the app, copy the `.data/` folder. **Restore:** stop the app, put the folder back.
- **Export:** Settings → *Download a copy of everything* (owner only) gives one JSON file.
- **Delete:** Settings → *Reset demo data*, or `npm run db:reset`.
- The schema is plain PostgreSQL (`drizzle/*.sql`). For a pilot, point Drizzle at a hosted Postgres in
  `src/db/client.ts`, run the same migrations, and use the provider's point-in-time recovery. That
  switch has **not** been built or tested yet.

## Deploying (not done — needs the owner's approval first)

This build is intended to run on a laptop for a demonstration. Before it goes anywhere public:

1. Real sign-in with real accounts (demo sign-in must stay off), `SESSION_SECRET` set, HTTPS.
2. Hosted Postgres with backups; error monitoring; a shared rate-limit store.
3. Owner-approved photos, logo, story, hours and prices; the "facts to confirm" answered.
4. A domain decision and redirect plan so this never becomes a third competing Panguich site.

**Rollback** for a future launch: keep the current site untouched and reachable; lower DNS TTL a day
ahead; switch one record; if anything is wrong, switch it back. Database migrations are additive, so
the previous build keeps working against the newer schema.

## Known limits

See [docs/STATUS.md](docs/STATUS.md). In short: no real integrations, no real photos, demo-only sign-in,
menu content is a typed file, and the embedded database is single-process.
