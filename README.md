# School Sub Planning

School Sub Planning is an internal administrator-facing web application for preparing daily substitute plans at a small K–12 school. The locally usable MVP supports the complete persisted workflow: schedule import and activation, date/A-B selection, absences, generated Needs Sub Assignments, resolution, editable message generation, finalization, and reopening.

The product source of truth is [docs/mvp-spec.md](docs/mvp-spec.md). Implementation boundaries and decisions are recorded in [docs/architecture.md](docs/architecture.md). Production incident, rollback, migration, and D1 recovery procedures are in [docs/operations.md](docs/operations.md).

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

1. Open **Schedule**, review the normal-version timeline and Special Schedules, then choose **Import Schedule** and select `tests/fixtures/schedule-sample.xlsx` with an Effective From date. The school-local date is the initial default, and the styled picker can clear or replace the selected workbook without a refresh.
2. Review the detected worksheet, staff, rooms, A/B columns, staged blocks, warnings, and blocking errors.
3. Map each imported label to an existing stable record, create records individually, or use confirmed **Create All Missing** for the sanitized role-label fixture. The staged name and effective dates may be corrected without re-uploading.
4. Activate the Schedule Version. If the fictional seeded version is still open-ended, review the server-generated confirmation showing its proposed Effective To date, then choose **Activate & End Previous Schedule**. The confirmed operation uses an atomic D1 batch.
5. Open **Sub Plan**, select a date covered by an active schedule, confirm A/B before recording absences, and use **Add Absence**.
6. Open an Assignment to review its Default Sub Plan, candidates, availability source, Plan Periods Lost, projected workload, warnings, and override path. Direct, intentional-uncovered, structured, and split resolutions persist in D1.
7. To exercise a one-day schedule, choose **Add Special Schedule**, provide one date, a name, and the same sanitized workbook, resolve mappings, and confirm activation. It does not require a normal Schedule Version for that date.
8. Use **Review & Finalize** to regenerate, edit, save, and copy the deterministic message, then finalize or reopen the plan.

The seeded fictional schedule remains useful for deterministic Default Sub Plan and conflict testing. Production staff mappings, Default Sub Plans, authentication, school timezone, and School Sub availability require real-school configuration before deployment.

`.dev.vars` is ignored by Git. The local adapter does not trust a browser-supplied email.

## Production Cloudflare Access identity

Production uses only the `Cf-Access-Jwt-Assertion` request header supplied by Cloudflare Access. The Worker verifies its RS256 signature against the Access team's rotating JWKS, and requires the configured issuer, Application Audience (AUD) tag, expiration, and email claim. It then looks up that email in `authorized_users`; only active `administrator` records are allowed. Browser-supplied email headers and `DEV_USER_EMAIL` are never trusted in production.

Set these Worker **plain variables** for the `production` environment (they are identifiers, not secrets):

| Variable                        | Value                                                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `APP_ENV`                       | `production`                                                                                                |
| `CLOUDFLARE_ACCESS_TEAM_DOMAIN` | Your Access team domain, for example `school.cloudflareaccess.com` (an `https://` prefix is also accepted). |
| `CLOUDFLARE_ACCESS_AUD`         | The exact Application Audience (AUD) Tag of this app's Cloudflare Access application.                       |

Do not set `DEV_USER_EMAIL` in production. Supply the two Access identifiers from the invoking environment; they are plain identifiers, not secrets, and are not committed.

The Worker assumes a Cloudflare Access self-hosted HTTP application protects the production hostname and has an Allow policy for the intended Google Workspace and any explicitly approved external users. Keep the Worker allowlist (`authorized_users`) in sync with those allowed identities: Access authenticates users, while the app determines who is an administrator.

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

The application is one Cloudflare Worker that serves both the Vite-generated client assets and the API. Production D1 is a Worker binding; this is not a Cloudflare Pages deployment.

`wrangler.jsonc` intentionally contains a zero UUID placeholder and the local database name. Before the first production deployment, create the separate production D1 database, configure the production D1 binding, configure Cloudflare Access and the `authorized_users` allowlist, and set the production Access identifiers described above.

### Automatic production deployment

`.github/workflows/deploy-production.yml` runs for every push to `main` and can be manually rerun with **Run workflow**. It checks out that trusted revision, uses Node.js 24, installs the lockfile with `npm ci`, runs tests, TypeScript checks, and ESLint, then runs `npm run deploy:production`.

Deployments use the GitHub `production` environment and are serialized (`cancel-in-progress: false`): a newer push waits for an active deployment to finish instead of interrupting it. The workflow does not run for pull requests and production credentials are available only to the production-environment job.

After Wrangler reports a successful deployment, the workflow requests the configured public `/api/health` URL with retries. This endpoint is deliberately unauthenticated: it runs before request authentication, checks only the D1 connection, and returns a status, database-connection label, timestamp, and request ID—never Access configuration, credentials, or application records. A failed request makes the workflow fail visibly; it does not automatically roll back the deployment.

Create the GitHub `production` environment before enabling this workflow, then configure:

| GitHub configuration | Name                            | Purpose                                                                                                                                                                                 |
| -------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment secret   | `CLOUDFLARE_API_TOKEN`          | Cloudflare API token used by Wrangler.                                                                                                                                                  |
| Environment secret   | `CLOUDFLARE_ACCOUNT_ID`         | Account ID for the account that owns this Worker.                                                                                                                                       |
| Environment variable | `CLOUDFLARE_ACCESS_TEAM_DOMAIN` | Production Cloudflare Access team domain.                                                                                                                                               |
| Environment variable | `CLOUDFLARE_ACCESS_AUD`         | Production Cloudflare Access application AUD tag.                                                                                                                                       |
| Environment variable | `PRODUCTION_HEALTH_URL`         | Canonical public HTTPS URL ending in `/api/health`; it is separate because the production hostname/custom-domain route is not tracked in `wrangler.jsonc` and cannot be safely derived. |

Create a custom, account-scoped token for this workflow with only **Workers Scripts: Edit** on the production account. The generated deployment manifest has no Worker routes, KV, R2, Secrets Store, or other resource writes, so do not grant Workers Routes, Workers KV Storage, Workers R2 Storage, Workers Tail, Account Settings, user-profile permissions, or any D1 permission. In particular, production deployment must not receive D1 Write/Edit. Cloudflare's **Edit Cloudflare Workers** template is broader than this workflow: it also includes route, KV, R2, Tail, account-settings, and user-read permissions. If starting from that template, remove those unnecessary permissions and restrict the account resource to production; add a zone-scoped Workers Routes permission only if a future deployment manages a Worker route. Keep both token and account ID as GitHub secrets, even though the account ID is not intrinsically secret, to keep the deployment configuration contained in the protected environment.

### Manual deployment

Manual deployment remains a supported fallback. Set `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ACCESS_TEAM_DOMAIN`, and `CLOUDFLARE_ACCESS_AUD` in the shell environment, then run:

```bash
npm install
npm run test
npm run typecheck
npm run lint
npm run deploy:production
```

`npm run deploy:production` sets the Cloudflare Vite production environment, builds the Worker/client output, and deploys the generated production manifest. It never applies migrations. Use `npm run deploy:production -- --dry-run` for a non-uploading build/configuration check.

### Production D1 migrations

Production schema changes are deliberately separate from application deployment. The GitHub deployment workflow never runs `wrangler d1 migrations apply`.

Review the forward-only migration and its deployment order first, back up production data when the migration warrants it, then have an authorized operator apply it explicitly:

```bash
npx wrangler d1 migrations apply school-sub-planning-production --remote --env production
```

Confirm the migration result before deploying code that requires the new schema. Do not automatically reverse a migration: code rollback and database rollback are separate operational decisions.

### Production rollback

1. Identify the last known-good Git commit and its successful GitHub Actions/Cloudflare deployment from the workflow history and Cloudflare Worker **Deployments** view.
2. Prefer Cloudflare's Worker deployment/version rollback to route traffic back to the known-good Worker version when it is compatible with the current D1 schema. Alternatively, manually run the production workflow from the known-good commit (or revert the bad commit to `main`).
3. Verify `/api/health` and the administrator-critical workflow after rollback.
4. If a separate D1 migration has already run, do not assume code rollback reverses it. Keep the schema forward-compatible where possible; plan a separately reviewed corrective migration or recovery action if required.

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

The MVP vertical slice is implemented without student data, email delivery, teacher portals, arbitrary Word-document parsing, calendar synchronization, AI scheduling, or global optimization. Special one-day schedules have a dedicated staged import, mapping, activation, configuration, deletion, and archival workflow and are authoritative independently of normal schedule availability.
