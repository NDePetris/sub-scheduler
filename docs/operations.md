# Production operations runbook

This runbook applies to the production D1 database bound as `DB`. It is for authorized operators only. Never use local commands with `--remote`, copy production data to local/non-production databases, or run a destructive operation during school planning without explicit incident approval.

## Before any recovery action

1. Record the incident time in UTC, affected workflow, recent Worker deployment/version, recent migration, and last known-good time.
2. Determine whether the fault is Worker code, D1 data/schema, or both. Worker rollback never restores D1 data.
3. Before a serious D1 action, record the current Time Travel bookmark. A controlled export is optional and can block database requests; never put an export in the repository.
4. Announce a maintenance window if writes may be interrupted. The GitHub deployment token intentionally has no D1 write permission and cannot restore a database.

## Production deploy failure

1. Inspect the failed GitHub Actions **Deploy production** run: tests, typecheck, lint, upload, and `/api/health`.
2. If upload did not complete, fix the cause and rerun the same trusted `main` revision. For a manual retry use the existing path only:

   ```bash
   npm ci
   npm run test
   npm run typecheck
   npm run lint
   npm run deploy:production
   ```

3. Confirm the canonical `/api/health` URL returns HTTP 200 with `status: ok` and `database: connected`. Through Cloudflare Access, smoke-check Schedule → date → absence → Sub Plan → resolve an Assignment → final message. Do not add test records to production.

Deployment never applies D1 migrations. A failed health check after upload is a rollback decision, not a reason to rerun a migration.

## One-time migration baseline cutover

This procedure applies only to the September 2026 baseline reset. The retired migration chain is not a supported upgrade path, and no database containing retained operational data requires migration through it. Keep the previous production database intact until every verification step succeeds.

1. After the baseline-reset change is merged, update the local checkout of `main` and create a replacement database under a new name. The existing name cannot be reused while the previous database exists:

   ```bash
   git switch main
   git pull --ff-only origin main
   npx wrangler d1 create school-sub-planning-production-v2
   ```

   Record the `database_id` printed by Wrangler. Do not use `--update-config`; the production binding must be changed in a reviewed follow-up commit.

2. Confirm that Wrangler sees the new baseline as unapplied, apply it to the replacement database, and verify the recorded migration. These commands target the newly named database, not the current production binding:

   ```bash
   npx wrangler d1 migrations list school-sub-planning-production-v2 --remote --env production
   npx wrangler d1 migrations apply school-sub-planning-production-v2 --remote --env production
   npx wrangler d1 migrations list school-sub-planning-production-v2 --remote --env production
   npx wrangler d1 execute school-sub-planning-production-v2 --remote --env production --command "SELECT name FROM d1_migrations ORDER BY id"
   ```

   The final list must report no pending migrations, and the structural query must return only `0001_initial_schema.sql`.

3. Prepare a separately reviewed SQL initialization file in an approved secure location outside the repository. It must create at least one approved `authorized_users` administrator and the single `application_settings` row with the school's configured timezone and settings. Apply it only to the replacement database:

   ```bash
   npx wrangler d1 execute school-sub-planning-production-v2 --remote --env production --file="APPROVED_SECURE_PATH/production-initialization.sql"
   ```

   Do not execute `seed/local.sql` against the replacement database; it is fictional local-only data. Confirm that the Cloudflare Access policy and Worker allowlist agree. After deployment, use the administrator UI to configure authoritative Staff, Rooms, Schedule, and Default Sub Plan data before the protected end-to-end smoke path.

4. In a reviewed follow-up change, update `wrangler.jsonc` under `env.production.d1_databases[0]`: set `database_name` to `school-sub-planning-production-v2` and `database_id` to the recorded replacement UUID. Leave `binding: "DB"` and `migrations_dir: "migrations"` unchanged. Run `npm run check`, merge the binding change to `main`, and let the existing **Deploy production** workflow perform the canonical production deployment. Do not add database creation or migration to that workflow.

5. Verify the public health endpoint returns HTTP 200 with `ok: true`, `data.status: "ok"`, and `data.database: "connected"`. Confirm `data.deploymentVersion` is the merged binding-change commit.

6. Authenticate through Cloudflare Access as an allowlisted administrator. Verify the compact administrator workflow against authoritative operational configuration: **Schedule → Date → Absence → Default Sub Plan → Resolve Assignments → Final Communication**. Confirm the selected Schedule Version/Special Schedule, A/B designation, Assignment status, saved resolution, generated message, finalization, and reopen path. Do not create synthetic test records or use student-level data in production.

7. Retain the previous database through an agreed observation window. It is safe to retire it only after migration state, `/api/health`, the protected smoke path, deployment version, and production binding have all been verified and no rollback requires the old binding. Deletion is a separate explicitly approved operator action; never delete the old database first.

## Application rollback

### Bad deploy, no schema change

1. Find the last known-good commit and Worker version in GitHub Actions and Cloudflare Workers **Deployments**.
2. Prefer **Workers & Pages → school-sub-planning-production → Deployments → known-good version → Rollback**. Record the chosen version and time.
3. If that is unavailable, redeploy the known-good commit through `npm run deploy:production` after normal checks, or make a reviewed revert on `main` and let the trusted-push workflow deploy it. Do not invent an ad-hoc deploy path.
4. Verify `/api/health` and the protected smoke check.

Cloudflare retains up to 100 published Worker versions. Rollback changes Worker code/assets/configuration only; D1 data is unchanged. Use it only after confirming the older code and current bindings/schema remain compatible.

### With a backward-compatible schema change

Code rollback is normally safe for additive tables, indexes, nullable columns, or unused defaulted columns when the older code tolerates them. Confirm from the migration and queries, leave the schema in place, and ship a forward correction later.

### With an incompatible schema change

Code and database recovery are separate. A Git revert or Worker rollback does not reverse a D1 migration. Roll back code only if it can read the current schema; otherwise prepare a reviewed forward corrective migration. Use D1 recovery only for damaging schema/data changes because it removes all later writes.

## D1 migration policy

Production migrations are explicit operator actions; GitHub deployment never runs them.

1. Review the new forward-only SQL migration and its tests. Any migration that rebuilds or replaces a populated table must include a populated upgrade regression test covering relevant parent/child relationships and data preservation before merge. Deploy additive schema first, compatible code second, and destructive cleanup only in a later reviewed release.
2. Before risky work, record a UTC recovery timestamp/bookmark and confirm the remote database reports `version: production`:

   ```bash
   npx wrangler d1 info school-sub-planning-production-v2 --env production
   ```

3. Apply only after review:

   ```bash
   npx wrangler d1 migrations apply DB --remote --env production
   ```

4. Verify the migration result, `/api/health`, and affected workflow before code relies on it.

Use forward-only, backward-compatible changes where practical. Add before cleanup. Drops, rebuilds, data rewrites, and constraint tightening require explicit review and a maintenance window. Do not add automatic down-migrations.

## D1 recovery with Time Travel

Time Travel is the primary D1 recovery mechanism. It is automatic for databases on D1's production backend: minute-granularity recovery is retained for 30 days on Workers Paid and 7 days on Workers Free. Cloudflare creates bookmarks automatically, so routine exports add no protection inside that window.

Time Travel is **in-place**: it overwrites the production database, cancels in-flight queries/transactions, and removes every write after the selected point. It currently cannot fork/clone a database. A restore returns the previous bookmark, which is the undo point while retained. It can restore both data and schema, so newer code may need rollback or a later compatible migration.

### Identify the recovery point

Use the UTC incident timeline. These are read-only:

```bash
npx wrangler d1 info school-sub-planning-production-v2 --env production
npx wrangler d1 time-travel info DB --env production
npx wrangler d1 time-travel info DB --timestamp="2026-09-09T18:30:00Z" --env production
```

Record the current and candidate bookmarks. Choose immediately before the damaging write/migration and after the last desired write.

### Restore — destructive production operation

**WARNING: This overwrites the production database bound as `DB`, deletes all later writes, and cancels in-flight work. Obtain explicit incident approval and pause writes first.**

```bash
npx wrangler d1 time-travel restore DB --bookmark="RECOVERY_BOOKMARK" --env production
```

Wrangler asks for confirmation. Save the pre-restore bookmark printed by the command. Do not automate production restore with unattended confirmation.

### Verify

1. Query only non-sensitive structural/aggregate facts with `wrangler d1 execute ... --remote --env production`.
2. Check `/api/health` and the protected administrator smoke path without inserting test data.
3. Reconcile legitimate writes lost after the recovery point from an approved source of truth; do not blindly replay an export.
4. Record timestamp/bookmark, operator, lost-write window, and verification results.

### Exports are secondary

A controlled SQL export is available:

```bash
npx wrangler d1 export school-sub-planning-production-v2 --remote --env production --output="approved-secure-path.sql"
```

Exports help with retention longer than Time Travel or forensics, but contain operational data, can block requests, and restore by executing SQL against a target. They are not a safe in-place replacement for Time Travel. Do not automate them until encrypted storage, access, retention, and restore-test policy are approved.

## Staging and preview decision

No deployed staging/preview exists: `wrangler.jsonc` has local/default and `production` D1 bindings only, while production deployment is trusted `main` pushes only.

| Option | Benefit | Cost/risk | Decision |
| --- | --- | --- | --- |
| Local + CI + production | Lowest burden; isolated D1 integration tests and protected deploy checks | No remote pre-production smoke test | Use now |
| Shared staging | Exercises Access, binding, migration, and release smoke tests with synthetic data | Separate Worker/D1/hostname/Access/test allowlist and explicit deployment | Defer until a planned remote-integration change |
| PR previews | Fast UI review | Synthetic-only binding and per-preview Access/secrets controls; poor migration rehearsal | Do not add now |

Recommendation: defer staging in this recovery pass. When needed, add one shared `staging` Worker with a separately created D1 database, synthetic data only, non-production hostname and Access app, and an explicit trusted-branch deployment. Never bind/copy production D1 or expose production secrets to PRs.

## Validation status

Installed Wrangler supports `d1 time-travel info` and `restore`, which operate on remote D1. Local D1 cannot validate Time Travel. No production or remote disposable D1 was touched, so no end-to-end restore was performed. Existing integration tests remain the safe schema/behavior check.

## References

- [Cloudflare D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare D1 import and export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [Cloudflare Workers rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
- [Cloudflare D1 environments](https://developers.cloudflare.com/d1/configuration/environments/)
