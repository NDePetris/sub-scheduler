# Core workspace redesign — issue #51

## Implementation and design disposition

Implemented the approved **Concept A — Comparison ledger** within the existing sidebar and modal drawer. No permanent two-pane workspace or scheduling-rule change was introduced.

- The Daily Sub Plan uses proportional columns and a contained overflow region. Responsibility type now sits beneath the description with room metadata, freeing space for Assigned and Status at 1024px. Filtering and sorting retain their existing projection logic.
- The drawer uses a continuous responsive width (`520px + 15.625vw`, capped by the viewport and 800px): 680px at 1024px and 720px at 1280px. Need identity and Default provenance remain above the scrolling decision body; candidate-source controls and secondary alternate routes remain outside it.
- The semantic candidate table displays API ordering, availability source, current/added/projected Plan Periods Lost, warnings, and direct actions. Missing values remain dashes; School Sub adds zero PLAN burden. Calculation explanations are expandable.
- Split coverage has a compact summary, labelled adjacent boundaries, programmatic active selection, and one active candidate table. Inactive segment selections and conflict/incomplete states remain available in the summary. Interval requests can recover without discarding the draft.
- Finalized drawers clearly explain read-only state, disable Clear Resolution, and omit editing routes. Touched presentation uses **Intentionally Uncovered**.

There are no departures from the approved Concept A structure. Grouping responsibility type with its description is the table-fit implementation choice.

## Populated visual validation

Used `tests/fixtures/core-workspace.json`, deterministic fictional data, and a local Vite preview in headless Microsoft Edge. The browser harness intercepted API requests with fixture responses; no production data or services were used. These screenshots validate client presentation and interaction, while the repository integration suite verifies server/domain behavior.

Both **1280×800** and **1024×800** were exercised with two simultaneous absences, assigned and unresolved rows, valid and invalid Defaults, School Sub/PLAN/Admin/open-time candidates, differing workloads and a threshold warning, searchable Other Staff, conflict acknowledgement, split editing, instructional Intentionally Uncovered acknowledgement, and finalized read-only controls. Stress captures add 60 fictional candidates with long names.

Browser assertions passed for:

- document width equal to viewport width and visible Time/Responsibility/Assigned/Status headers;
- exact target drawer widths and stable need-context bounds while the decision body scrolls;
- invalid Default identity and reason together;
- Other Staff access and search after scrolling the stress list;
- direct conflict review followed by explicit Assign Anyway;
- one split candidate table, selections preserved across interval switching, and conflict visibility in the inactive summary;
- one split override acknowledgement and the existing split payload;
- instructional uncovered acknowledgement;
- disabled finalized Clear Resolution and absent editing routes;
- no browser runtime errors.

Automated UI regressions additionally cover direct assignment, alternate-resolution payloads, type-specific values, unknown calculation/workload warnings, interval boundary changes and structural validation, add/remove segments, filters/sort preservation, candidate request failures, revision-driven shared-duty candidate refresh, obsolete response rejection, and split retry preserving selections.

## Visual evidence

| Surface | 1280px | 1024px |
| --- | --- | --- |
| Before: working table | [Capture](core-workspace/before-table-1280.png) | [Capture](core-workspace/before-table-1024.png) |
| After: working table | [Capture](core-workspace/after-table-1280.png) | [Capture](core-workspace/after-table-1024.png) |
| Before: drawer | [Capture](core-workspace/before-drawer-1280.png) | [Capture](core-workspace/before-drawer-1024.png) |
| After: invalid Default and ledger | [Capture](core-workspace/after-drawer-1280.png) | [Capture](core-workspace/after-drawer-1024.png) |
| Valid Default | [Capture](core-workspace/after-valid-default-1280.png) | [Capture](core-workspace/after-valid-default-1024.png) |
| Conflict review / Other Staff | [Capture](core-workspace/after-conflict-1280.png) | [Capture](core-workspace/after-conflict-1024.png) |
| Split draft | [Capture](core-workspace/after-split-1280.png) | [Capture](core-workspace/after-split-1024.png) |
| Intentionally Uncovered | [Capture](core-workspace/after-uncovered-1280.png) | [Capture](core-workspace/after-uncovered-1024.png) |
| Long-list stress | [Capture](core-workspace/after-stress-1280.png) | [Capture](core-workspace/after-stress-1024.png) |
| Finalized | [Capture](core-workspace/after-finalized-1280.png) | [Capture](core-workspace/after-finalized-1024.png) |

## Impeccable finishing and hardening

An independent reviewer inspected all 16 after captures, representative before captures, changed source, and regression coverage. The first disposition identified two P2 recovery issues: stale shared-duty candidates after retained-drawer mutations, and missing split-candidate retry. Both were corrected and regression-tested. The reviewer scored both **resolved**, with a scoped **ship** disposition subject to repository checks.

The detector reported only incumbent 9–11px type advisories in shared-duty, sorting, Full Schedule, and communication code. The new ledger introduced no detector finding. These existing systemic treatments were not used to expand #51.

Documentation disposition: **No changes to DESIGN.md or its sidecar.** Checked PRODUCT.md, DESIGN.md, `.impeccable/design.json`, `src/styles.css`, shared Button/Badge primitives, and the changed workspace components. The documentation subagent was unavailable due to a usage limit; the documentation check was completed locally.

- Palette: existing Apple Green/Deep Moss actions, neutral surfaces, semantic amber/red.
- Type: existing compact 12–16px working hierarchy and 24px page-title ceiling.
- Layout: existing laptop-first sidebar shell and Work-in-View rule.
- Surfaces: existing Flat-by-Default borders and overlay-only shadows.
- Interaction: existing contrast-safe controls and explicit Decision Clarity labels.

No task-specific composition was promoted to a global rule; incumbent small-type advisories were not canonized or repaired.

## Related work retained

- #45: systemic modal initial focus, focus containment, Escape and focus restoration; A/B and broader selection semantics.
- #48: summary-count language/emphasis and cause-specific empty states; terminology in the redesigned workflow is addressed here.
- #49: Absences-route entry, message saved/copied feedback, finalized communication controls.
- #50: Full Schedule labels, sticky staff identity, sort/legend clarity, zoom and shell overflow investigations.

No formal screen-reader, forced-colors, physical-device, or full modal keyboard-conformance claim is made. New comparison/segment/search/alternate controls use semantic, labelled keyboard-operable native controls and visible focus styles; systemic modal behavior remains #45.

## Automated verification

`npm run check` completed successfully on 2026-10-08:

- Prettier formatting check: passed.
- ESLint: passed.
- TypeScript project build/typecheck: passed.
- Unit tests: 135 passed across 22 files.
- Worker/D1 integration tests: 89 passed across 14 files.
- Worker and client production builds: passed.

Focused command: `npx vitest run tests/unit/core-workspace.ui.test.tsx tests/unit/sub-plan-presentation.test.ts tests/unit/schedule-ui-source.test.ts --config vitest.config.ts` — 44 tests passed across 3 files. The full check subsequently covered the final test fixture/type corrections.

Reviewed the final diff: no domain module, Worker, API contract, schema/migration, ranking, workload calculation, or persistence changes. The shared presentation helper changes are terminology only. No production deployment or merge was performed.

## Recommended pull request

**Title:** `feat: redesign Daily Sub Plan and Resolve Sub Need`

**Description:**

Daily Sub Plan clipped Assigned and Status on laptop screens, while resolving needs required scrolling away from the need and comparing inconsistent candidate cards. Implement the approved Comparison ledger with flexible table columns, a wider modal drawer, persistent need/Default context and alternate routes, aligned candidate evidence, and one active split interval picker. Preserve administrator acknowledgements and server/domain contracts; make finalized Assignment controls read only.

Validated populated fictional scenarios at 1280×800 and 1024×800, including long lists, invalid Defaults, conflicts, split draft preservation and finalized state. Added interaction/freshness/recovery regressions. `npm run check` passes (135 unit tests, 89 integration tests, formatting/lint/typecheck/build). Independent Impeccable review scored both hardening findings resolved. See this validation record for before/after evidence and scope limitations.

Closes #51. Related epic #43; systemic follow-up remains in #45, #48, #49 and #50.
