# School Sub Planning

School Sub Planning is an internal administrator-facing web application for preparing daily substitute plans at a small K–12 school. This repository currently contains the production-capable technical foundation: a React interface calls a Cloudflare Worker API, which reads Cloudflare D1.

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

The command is safe to run repeatedly. It creates local state under `.wrangler/`, applies `migrations/0001_core_schema.sql`, and executes `seed/local.sql`. The seed contains fictional staff, rooms, A/B and shared schedule entries, PLAN and Admin blocks, a non-class responsibility, a School Sub, and school settings. It contains no student data.

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

Open the URL printed by Vite. The Sub Plan shell fetches `/api/bootstrap`; the Worker verifies the local server-side identity against D1 and returns the seeded school, staff, room, and active schedule summary. `/api/health` provides a small database connectivity check.

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
src/features/               Workflow-aligned client/import modules
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

This foundation deliberately does not implement the primary MVP workflow yet. The next pass can build:

**Schedule Import → Date → Absence → Default Sub Plan → Resolve Assignments → Final Message**

on the existing schema, import adapter boundary, domain primitives, authenticated API context, and end-to-end D1 smoke path.
