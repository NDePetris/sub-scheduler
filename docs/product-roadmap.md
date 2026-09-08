# School Sub Planning Product Direction

## Current state

The administrator-facing core workflow is production-capable:

**Schedule → Date → Absence → Default Sub Plan → Resolve Assignments → Final Communication**

Current work emphasizes operational reliability, deployment and administration, regression
feedback, and incremental workflow expansion. [`mvp-spec.md`](mvp-spec.md) remains the original
baseline for core behavior and acceptance expectations where applicable; this document records
current product direction that may intentionally extend beyond that baseline.

## Near-term direction

Likely areas for focused, approved work include operational and deployment reliability;
administrator regression fixes and usability; school calendar administration (including A/B,
non-school, and Special Schedule expectations); administrator reporting; Default Sub Plan
administration; application/settings administration; justified maintainability or refactor
work; and targeted automated regression coverage and CI. This is direction, not an issue
backlog or blanket authorization for immediate implementation.

## Future possibilities

Teacher-facing absence submission, personalized coverage visibility, targeted notifications,
and integrations are possible future extensions only. Each requires explicit product approval
and may require new authorization and workflow architecture.

## Durable boundaries

- Administrators remain authoritative for coverage decisions.
- The product stores no student-level information.
- Behavior remains explainable and auditable, with historical operational facts preserved.
- Keep the scope focused on teacher coverage rather than becoming a general-purpose SIS or
  school-management system.
- Prefer explicit workflows and deterministic rules over opaque AI scheduling or optimization
  unless product direction intentionally changes.
