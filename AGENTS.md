# Coding Agent Guide

This repository contains the School Sub Planning web app, an internal decision-support tool for school administrators. Build the smallest production-capable system that supports the MVP's complete vertical slice:

**Schedule Import → Date → Absence → Default Sub Plan → Resolve Assignments → Final Message**

Administrators remain the final authority. Recommendations and warnings must never become unacknowledged scheduling decisions.

## Source of truth

Use this precedence when requirements conflict:

1. The current user/task instructions.
2. [`docs/mvp-spec.md`](docs/mvp-spec.md), the product and acceptance source of truth.
3. [`docs/architecture.md`](docs/architecture.md), implementation guidance and recorded technical decisions.
4. Existing tests and code, which describe current behavior but do not override the MVP spec.

Do not duplicate the full MVP spec elsewhere. If implementation reveals a product ambiguity, preserve the documented terminology and workflow, make the narrowest reversible assumption, and record a consequential decision in `docs/architecture.md`.

## MVP boundaries

Implement supporting screens and infrastructure only as far as the vertical slice requires. Preserve extension points, but do not pre-build deferred features.

Explicit non-goals include teacher portals, teacher absence submission, lesson-plan uploads, student or roster data, automatic email, calendar sync, AI scheduling, global schedule optimization, arbitrary recurring Word-document interpretation, rich reporting, room-capacity enforcement, and mobile-first design.

Never store student names, IDs, rosters, attendance, grades, or other student-level information. Class redistribution is conceptual only.

Use the product terms exactly: **Sub Plan**, **Default Sub Plan**, **Needs Sub**, **Assignment**, **Assigned**, **Unresolved**, **School Sub**, and **Plan Periods Lost**. Do not introduce “Coverage Plan” as the main UI term.

## Technology and repository conventions

- Frontend: React, TypeScript, Vite, Tailwind CSS, and shadcn/ui or an equivalent accessible component library.
- API/runtime: Cloudflare Workers.
- Database: Cloudflare D1 with versioned SQL migrations.
- Authentication: Cloudflare Access and/or app-level verified identity, followed by an application allowlist. The app does not manage passwords.
- Hosting: Cloudflare; keep the app independently deployable.
- Use strict TypeScript. Avoid `any`; validate untrusted inputs at runtime, including API bodies, identity headers, settings, and spreadsheet data.
- Keep domain logic independent of React components, HTTP handlers, and D1 adapters. Prefer small pure functions for interval overlap, schedule selection, assignment generation, defaults, availability, ranking, workload, and message rendering.
- Store dates as ISO local calendar dates (`YYYY-MM-DD`) and times as normalized local wall-clock values. Centralize school timezone handling; never let browser or Worker timezone defaults decide school dates.
- Model time ranges as half-open intervals `[start, end)`. Require `start < end`. Adjacent blocks do not overlap.
- Use stable IDs and foreign keys. Spreadsheet display names are import values, never identities.
- Store room identifiers as text.
- Add indexes for date/effective-date lookups, schedule-entry staff/time lookups, plan assignments, absence ranges, and workload history when the relevant tables are introduced.
- Keep navigation separate from domain modules so sections can be reorganized without rewriting core behavior.

## Cloudflare, Vite, and D1 practices

- Keep browser code free of Worker secrets and server-only bindings. Access D1 only from the Worker.
- Define environment bindings explicitly and type them. Use separate local, preview, and production resources; never point local tests at production D1.
- Put schema changes in forward-only, reviewable migrations. Do not edit an already-applied migration; add another migration.
- Wrap multi-record state transitions in D1 transactions or atomic batches where supported. Activation, plan generation, and replacement of generated assignments must not leave partial state.
- Make write endpoints safe against accidental duplicate submission where practical. Recompute derived values from authoritative records rather than trusting client totals.
- Keep Vite environment variables public only when intentionally prefixed/exposed. Secrets belong in Worker configuration.
- Return structured API errors suitable for inline validation and conflict explanations; do not leak stack traces, SQL, tokens, or identity headers.
- Verify authorization in the Worker for every protected request. UI route guards are convenience, not security.

## Domain invariants

- A Daily Sub Plan pins the exact normal Schedule Version and, when applicable, Special Schedule used at creation. Later schedule edits must not rewrite historical plans.
- A Special Schedule applies to exactly one date, takes precedence over the normal effective-dated schedule, and does not alter normal effective dates.
- Normal schedule resolution selects the version whose effective range contains the date. Activating a newer open-ended version closes the preceding open-ended version immediately before the new `effective_from` date.
- A/B schedules are distinct only where imported as distinct; a single schedule applies to both day types. A Daily Sub Plan stores its selected/overridden A/B designation.
- Absence and schedule intervals generate Assignments only when they overlap. Instructional responsibilities require resolution; eligible non-class responsibilities may be deliberately **Intentionally Uncovered**.
- Apply a valid Default Sub Plan as a soft default and label it **Default**. If invalid, retain the default reference and explanation, mark the Assignment Unresolved, and suggest alternatives. Never silently substitute another person.
- PLAN and Admin blocks create automatic availability. Other blocks do not. Only sacrificed PLAN time contributes to Plan Periods Lost; Admin time and School Sub assignments do not.
- Plan Period Equivalents are calculated per affected PLAN block as `overlap minutes / that PLAN block's normal duration`, then summed.
- Workload threshold and rolling-window length are settings (MVP defaults: `5.0` and `7` calendar days), not constants embedded in ranking logic.
- Warnings are advisory. Clearly conflicting choices require an explicit **Assign Anyway** acknowledgement rather than a hard block.
- Split coverage is stored as timed child segments of one Assignment, with 10-minute UI snapping by default. Do not invent numbered periods.
- Edited generated message text is independent of structured plan data. **Regenerate** replaces it from the current structured plan; editing it never mutates Assignments.
- Finalized plans may be reopened. Preserve audit timestamps and actors.

## Safe implementation assumptions

Agents may make these narrow assumptions without pausing:

- Prefer normalized relational tables plus JSON only for action-specific structured details that would otherwise create premature schema complexity.
- Calculate availability, overlaps, burden, projected workload, counts, and warnings instead of persisting them unless profiling proves a cache is needed.
- Use deterministic candidate ordering: valid default, available School Sub, PLAN availability, Admin availability, then manual candidates; use lower recent burden within comparable groups and stable name/ID tie-breakers.
- Treat imported `.xlsx` files as hostile/untrusted input: enforce size/type limits, parse server-side or in an isolated import module, validate every interpreted row/cell, and require review before activation.
- Prefer explicit status/state transitions and auditable overrides over clever automation.
- Match the compact laptop-first UI and accessibility requirements; status always needs text or an icon in addition to color. Apple Green `#7EA243` is the brand/action color, not a schedule category color.

Do not guess about spreadsheet layouts, production identity headers, school timezone, real staff mappings, or final Default Sub Plan content. Encapsulate these behind configuration/import adapters and use fixtures until real values are supplied.

## Testing and verification

Every behavior change should include tests at the lowest useful level. Before handing off work, run the repository's formatter, lint, typecheck, unit tests, integration tests, and relevant build. Do not claim success for checks not run.

Prioritize tests for:

- interval boundaries and partial-day overlap;
- normal and special schedule resolution and historical pinning;
- A/B selection and per-date override;
- import parsing, validation, identity mapping, activation, and rollback/atomicity;
- assignment generation for full-day, partial-day, range, simultaneous absences, and non-class needs;
- invalid defaults remaining visible and unresolved;
- availability/ranking and explicit override paths;
- Plan Period Equivalent calculations, especially coverage spanning multiple PLAN blocks;
- split segments, gaps, overlaps, and exact parent bounds;
- message generation, editing, regeneration, and reopening a finalized plan;
- authentication, allowlist enforcement, and protected API routes.

Use the MVP's Required Acceptance Scenarios A–N as end-to-end acceptance criteria. Test with deterministic fixtures and a fixed school timezone/clock. For migrations, test both a fresh database and upgrades from the previous schema where feasible.

## Documentation discipline

Update `docs/architecture.md` in the same change when altering component boundaries, persistence or identity strategy, schedule resolution, import/activation semantics, derived-calculation rules, environment/deployment shape, or a recorded tradeoff. Add concise comments only where code cannot express a domain reason.

Update setup/deployment documentation whenever bindings, variables, migrations, seed data, or commands change. If implementation intentionally departs from the MVP spec, do not silently document the departure as fact: call it out for product review.
