# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are administrators at small K–12 schools working from laptop browsers. They prepare daily teacher coverage from authoritative schedules, staff absences, school preferences, staff availability, and recent workload information.

## Product Purpose

School Sub Planning turns schedules, absences, staff availability, and Default Sub Plans into auditable daily Assignments and copyable final communication. It exists to make routine coverage substantially faster while keeping administrators in control of every scheduling decision.

Success means an administrator can produce a practical daily Sub Plan without manually cross-referencing the source schedule spreadsheet and Default Sub Plan document for ordinary cases, while unusual circumstances remain clear and manageable.

## Positioning

The product combines the school's authoritative, effective-dated schedule with explicit absences, Default Sub Plans, availability, and workload context in one administrator-controlled workflow. Recommendations and warnings support a decision; they never silently make one. Historical plans retain the exact schedule and resolution context that applied when they were created.

## Operating Context

The critical workflow is:

**Schedule → Date → Absence → Default Sub Plan → Resolve Assignments → Final Communication**

Administrators import and review school schedule spreadsheets, select the planning date and A/B designation, record full-day or partial-day absences, resolve generated Needs Sub Assignments, review an editable message, and copy that message into the school's normal communication workflow. Special Schedules may replace the normal effective-dated schedule for one date.

The app is an internal school operations tool protected by verified identity and an administrator allowlist. It is independently deployed on Cloudflare and uses school-specific configuration.

## Capabilities and Constraints

- Preserve the product terms **Sub Plan**, **Default Sub Plan**, **Needs Sub**, **Assignment**, **Assigned**, **Unresolved**, **School Sub**, and **Plan Periods Lost**.
- Administrators are the final authority. Defaults, candidate rankings, warnings, and generated communication are explainable decision support.
- Conflicting assignments require an explicit **Assign Anyway** acknowledgement. Invalid defaults remain visible and Unresolved rather than being silently replaced.
- Availability and workload are advisory. Only sacrificed PLAN time contributes to Plan Periods Lost.
- Split coverage uses timed child segments; eligible non-class responsibilities may be **Intentionally Uncovered**.
- Edited generated message text is independent of structured plan data. **Regenerate** rebuilds it from current plan data.
- Finalized plans may be reopened, with audit timestamps and actors preserved.
- Store no student names, IDs, rosters, attendance, grades, or other student-level information.
- Remain focused on administrator-controlled teacher coverage rather than becoming a general-purpose school information system.
- Do not introduce opaque AI scheduling or global schedule optimization without explicit product direction.
- Teacher-facing workflows, lesson or Sub Plan uploads, automatic communication, calendar synchronization, richer reporting, mobile optimization, and arbitrary recurring Word-document interpretation require explicit product approval.
- Production school timezone, identity headers, staff mappings, and final Default Sub Plan content remain school-supplied configuration; future work must not guess them.

## Brand Commitments

- Product name: **School Sub Planning**.
- Apple Green `#7EA243` is the brand and action accent, not a schedule category color.
- The interface is compact and laptop-first.
- A configurable school name and logo may identify the deployment; the neutral graduation-cap mark is the fallback asset at `public/app-mark.svg`.

## Evidence on Hand

- `docs/product-roadmap.md` records the approved current direction and durable product boundaries.
- `docs/mvp-spec.md` records the baseline requirements, workflow, and acceptance scenarios A–N.
- `docs/architecture.md` records technical boundaries and domain behavior.
- `README.md` documents the implemented end-to-end workflow and production operating model.
- `docs/ui-foundation-pass-1.md` records the current shared UI accessibility and contrast decisions.
- The repository contains deterministic fictional seed data and test fixtures. It contains no approved production staff mappings, Default Sub Plans, school timezone, testimonials, benchmarks, or claims; future work must not fabricate them.

## Product Principles

1. Keep administrators in control of every scheduling decision.
2. Make routine coverage fast while keeping exceptions explicit, explainable, and reversible.
3. Preserve historical operational facts and an auditable decision trail.
4. Use authoritative school data and deterministic rules; never infer identities from display names or browser defaults.
5. Keep the product school-specific where needed and narrowly focused on teacher coverage.

## Accessibility & Inclusion

Use accessible components and preserve keyboard operation, visible focus, descriptive labels, and status cues that include text or an icon in addition to color. Shared text and control treatments must maintain the accessible contrast established by the UI foundation. A formal WCAG conformance target has not been confirmed.
