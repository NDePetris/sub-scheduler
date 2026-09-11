# UI foundation pass 1

This pass standardizes shared button, badge, and field behavior without changing
screen layouts, workflow, or schedule semantics.

## Contrast record

| Treatment | Previous colors | Previous contrast | Updated colors | Updated contrast |
| --- | --- | ---: | --- | ---: |
| Primary button text | `#FFFFFF` on `#7EA243` | 2.94:1 | `#FFFFFF` on `#557129` | 5.56:1 |
| Success/status text | `#5C7B2D` on `#EFF5E7` | 4.37:1 | `#557129` on `#EFF5E7` | 5.00:1 |

Ratios are approximate WCAG relative-luminance contrast calculations for
normal-size text. Apple Green (`#7EA243`) remains the brand accent; shared
interactive and success-text treatments use the darker accessible token.

## Deliberate deferrals

- Card, panel, and screen-specific form-container spacing remains a Pass 2
  concern because these patterns are not yet consistently composed from one
  shared primitive.
- Calendar and schedule-specific semantic treatments remain unchanged.

## Validation record

Manual visual validation of the Pass 1 shared UI foundation changes passed.
Targeted UI primitive tests and `git diff --check` also pass.

The repository-wide `npm run check` remains blocked by 54 pre-existing
Prettier warnings. Its lint stage likewise retains the seven existing errors
and one warning in `calendar-administration.tsx`; none are introduced by this
pass and they are intentionally out of scope.
