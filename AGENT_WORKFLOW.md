# Engineering Agent Workflow

This file defines the default operating harness for AI-assisted engineering work. It is
intentionally project-agnostic so it can be copied into other repositories. Repository-level
`AGENTS.md` files may add stricter domain, privacy, architecture, and validation rules.

## Instruction precedence

1. Follow explicit user instructions for the current task.
2. Follow the repository's `AGENTS.md` and other documented domain contracts.
3. Follow this workflow as the default operating model.

When instructions conflict, prefer the more specific and more conservative rule. Do not
silently weaken privacy, product/data-integrity, or validation requirements.

## Default execution profile

Use the smallest capable model and reasoning level for the task.

When these profiles are available in the current Codex environment:

- **Terra Medium** is the default for bounded implementation, tests, small bug fixes,
  analytics work with an established contract, and routine repository changes.
- **Terra High** is appropriate when the task is still bounded but involves difficult
  debugging, multiple interacting code paths, or meaningful ambiguity.
- **Sol High** is reserved for genuinely difficult architecture, product/domain-semantic
  decisions, broad refactors, milestone-level verification, or problems where stronger
  reasoning is likely to materially improve correctness.
- Use a lighter model only for truly mechanical edits where reasoning needs are minimal.

Do not escalate models merely because the task is important. State the concrete reason for
using a stronger model.

## Scope discipline

- Implement the smallest coherent unit that can be built and tested independently.
- Do not broaden a task into cleanup, refactoring, UI work, or adjacent roadmap items unless
  they are required for correctness.
- Prefer stable existing contracts and helpers over parallel implementations.
- Do not perform repeated repository-wide exploration after the relevant architecture and
  contract are already known.
- If a task reveals a separate issue, report it and keep it out of scope unless it blocks the
  requested work.

## Git workflow

- Start normal development work from an up-to-date `main` unless the task explicitly targets
  an existing feature branch.
- Use a feature/fix/chore branch before editing. Do not make normal development commits
  directly on `main`.
- Do not silently stack unrelated work on an unmerged branch. Normally wait for a required
  predecessor to merge; intentionally create dependent/stacked work only when explicitly
  requested or clearly justified, and clearly report the dependency and branch relationship.
- Keep commits coherent and reviewable.
- Do not merge to `main` unless the user explicitly asks for the merge.
- At completion, report branch, commit SHA/message, and working-tree status.

## Subagent and review policy

Subagents are optional tools, not a default ceremony.

- Do not launch preliminary subagents for a well-specified bounded implementation.
- Use parallel investigation only when the task genuinely decomposes into independent,
  non-overlapping questions whose answers are needed before implementation.
- Prefer one primary implementation pass and, when justified, at most one focused read-only
  final reviewer.
- Give the reviewer a narrow checklist tied to the task's actual risks.
- Do not perform a second broad repository review after a focused review unless a real issue
  justifies it.

## Validation strategy

- Run targeted tests while implementing.
- Run the required full repository validation once at the end of a successful implementation.
- After a late change that could invalidate completed validation, rerun the affected focused
  checks and the full suite as appropriate; do not repeatedly run the entire suite after
  every edit.
- Run lint/static checks and compilation/type checks required by the repository.
- Run a diff/whitespace check such as `git diff --check` where applicable.
- Inspect the final diff and working tree before completion.
- Never describe a fallback command as equivalent to a required tool invocation if it was
  not actually run.

## Manual-validation gate

Machine validation is preferred, but not every change can be proven synthetically.

Auto-commit when all of the following are true:

- the implementation is machine-verifiable;
- automated validation passes;
- no domain-semantic uncertainty remains;
- no private or user-only validation is required;
- the final diff contains only intended changes.

Touching UI does not by itself require stopping before commit. Stop before commit and tell
the user exactly what to validate only when meaningful evidence cannot adequately be obtained
through available machine validation. Common examples include:

- changes to ingestion or source-data normalization that depend on real export shape;
- changes to business classification or other domain semantics that synthetic
  fixtures cannot fully reconcile;
- visual/layout behavior requiring human inspection, or complex interactive behavior not
  covered by available automated tests;
- environment/deployment behavior that cannot be validated in the agent environment.

After the user reports successful validation, the correction may be committed on the
existing feature branch.

## Privacy and sensitive-data boundary

Treat local/private data as outside model context unless the user explicitly authorizes its
use and repository rules permit it.

- Prefer committed synthetic/example fixtures for implementation and automated tests.
- Do not read, print, summarize, upload, or commit private datasets, credentials, secrets,
  private mappings, or user-specific source files merely because they are accessible in the
  local environment.
- If private reconciliation is useful, provide a command or script for the user to run
  locally themselves.
- Design manual validation output to be aggregate/minimal and avoid raw records or sensitive
  labels.
- Never make CI depend on private data.
- Repository `AGENTS.md` may impose a stricter prohibition; follow it.

## Error and uncertainty handling

- Surface malformed or ambiguous data instead of silently dropping it.
- Fail loudly when a supplied scope/calendar/key set would discard facts unexpectedly.
- Preserve existing semantics unless the task explicitly authorizes a change.
- If a review finds a blocker, correct it before declaring PR readiness.
- Prefer a small explicit exception or validation error over a speculative general-purpose
  abstraction.

## Completion report

Keep completion reports concise but decision-useful. Include:

- what changed and why;
- files changed;
- tests/checks run and results;
- focused reviewer result, if one was used;
- reconciliation or invariant results relevant to the task;
- privacy confirmation;
- manual validation required or completed;
- branch and commit status;
- unresolved issues or deliberate deferrals;
- recommended next roadmap unit.

Do not claim PR readiness when a known blocker or required manual validation remains.
