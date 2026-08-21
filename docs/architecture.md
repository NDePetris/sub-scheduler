# School Sub Planning Architecture

## Purpose and scope

This document translates the MVP specification into implementation boundaries and system behavior. It is not a replacement for the product specification in [`mvp-spec.md`](mvp-spec.md). The MVP is one administrator-facing vertical slice:

**Schedule Import → Date → Absence → Default Sub Plan → Resolve Assignments → Final Message**

The system supports administrator decisions; it does not autonomously optimize schedules. It stores no student-level data.

## System context

Administrators use a laptop browser and authenticate with an approved Google Workspace account or a small allowlist of approved external accounts. The browser loads a React application and calls a Cloudflare Worker API. The Worker verifies identity and authorization, applies domain rules, reads/writes Cloudflare D1, and processes the school's `.xlsx` schedule files. Cloudflare provides hosting, edge runtime, access control, and environment isolation.

External boundaries in the MVP are intentionally small:

- Input: school schedule spreadsheet and administrator actions.
- Identity: Cloudflare Access and/or a compatible identity verifier plus application allowlist.
- Output: an editable, copyable text message. Sending remains outside the app.

## Logical components

### Web application

The React/Vite client owns presentation and interaction: date navigation, A/B override, absence entry, Affected Only and Full Schedule views, the Resolve Sub Need drawer, import review, settings, and Review & Finalize. It may calculate previews for responsiveness, but server results are authoritative.

Keep UI feature modules aligned with workflows rather than navigation labels. Navigation is expected to evolve independently.

### Worker API

The Cloudflare Worker is the trust boundary. It:

- verifies identity and checks the administrator allowlist;
- validates request data;
- coordinates schedule import and activation;
- resolves the applicable schedule and pins it to a Daily Sub Plan;
- generates Assignments and applies Default Sub Plans;
- computes candidates, conflicts, availability, and workload;
- records resolutions, overrides, plan status, and audit metadata;
- renders and stores generated message versions.

HTTP handlers should be thin. Domain services should contain deterministic rules, and repositories should isolate D1 queries.

### D1 persistence

D1 stores persistent staff identity, rooms, versioned schedules, special schedules, absences, daily plans, defaults, assignments/segments, generated messages, application settings, authorized users where app-level allowlisting is used, import jobs/validation results, and audit metadata.

Use foreign keys, migrations, and explicit status fields. Derived counts and workload values are calculated rather than treated as authoritative stored state.

### Import adapter

The importer is school-specific. It converts the stable spreadsheet layout into a normalized staging representation, reports ambiguity rather than guessing, maps imported names to stable Staff records, and activates only after administrator review.

### Domain calculation modules

Pure, independently tested modules should cover interval operations, schedule selection, absence expansion, assignment generation, default matching, candidate ranking, Plan Period Equivalents, conflict detection, split validation, and message rendering.

## Request and data flow

For protected operations:

1. Cloudflare serves the client and provides or forwards verified identity context.
2. The client calls the Worker API with no database credentials.
3. The Worker validates the identity assertion, normalizes the email, verifies the allowlist, and authorizes the action.
4. The handler validates input and invokes a domain service.
5. The service reads/writes D1 through a repository boundary, using an atomic transaction or batch for multi-record transitions.
6. The API returns structured data plus explainable warnings/conflicts.
7. The client renders the result; it never overrides server authorization or authoritative calculations.

All school calendar calculations use one configured school timezone. API date values are ISO calendar dates; scheduled times are local wall-clock values. Time intervals are half-open `[start, end)` so adjacent blocks do not overlap.

## Authentication and authorization

Prefer Cloudflare Access in front of both the application and API, configured for the school's Google Workspace domain and explicitly approved external identities. The Worker must validate the trusted Access assertion/header rather than accept a client-supplied email. An application allowlist provides the final authorization decision and supports active/inactive access without password storage.

If Cloudflare Access cannot cover an environment, use an application-level OIDC flow with Google-compatible identity verification and the same allowlist abstraction. This is an adapter change, not a domain-model change.

MVP has one role: Administrator. Still centralize authorization so future roles do not require scattering email checks through handlers. Local development uses a clearly marked development identity mechanism that is unavailable in production.

## Schedule model and resolution

Time, not numbered period, is the base unit. Schedule entries carry staff, day type, start/end time, activity type/category, description, and optional room. A spreadsheet schedule that has one shared column applies to both A and B; explicitly separate columns produce distinct entries.

### Normal schedules

Normal Schedule Versions are effective-dated. For date `D`, select the activated version for which:

`effective_from <= D` and (`effective_to` is null or `D <= effective_to`)

Activation must reject ambiguous overlapping active ranges. When activating a newer version without an explicit end date, close the prior open-ended version at the calendar day immediately before the new `effective_from`. Perform range adjustment and activation atomically.

### Special schedules

A Special Schedule is a complete schedule keyed to exactly one date. It overrides the normal entries used on that date and never mutates normal effective ranges. Its entries may carry the applicable day designation, while the plan records the administrator-selected A/B value for entry filtering and default matching.

### Resolution and historical stability

When opening a date with no Daily Sub Plan:

1. Resolve the one active normal effective-dated Schedule Version, when one covers the date.
2. Look for an active Special Schedule for the exact date.
3. Pin the normal Schedule Version and, when present, the Special Schedule. A Special Schedule remains sufficient by itself when no normal version covers the date.
4. If neither source exists, return `no_schedule_for_date` and create no plan.
5. Store the selected A/B value. A plan with a pinned normal version derives the provisional expected value from it until a real calendar exists; a Special-only plan exposes no expected value.

A Daily Sub Plan pins at least one schedule source. Special entries are authoritative for the date when a Special Schedule is pinned; the accompanying normal reference preserves the underlying expected-day and standard-period context. Once created, a plan continues using its pinned references. Later activation, archival, or effective-date edits affect new plans, not historical ones. Rebuilding assignments within a plan uses its pinned schedule unless an administrator performs an explicit, separately designed rebase action; automatic rebasing is outside the MVP.

### Schedule management

The Schedule workspace lists normal versions, staged imports, and Special Schedules separately. Normal-version Current, Future, and Historical context is derived from the configured school timezone's current local date and the effective range; it is not stored as another lifecycle state. The existing persisted `retired` value represents the administrator-facing **Archived** state, which keeps the lifecycle intentionally small.

Activation is a two-step server-authoritative operation when one earlier open-ended predecessor exists. A preview returns that predecessor and the proposed day-before Effective To date. Activation requires an explicit confirmation flag, recomputes topology, and batches predecessor closure, version/entry creation, and import activation. Any finite or otherwise ambiguous overlap is rejected with the conflicting version's name and range; the system does not merge arbitrary ranges.

Effective-date and name edits validate the complete active topology and use an atomic guarded update. They never update pinned Daily Sub Plan references. Unreferenced Schedule Versions or Special Schedules may be hard-deleted with entries and linked import staging/provenance; referenced schedules may only be archived through the normal UI. A referenced Special Schedule's date is immutable, though its name may be corrected. Staff and Rooms remain independent stable identities. Staged-import deletion cascades only through staging tables.

## Core persistence model

The logical entities from the MVP map to these responsibilities:

- **Staff**: stable person identity, display name, normalized Teacher/Administrator/Staff role, active/can-sub flags, `is_school_sub`, nullable standard-period minutes, and persistent imported-name aliases. Multiple School Subs are data, not special hard-coded users.
- **Rooms**: stable ID, textual room name, and active status. Renames and deactivation preserve schedule history.
- **ScheduleVersions / ScheduleEntries**: activated, effective-dated normal schedules and their timed blocks.
- **SpecialSchedules / SpecialScheduleEntries**: one-date overrides and their timed blocks.
- **Absences**: staff plus inclusive date range and optional time bounds for a single-date partial absence.
- **DailySubPlans**: date, selected A/B designation, a pinned normal Schedule Version when one applies, an optional authoritative Special Schedule override, Draft/Finalized status, and audit fields. A Special-only plan is valid when no normal version covers the date.
- **DefaultSubPlans / DefaultSubPlanActions**: versioned structured preferred actions for an absent staff member, optionally day-specific and ordered in time.
- **Assignments**: one affected responsibility, its source absence, time, type, default reference, resolution type/status, and conflict explanation/audit data.
- **AssignmentSegments**: timed staff coverage segments for split resolution.
- **GeneratedMessages**: generated source text, independently edited text, timestamp, and plan reference.
- **ApplicationSettings**: school name/logo, school timezone, workload threshold, rolling-window length, and message template.

Import staging/validation and allowlist tables are implementation-support entities even though the exact schema is not prescribed by the MVP. Action-specific structured details may use validated JSON when relational columns would prematurely encode every redistribution/combine variant; staff and room references should remain real foreign keys wherever possible.

## Derived calculations

Do not persist authoritative copies of values that can be reliably derived:

- interval overlaps and affected schedule entries;
- automatic availability;
- Plan Periods Lost today and in the rolling window;
- projected burden for a candidate;
- Assignment, Assigned, Unresolved, and warning counts;
- candidate recommendation ordering.

### Overlap and assignment generation

Two half-open intervals overlap when `max(start) < min(end)`. Expand a multi-day absence into its applicable calendar dates. Full-day absences consider every scheduled responsibility for that staff member on each date; partial absences consider only overlapping blocks. Each affected responsibility that requires attention produces one parent Assignment.

Instructional classes normally require resolution. Configured non-class responsibilities can be resolved as **Intentionally Uncovered**. Activities that should not create Needs Sub must be classified explicitly rather than inferred from display text.

### Availability

A shared pure classifier answers schedule-derived availability for an exact interval: PLAN, Admin, an open schedule gap labeled **Available**, or Manual with the overlapping non-availability blocks returned as conflicts. Candidate evaluation adds absence and existing direct/split coverage conflicts around that classification. An active, sub-eligible designated School Sub is automatically available without schedule data; absence and overlapping direct or split coverage still make the School Sub unavailable. Other overlapping activities do not create availability. This gives a future explicit Off-site activity one central place to override inferred gaps. Administrators may explicitly override warnings.

### Plan Periods Lost

For each candidate PLAN block overlapped by actual or proposed coverage:

`equivalent = overlap_minutes / staff_standard_instructional_period_minutes`

An explicit staff value takes precedence. Auto considers only 40- and 50-minute applicable instructional entries, chooses the most frequent supported duration, and uses 40 minutes for a frequency tie. It excludes non-instructional entries and longer merged instructional blocks. On a Special Schedule plan, the pinned normal Schedule Version is the preferred inference source; a Special-only plan falls back to its Special Schedule instructional entries. If neither supported duration can be inferred, plan-time calculation remains unknown and the candidate identifies Staff configuration as the remediation path; merged PLAN blocks never become a silent denominator.

Sum the unique coverage minutes that overlap PLAN blocks for each staff member and date; overlapping override records must not charge the same sacrificed minutes twice. Admin blocks provide availability but contribute zero burden. School Sub work contributes zero teacher Plan Periods Lost. The rolling window and threshold come from settings, defaulting to the previous 7 calendar days and 5.0 equivalents. Candidate previews return current, incremental, and projected values. Workload is derived from current staff configuration, so changing standard-period minutes may change historical rolling results without rewriting historical assignments.

### Candidate ordering

Use deterministic tiers:

1. valid Default Sub Plan candidate;
2. available School Sub;
3. staff automatically available through PLAN, Admin, or an open schedule interval, in one shared tier;
4. manually selectable staff.

Within a comparable tier, lower recent burden ranks first, followed by a stable name/ID tie-breaker. Ranking is advisory, and warnings never silently remove the administrator's override path.

## Schedule import pipeline

The `.xlsx` pipeline has explicit stages:

1. **Receive**: validate extension/MIME, size, workbook safety limits, and required metadata such as effective dates or special date.
2. **Parse**: use the school-specific adapter to create normalized candidate staff, rooms, A/B applicability, and timed blocks.
3. **Stage**: persist the explicit `normal` or `special` import kind, its appropriate date metadata, and parsed candidate records separately from activated schedules.
4. **Validate**: report recognized staff/rooms/A-B structure, malformed or uninterpretable cells/ranges, conflicts, unmapped names, and stale Default Sub Plan references.
5. **Map**: resolve normalized canonical Staff names, then persistent Staff aliases; let administrators link remaining values to persistent Staff/Room records or intentionally create new records. A manual Staff mapping records a reusable alias when it does not collide.
6. **Review**: present warnings and blocking errors. Parsing never implies activation.
7. **Activate**: atomically create the Schedule Version/entries (or Special Schedule/entries), adjust the prior open-ended range when required, and mark the import activated.

Retain source-file metadata and validation provenance for audit/debugging. Whether the original file bytes are retained is an operational choice subject to storage and privacy policy; D1 should store references/metadata rather than large workbook blobs. Activation should be idempotent and impossible while blocking validation errors or mappings remain.

## Daily Sub Plan generation and resolution

### Generate

1. Resolve or load the pinned schedule for the date and selected A/B day.
2. Load absences applicable to that date.
3. Intersect each absence with that staff member's schedule entries.
4. Create/update Assignments with stable source links. Generation must be idempotent and must not silently discard administrator modifications.
5. Find matching ordered Default Sub Plan actions.
6. If a default is valid, soft-populate the resolution and mark it **Default**.
7. If it conflicts (for example, the preferred teacher is absent or already assigned), keep the default reference and explanation, leave the Assignment Unresolved, and compute alternatives.

The service should distinguish generated baseline data from administrator resolution data so adding an absence or regenerating needs does not overwrite unrelated manual choices. Destructive regeneration requires an explicit, reviewed policy and transaction.

### Resolve

The Resolve Sub Need response combines Assignment context, default action, availability/conflicts, current and projected workload, and permitted alternate actions. Primary resolution types include direct teacher cover, redistribution, switch/combine, duty coverage, intentional uncovered, manual override, and split coverage as supported by the Default Sub Plan action model. Room and note changes are modifiers: they may accompany a primary resolution but never change an Unresolved Assignment to Assigned by themselves. A legacy Default Sub Plan `move_room` action applies its room preference while leaving the Assignment Unresolved.

Split segments must remain within parent bounds, use valid start/end times, and normally cover the required interval without overlaps or gaps before the Assignment is Assigned. The UI snaps to 10-minute increments by default, but storage supports arbitrary valid times.

Conflicting choices require explicit acknowledgement recorded with the resolution. Finalization is reversible: reopening returns the plan to Draft while retaining audit history.

## Message generation

Message generation is a deterministic rendering of the structured Daily Sub Plan through a configurable text template. The model should provide the template with ordered, already-normalized data: date, A/B designation, absent teachers, assignments, redistributions, duties, and structured unusual actions.

Store both the most recently generated text and the independently editable text. Editing does not update Assignments. **Regenerate** renders from current structured data and replaces the editable draft after an explicit user action. **Copy to Clipboard** is a browser action; no email or messaging integration exists in MVP.

## Deployment and environments

Maintain isolated **local**, **preview**, and **production** configurations:

- Local: Vite development client, local Worker runtime, local D1 database, fixtures, and a production-disabled development identity path.
- Preview: deployed Worker/client with preview D1, real authentication configuration, test allowlist, and preview-only storage/settings.
- Production: independently deployable Worker/client, production D1, school authentication policy, production allowlist, and school settings.

Bindings and public client variables are typed and environment-specific. Secrets and identity verification configuration stay in Worker/Cloudflare configuration, never in the Vite bundle or repository. Apply migrations deliberately per environment, back up production data before risky migrations, and verify migration version at deployment. Logs should use request/actor IDs where helpful while excluding tokens, raw identity assertions, and sensitive spreadsheet contents.

The same Cloudflare account may host future school tools, but this app must not depend on their schemas or deployment lifecycle.

## Testing strategy

- **Unit tests**: interval math, effective-date selection, special-schedule precedence, A/B applicability, absence expansion, default matching, candidate ranking, Plan Period Equivalents, split validation, and template rendering.
- **Repository/migration tests**: D1 schema constraints, indexes, fresh migration, upgrade migration, effective-range activation, historical pinning, and transaction rollback.
- **API integration tests**: authentication/allowlist, input validation, import lifecycle, plan generation/regeneration, override acknowledgement, finalization/reopening, and message state.
- **Component tests**: conditional absence fields, compact filters/statuses, Resolve drawer warnings/actions, import review, and editable message behavior.
- **End-to-end tests**: the MVP Required Acceptance Scenarios A–N using deterministic schedules, identities, dates, and timezone.

Test both expected behavior and failure modes, especially simultaneous absences, defaults made invalid by conflicts, adjacent interval boundaries, coverage spanning multiple PLAN blocks, duplicate submissions, and interrupted activation/generation.

## Architecture decisions and tradeoffs

### Cloudflare-native modular monolith

Use one React application, one Worker API, and one D1 database for MVP. This minimizes deployment and consistency overhead while domain/repository boundaries preserve a path to later separation. Microservices would add operational cost without an MVP need.

### Server-authoritative domain rules

The browser may preview calculations, but the Worker owns authorization, validation, conflicts, ranking, and persistence. This avoids divergent calculations and prevents client manipulation, at the cost of API calls for authoritative previews.

### Relational core with limited structured JSON

Identity, schedules, plans, assignments, and references remain relational. Validated JSON may hold action-type-specific details for redistribution/combine/switch operations. This avoids an oversized premature schema while accepting that JSON fields require strong runtime validation and may later be normalized.

### Time intervals instead of numbered periods

All schedule and coverage data uses start/end time. This directly supports mixed 40/50-minute blocks and split coverage, with somewhat more interval logic than a period-number model.

### Pinned schedule references

Daily plans retain their chosen schedule version/special schedule. Historical accuracy is favored over automatically reflecting later corrections. Any future “rebase plan” behavior must be explicit and auditable.

### Structured Default Sub Plans

Runtime defaults are structured and reference real Staff/Room records. The initial source document is seed material, not something interpreted on every request. This trades flexible prose ingestion for predictable, testable behavior.

### Derived fairness and availability

Burden, projected workload, availability, and counts are computed from schedule and assignment records. This prevents stale duplicated state. If scale later requires caching, caches must be invalidatable and non-authoritative.

### Advisory recommendations and explicit overrides

Defaults, ranking, conflicts, and workload warnings assist rather than control administrators. Explicit acknowledgement captures intentional conflicts. This favors human judgment and explainability over automatic optimization.

### School-specific importer

The importer targets the stable school workbook format and exposes mappings/validation. A universal spreadsheet mapper is outside scope. This produces a reliable MVP sooner but requires adapter changes if the source format materially changes.

### No student model and no outbound messaging

Redistribution remains conceptual, and output stops at editable/copyable text. These are deliberate privacy and scope boundaries, not missing integrations.

## Foundation implementation baseline

The August 2026 foundation pass established these concrete implementation choices that the vertical slice continues to use:

- The repository uses the official Cloudflare Vite plugin for one React SPA and one `worker/index.ts` API entry point. Static asset fallback handles client routes while `/api/*` runs through the Worker. Navigation metadata is isolated in the client app layer and does not define domain boundaries.
- Tailwind CSS v4 design tokens and a small shadcn-compatible component layer provide the UI foundation. Branding comes from `application_settings`; the shell renders a configured logo URL or falls back to the school name and a neutral mark.
- The initial forward-only D1 migration creates the relational core described above plus `authorized_users`. `application_settings` is a constrained single school row for MVP. Stable text IDs keep fixtures deterministic and do not make imported display names identities.
- API responses use a consistent `{ ok, data }` or `{ ok, error }` envelope with a request ID. The initial health, bootstrap summary, and active-staff routes now share that boundary with workflow endpoints.
- Local and test identity is supplied only through server bindings and must still match an active `authorized_users` row. Other environments fail closed until a production adapter validates the Cloudflare Access assertion/JWT before applying the same allowlist. No request header is trusted as a development identity.
- Generic workbook reading uses the universal `read-excel-file` ArrayBuffer path with explicit file, size, sheet, row, and column limits. A separate `SchoolScheduleAdapter` boundary owns future school-specific interpretation; generic parsing never activates a schedule.
- Unit tests run in Vitest, while API and migration tests use Cloudflare's Workers Vitest integration with real D1 migrations and the same deterministic local seed SQL. This keeps the smoke path close to the deployed runtime without pointing tests at a remote database.

## MVP vertical-slice implementation

The August 2026 vertical-slice pass adds these concrete decisions:

- `0002_preserve_plan_finalization.sql` rebuilds `daily_sub_plans` so Draft plans may retain a paired most-recent `finalized_at`/`finalized_by`. Finalization still requires both values; reopening changes only status and update audit fields.
- `0003_schedule_import_staging.sql` stores import provenance, staff/room mappings, normalized staged blocks, and validation issues separately from active schedules. Activation joins staged values through stable identities and uses one D1 batch for prior-range closure, Schedule Version/entry creation, and import status.
- The sanitized school adapter targets the single `SY27 Teacher Schedules` worksheet. Row 1 contains room labels, row 2 staff display values, row 3 contains explicit A/B labels only for paired columns, column A contains 10-minute wall-clock ranges, spacer columns are ignored, and vertical merged ranges define exact block ends. Unpaired staff columns are `ALL`. The adapter recognizes the fixture's PLAN, Admin, lunch, after-school/after-care, break, student-support, duty, and instructional notation; a standalone `Break` word is a coverable duty while `Breakfast` is not matched as Break and Student Support remains non-coverable. Changing this workbook contract requires an adapter change rather than a universal mapper.
- Because production A/B calendar configuration has not been supplied, the shared school-day layer currently defines Monday through Friday as school days. A new plan infers an expected designation by alternating school days from the pinned normal Schedule Version's Effective From date, beginning with A; weekends do not advance the rotation. Previous/next navigation, direct-date normalization, absence expansion, and plan creation use this same layer so future no-school dates can be introduced without independent calendar rules. Ordinary Daily Sub Plans cannot be persisted for weekends. The administrator-selected A/B value is stored on the plan. A/B may be changed only before an absence has generated Assignments, avoiding silent replacement of decisions; this is a reversible policy until the real calendar source is known.
- Adding an absence expands only Monday through Friday until a real school calendar is available, pre-resolves or creates every affected weekday, intersects partial absence and schedule intervals, applies defaults, and writes the absence, plans, Assignments, and invalidated coverage in one D1 batch. Generated identity combines Daily Sub Plan, absence, and source entry, so the same A/B entry can generate independently on multiple dates while regeneration remains idempotent within a plan. If the newly absent staff member provides overlapping direct/split coverage or participates as a combine/redistribution recipient, that primary resolution returns to Unresolved with an explanation. Split segments are removed; room/note modifiers and any Default Sub Plan reference remain available for context.
- Candidate availability is calculated from the pinned schedule in an assignment-level batch. PLAN and Admin blocks must cover the full proposed interval. A person with an applicable schedule but no overlapping entry is Available; a non-School-Sub person with no applicable schedule data is Manual. The School Sub designation itself creates availability regardless of role, schedule presence, or schedule block type. Absences, scheduled responsibilities for ordinary staff, direct coverage, and split segments produce explainable conflicts. Clearly conflicting assignment and split choices require a persisted override acknowledgement.
- Workload is derived from direct and split coverage over each historical plan's pinned schedule. Only overlaps with the candidate's PLAN blocks contribute Plan Period Equivalents; Admin and School Sub coverage contribute zero. Threshold and calendar-window length come from `application_settings`.
- Resolution writes use atomic batches where child segments are replaced. Split segments require exact, gap-free parent coverage but retain arbitrary valid times; the client presents the configured snap interval. Conceptual redistribution/combine/switch data uses validated action-specific JSON, while room/note modifiers remain supplemental and never introduce a student model.
- Generated messages are immutable regeneration versions with independently editable text. Editing updates only the latest message draft. Reopening retains the most recent finalization actor/time.
- Migration `0005_exclusive_schedule_sources.sql` originally made plan sources exclusive while adding explicit normal/Special import kinds. Migration `0007_pin_normal_context_for_special_plans.sql` corrects the plan constraint to allow both references and preserves all plan children through the rebuild. Existing Special-only plans remain valid because their former normal reference cannot be recovered reliably; newly created Special plans also pin the applicable normal version.
- An active date-specific Special Schedule supplies the authoritative entries while the pinned normal version supplies historical expected-day and standard-period context. Normal entries resume on dates without an active Special Schedule. A Special-only plan has `expectedDayType: null`, while its selected A/B value still filters `A`, `B`, and `ALL` entries.
- The Schedule workspace provides distinct Import Schedule and Add Special Schedule actions over the same parser, staging, identity mapping, and normalized-entry foundation. Unused Special Schedules allow name/date correction and deletion. Once referenced, their date is immutable and they may be archived but not hard-deleted; archived pinned plans continue to load.
- Plan responses derive an informational warning for each absence that generates no Needs Sub Assignments on the pinned schedule. The client distinguishes this true zero-Assignment state from filters hiding existing Assignments. A plan with a Special Schedule also returns its name so the pinned one-day override is explicit in the header.
- Candidate previews use an assignment-level evaluation context: active sub-eligible staff, the pinned day's schedule entries, absences, direct coverage, split segments, rolling-window coverage, and the relevant historical PLAN entries are loaded in a bounded set of batch queries. Availability, conflicts, proposed burden, and current burden are then evaluated in memory. The Resolve Sub Need drawer is a separate feature component that renders Assignment/default context immediately, loads recommendations independently, and separates automatically viable recommendations from advisory overrides.
- Migration `0006_staff_rooms_foundation.sql` removes the single-active-School-Sub unique index, adds nullable positive `standard_period_minutes`, adds globally unique normalized Staff aliases, and indexes candidate configuration. Staff/Room APIs use deactivation rather than deletion. School Sub writes enforce Can Sub, and disabling Can Sub clears School Sub. The Staff & Rooms workspace supplies focused search, add/edit, configuration, aliases, and inactive-record recovery without becoming an HR system.
- Migration `0008_calendar_dates_and_offsite.sql` adds durable per-date school-calendar metadata. Calendar records can replace the rotation-derived expected A/B value, but do not select schedules or prevent an administrator from choosing a different A/B value. Non-school, blackout, and expected-Special flags are informational; a missing configured Special Schedule becomes a warning only. Calendar data is atomically replaced through its own validated API boundary rather than being embedded in Daily Sub Plans. The schedule adapter recognizes explicit `Off-site` blocks and the shared availability classifier gives any overlap precedence over inferred open time. A trailing numeric/alphanumeric room token such as `(203A)` is extracted only when there is no explicit room column; other parenthetical text remains part of the activity description.
- Migration `0009_shared_duty_solo_coverage.sql` adds a structural shared-responsibility key to absence-created non-instructional Assignments. The key uses the Daily Sub Plan's pinned schedule source, day applicability, interval, activity/category, normalized description, and room; it never uses a currently active schedule. Sibling records remain for absence auditability, but a Solo Coverage action updates the full sibling set atomically. Scheduled co-assignee Solo records are workload-exempt; replacement Solo marks exactly one sibling as workload-counted, so the established interval-based workload calculation remains authoritative and does not double-count the operational duty. Structured Solo details contain only the selected staff ID and derived scheduled/replacement kind, and the Worker validates the action shape and eligibility.
- Teacher-level bulk actions are Worker-owned operations scoped by Daily Sub Plan ID plus absent Staff ID. Cover with School Sub requires exactly one active, sub-eligible School Sub, applies only non-shared instructional or duty Assignments with ordinary direct/unresolved resolution state, and preserves room/note modifiers while clearing old resolution-specific details. Combine, redistribution, split, intentionally uncovered, and all shared-duty/Solo records are protected and reported as skipped. Conflicting School Sub coverage is left unchanged. Restore Defaults reloads the currently active structured actions, clears direct/split/structured primary state for non-shared Assignments, and then uses the normal default evaluator; a missing Default becomes Unresolved while retaining only supplemental room/note context. Shared-duty records are intentionally skipped because the Default vocabulary has no Solo action. Each operation calculates all intended changes before one D1 batch, so an unexpected persistence failure cannot save a partial transition. School Sub coverage remains workload-exempt and default restoration uses the ordinary assignment state consumed by the existing workload calculation.
- Generated communication is a deterministic, teacher-grouped projection of the current structured Daily Sub Plan. The Worker stores sanitized constrained HTML alongside a plain-text fallback in `generated_messages`; historical text-only rows are converted to simple paragraphs on read. The client uses a browser-native, constrained contenteditable surface for paragraphs, bullets, bold, paste, and native undo/redo rather than adding a document-editor dependency. Regeneration creates a new projection version and deliberately replaces edited content; it never alters Assignments. Shared-duty siblings are projected once, with the first absent teacher's section owning the operational line.

## When this document changes

Update this document with the implementation change whenever component boundaries, authentication, persistence, schedule precedence/pinning, import activation, calculation rules, environment topology, or a listed tradeoff changes. Product scope and acceptance changes belong first in the MVP specification; do not use architecture documentation to silently redefine them.
