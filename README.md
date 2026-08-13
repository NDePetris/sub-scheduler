# School Sub Planning

School Sub Planning is an internal administrator-facing web application for preparing daily substitute plans at a small K–12 school. The locally usable MVP supports the complete persisted workflow: schedule import and activation, date/A-B selection, absences, generated Needs Sub Assignments, resolution, editable message generation, finalization, and reopening.

The product source of truth is [docs/mvp-spec.md](docs/mvp-spec.md). Implementation boundaries and decisions are recorded in [docs/architecture.md](docs/architecture.md).

## Prerequisites

- Node.js 22.12 or newer (Node 24 LTS is recommended)
- npm
- A Cloudflare account only when creating or deploying remote resources

No Cloudflare account or production credentials are required for local development and tests.

## Install

```bash
npm install
```

The committed `package-lock.json` is authoritative. Install scripts are explicitly allowed only for the pinned `esbuild` and `workerd` packages required by Vite and the Cloudflare runtime.

## Local database

Apply all migrations and load the deterministic fictional seed data:

```bash
npm run db:setup:local
```

The command is safe to run repeatedly. It creates local state under `.wrangler/`, applies every forward-only migration, and executes `seed/local.sql`. The seed contains fictional staff, rooms, A/B and shared schedule entries, PLAN and Admin blocks, non-class responsibilities, a configured School Sub availability block, sanitized Default Sub Plan actions, and school settings. It contains no student data.

The individual commands are also available:

```bash
npm run db:migrate:local
npm run db:seed:local
```

Add schema changes as new, forward-only files under `migrations/`; do not edit a migration after it has been applied outside disposable local/test environments.

## Local identity and development

Copy the local-only Worker variables:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Then start the full-stack Vite development server:

```bash
npm run dev
```

Open the URL printed by Vite. The Worker verifies the local server-side identity against D1 for every protected route. `/api/health` provides a small database connectivity check.

## Exercise the MVP locally

1. Open **Schedule** and upload `tests/fixtures/schedule-sample.xlsx` with an Effective From date.
2. Review the detected worksheet, staff, rooms, A/B columns, staged blocks, warnings, and blocking errors.
3. Map each imported label to an existing stable record, create records individually, or use **Create All Missing** for the sanitized role-label fixture.
4. Activate the Schedule Version. Activation uses an atomic D1 batch and closes the preceding open-ended version immediately before the new Effective From date.
5. Open **Sub Plan**, select a date covered by an active schedule, confirm A/B before recording absences, and use **Add Absence**.
6. Open an Assignment to review its Default Sub Plan, candidates, availability source, Plan Periods Lost, projected workload, warnings, and override path. Direct, intentional-uncovered, structured, and split resolutions persist in D1.
7. Use **Review & Finalize** to regenerate, edit, save, and copy the deterministic message, then finalize or reopen the plan.

The seeded fictional schedule remains useful for deterministic Default Sub Plan and conflict testing. Production staff mappings, Default Sub Plans, authentication, school timezone, and School Sub availability require real-school configuration before deployment.

`.dev.vars` is ignored by Git. The local adapter does not trust a browser-supplied email. In any environment other than `local` or `test`, the API fails closed until the future production identity adapter verifies a Cloudflare Access assertion/JWT and then checks the application allowlist.

## Quality checks

Run the primary non-destructive verification suite:

```bash
npm run check
```

It runs formatting checks, ESLint, strict TypeScript, unit tests, Workers/D1 integration tests, and the production build. Focused commands are:

```bash
npm run format
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
```

The integration suite applies the real migration and local seed to an isolated in-memory D1 instance. It never contacts production D1.

## Cloudflare resources and deployment

`wrangler.jsonc` intentionally contains a zero UUID placeholder and the local database name. Before a preview or production deployment:

1. Create separate preview and production D1 databases.
2. Replace or override the placeholder with the correct environment-specific IDs.
3. configure verified Cloudflare Access identity plus the application allowlist;
4. apply migrations deliberately with `wrangler d1 migrations apply <database> --remote`;
5. build and deploy with `npm run deploy`.

Do not deploy using the local identity adapter or point local/test commands at a remote database. Generate binding types after changing Wrangler configuration with:

```bash
npm run cf-typegen
```

## Project structure

```text
migrations/                 Forward-only D1 schema changes
seed/                       Repeatable fictional local seed data
src/app/                    Application shell and navigation
src/components/ui/          Accessible shared UI primitives
src/domain/                 Pure date, time, interval, and schedule concepts
src/features/               Persisted Sub Plan and schedule-import workflows
src/lib/                    Shared browser utilities and API contract validation
tests/fixtures/             Deterministic test fixture builders
tests/unit/                 Runtime-independent domain/import tests
tests/integration/          Workers runtime and D1 smoke tests
worker/                     Worker handlers, identity boundary, and D1 access
docs/                       MVP specification and architecture decisions
public/                     Static assets and the neutral fallback app mark
```

School logo configuration is represented in D1 and the shell already has a school-name fallback; the upload/settings workflow remains out of scope for this pass.

## Current boundary

The MVP vertical slice is implemented without student data, email delivery, teacher portals, arbitrary Word-document parsing, calendar synchronization, AI scheduling, or global optimization. Special one-day schedules are supported by the schedule-resolution service and persistence model; a polished Special Schedule administration screen remains deferred.
