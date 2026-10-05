---
name: School Sub Planning
description: A calm, compact operations interface for daily school coverage work.
colors:
  apple-green: '#7ea243'
  deep-moss: '#557129'
  pale-leaf: '#eff5e7'
  warm-paper: '#f5f6f4'
  surface: '#ffffff'
  foreground: '#262a25'
  muted: '#f1f2ef'
  muted-foreground: '#687067'
  border: '#dfe3dd'
  warning: '#d08a18'
  warning-dark: '#7a4a05'
  warning-soft: '#fff7e5'
  danger: '#c4473a'
  danger-dark: '#8d2d24'
  danger-soft: '#fff0ee'
typography:
  display:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '24px'
    fontWeight: 700
    lineHeight: 1.333
    letterSpacing: '-0.025em'
  headline:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '20px'
    fontWeight: 700
    lineHeight: 1.4
  title:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '16px'
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '14px'
    fontWeight: 400
    lineHeight: 1.429
  control:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '14px'
    fontWeight: 600
    lineHeight: 1.429
  label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: '12px'
    fontWeight: 600
    lineHeight: 1.333
    letterSpacing: '0.025em'
rounded:
  md: '6px'
  lg: '8px'
  xl: '12px'
  full: '9999px'
spacing:
  xs: '4px'
  sm: '8px'
  md: '12px'
  lg: '16px'
  xl: '20px'
  2xl: '24px'
components:
  button-primary:
    backgroundColor: '{colors.deep-moss}'
    textColor: '{colors.surface}'
    typography: '{typography.control}'
    rounded: '{rounded.md}'
    padding: '0 14px'
    height: '36px'
  button-secondary:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.foreground}'
    typography: '{typography.control}'
    rounded: '{rounded.md}'
    padding: '0 14px'
    height: '36px'
  field:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.foreground}'
    typography: '{typography.body}'
    rounded: '{rounded.md}'
    padding: '0 10px'
    height: '36px'
  badge-neutral:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.muted-foreground}'
    typography: '{typography.label}'
    rounded: '{rounded.full}'
    padding: '2px 8px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.lg}'
    padding: '20px'
---

# Design System: School Sub Planning

## Overview

**Creative North Star: "School Operations Desk"**

The interface should feel like a well-kept administrator's desk at the start of a busy school day: calm enough to reduce pressure, compact enough to keep related facts in view, and utilitarian enough that every control earns its place. Warm neutral surfaces keep the workspace approachable, while green accents connect actions and active states to the product identity without turning the screen into decoration.

The system favors trustworthy structure over spectacle. Thin borders, steady alignment, short labels, and predictable controls let administrators scan quickly and act with confidence. Its incumbent character is **calm, compact, utilitarian, warm, and trustworthy**.

The descriptive palette names capture the current implementation; they are not permanent brand constraints. During an overhaul, semantic roles and contrast treatments may evolve when evidence supports a clearer or more accessible system.

**Key Characteristics:**

- Compact laptop-first workspaces with clear operational hierarchy.
- Warm gray-green neutrals and one restrained accent family.
- Flat, border-led surfaces with shadow reserved for overlays.
- Direct controls, short labels, and visible state language.
- Accessible contrast and status cues that never depend on color alone.

## Colors

The palette uses a muted green family against warm paper and white surfaces, with amber and red reserved for explicit operational meaning.

### Primary

- **Apple Green:** The recognizable brand accent for small indicators, selected emphasis, and the broader action family.
- **Deep Moss:** The contrast-safe emphasis color for filled primary actions, active text, and strong success states.
- **Pale Leaf:** A quiet tinted surface for selected navigation, positive status, and brand-adjacent grouping.

### Secondary

- **Operational Amber:** Warning borders, warning icons, and workload attention states.
- **Clear Red:** Destructive actions, errors, and blocking conflict states.

### Neutral

- **Warm Paper:** The main application canvas behind operational panels.
- **Clean Surface:** White cards, drawers, the sidebar, and the sticky application header.
- **Charcoal Ink:** Primary text and high-emphasis values.
- **Quiet Gray:** Secondary copy, helper text, and inactive navigation.
- **Soft Utility Gray:** Low-emphasis fills and hover surfaces.
- **Hairline Gray:** Dividers, card outlines, and field borders.

### Named Rules

**The Evolving Token Rule.** Apple Green, Deep Moss, Pale Leaf, and Warm Paper are descriptive names for the incumbent tokens. Preserve their current meaning when extending this system, but allow an explicitly approved overhaul to improve semantic roles or contrast.

**The Contrast-Safe Action Rule.** Use the darker green treatment for filled controls with small white text. Raw Apple Green remains an accent unless the foreground treatment passes the required contrast.

**The Semantic Color Rule.** Amber communicates warning and red communicates danger. Never reuse those colors as decorative categories.

## Typography

**Display Font:** Inter with the system sans-serif stack
**Body Font:** Inter with the system sans-serif stack

**Character:** The single-family system is plainspoken and efficient. Weight and scale establish hierarchy; typography does not compete with the operational content.

### Hierarchy

- **Display** (700, 24px, 32px line height): Page titles and primary workspace headings, with slightly tightened tracking.
- **Headline** (700, 20px, 28px line height): Major subsection or placeholder titles.
- **Title** (700, 16px, 24px line height): Card and section headings.
- **Body** (400–600, 14px, 20px line height): Controls, descriptions, table content, and routine operational copy.
- **Label** (500–600, 12px, 16px line height): Eyebrows, badges, metadata, and compact supporting detail. Eyebrows may use uppercase with wide tracking.

### Named Rules

**The Operational Scale Rule.** Keep the hierarchy compressed: 24px is the normal page-title ceiling, and most working content stays between 12px and 16px.

**The Weight-Before-Size Rule.** Prefer weight and spacing to large jumps in type size when raising emphasis inside dense workspaces.

## Layout

The desktop shell uses a fixed 240px sidebar and a 64px sticky header. Main content begins with 24px outer padding and typically sits inside centered containers ranging from 768px for settings to 1152px for general administration, with the primary Sub Plan workspace allowed to reach 1500px.

Spacing follows a compact 4px base rhythm. Eight, 12, 16, 20, and 24px gaps and padding values carry most compositions. Cards use 16–20px internal padding; controls cluster at 8–12px gaps. Dense filters and schedule controls may use smaller steps where scanability remains intact.

The incumbent shell has a 1024px minimum width and no complete mobile navigation pattern. Small breakpoint grids may collapse within individual pages, but mobile optimization is not part of the current system.

**The Work-in-View Rule.** Prefer arrangements that keep dates, status, filters, and the current decision area visible together on a laptop screen.

## Elevation & Depth

The system is flat, border-led, and minimally shadowed. White surfaces separate from Warm Paper through a one-pixel Hairline Gray border. Selected and semantic regions gain shallow tinted fills rather than elevation.

Shadows appear when a surface genuinely crosses layers: drawers use strong edge shadows, small floating controls may use a restrained shadow, and modal backdrops use a translucent black scrim. Resting cards and navigation remain shadowless.

### Shadow Vocabulary

- **Subtle Lift** (`0 1px 2px 0 rgb(0 0 0 / 0.05)`): Small controls or compact floating affordances only.
- **Drawer Edge** (`0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): Right-side drawers and major transient panels.
- **Modal Scrim** (`rgb(0 0 0 / 0.20–0.25)`): Separates a modal or drawer decision from the underlying workspace.

### Named Rules

**The Flat-by-Default Rule.** A surface at rest uses a border and tonal contrast, not a shadow. Add depth only when the interaction introduces a real layer.

## Shapes

The form language is gently squared and practical. Buttons, fields, navigation rows, and small controls use a 6px radius. Cards and primary containers use an 8px radius. Larger 12px corners appear sparingly on prominent overlay or schedule compositions. Badges are fully pill-shaped.

Borders are thin and quiet. Dashed borders signal an empty, unconfigured, or deliberately provisional region. The system avoids decorative clipping and exaggerated rounding.

**The Radius Ladder Rule.** Use 6px for controls, 8px for containers, 12px only for unusually prominent compositions, and a full pill only for compact status or filter labels.

## Components

Components feel restrained, direct, and dependable. Their states change color or border treatment without dramatic movement.

### Buttons

- **Shape:** Gently rounded rectangle (6px) with a 36px default height and 14px horizontal padding.
- **Primary:** Deep Moss fill, white semibold text, and no resting border.
- **Secondary:** White fill, Charcoal Ink text, and a Hairline Gray border.
- **Ghost:** Transparent at rest with Quiet Gray text; the hover state gains Soft Utility Gray and darker text.
- **Destructive:** Clear Red fill with white text and a darker red hover state.
- **Hover / Focus:** Hover changes color without displacement. Keyboard focus uses a two-pixel translucent green ring with a two-pixel offset.
- **Disabled:** Removes pointer interaction and reduces opacity to 50%.

### Chips

- **Style:** Fully rounded, one-pixel bordered labels with 12px medium text and compact 2px by 8px padding.
- **State:** Neutral chips use white and Quiet Gray; success uses Pale Leaf and Deep Moss; warnings and danger use their dedicated soft/background pairs.

### Cards / Containers

- **Corner Style:** Gently rounded (8px).
- **Background:** Clean Surface on Warm Paper.
- **Shadow Strategy:** None at rest; rely on the one-pixel border.
- **Border:** Hairline Gray.
- **Internal Padding:** Usually 16px or 20px, with 12px by 16px for compact metric cards.

### Inputs / Fields

- **Style:** White, 36px tall, one-pixel Hairline Gray border, 6px radius, and 10px horizontal padding.
- **Focus:** Apple Green border plus a two-pixel translucent green ring.
- **Error / Disabled:** Error messaging uses dark red text near the field. Disabled fields use Soft Utility Gray, Quiet Gray text, and reduced opacity.

### Navigation

The primary navigation is a fixed left rail with 36px rows, 12px horizontal padding, 12px icon-to-label spacing, and 14px medium text. Inactive rows use Quiet Gray and gain a Soft Utility Gray hover surface. The active row uses Pale Leaf, Deep Moss text, and a small directional chevron. The current system has no mobile navigation treatment.

### Operational Metric Card

Compact metric cards use a white surface, Hairline Gray outline, 8px corners, and 12px by 16px padding. A quiet 12px label sits above a bold 20px or 24px value. Semantic warnings may tint the entire card softly, but counts and labels remain readable without color.

### Drawers

Drawers enter from the right over a 20–25% black scrim. They use a white surface, a sticky 64px header, a strong edge shadow, and compact 20px content padding. The drawer is reserved for focused decisions that need context from the underlying workspace.

**The Decision Clarity Rule.** Every state-changing control must pair its visual treatment with explicit action text, status text, or an icon with an accessible label.

## Do's and Don'ts

### Do:

- **Do** keep the current task, date, status, and next action visible together when space allows.
- **Do** use borders and quiet tonal fills to organize resting surfaces.
- **Do** use the Apple Green family sparingly for identity, selection, and action emphasis.
- **Do** use Deep Moss for small white-on-green controls when contrast requires the darker treatment.
- **Do** pair status color with text or an icon and preserve visible keyboard focus.
- **Do** keep routine controls near the 36px height and the 12–14px type range.

### Don't:

- **Don't** treat the descriptive token names as permanent constraints during an explicitly approved overhaul.
- **Don't** use raw Apple Green behind small white text without verifying contrast.
- **Don't** use brand green as a schedule category color.
- **Don't** add shadows to ordinary cards, tables, or navigation rows.
- **Don't** inflate the hierarchy with oversized display type or spacious marketing-page rhythms.
- **Don't** communicate warning, danger, Assigned, or Unresolved states through color alone.
