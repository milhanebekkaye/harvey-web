# Guided Tour

A one-time, spotlight-style overlay tour shown on the dashboard after a user's first schedule generation.

---

## Overview

The tour walks users through 3 key parts of the dashboard:

| Step | Target (`data-tour`) | Tooltip side | What it explains |
|------|---------------------|-------------|-----------------|
| 1 | `active-task` | left | The expanded current task card |
| 2 | `chat-sidebar` | right | The Harvey chat sidebar |
| 3 | `ask-harvey-button` | top | The per-task "Ask Harvey" button |

After step 3 the tour completes and the user flag is persisted.

---

## Files

| File | Role |
|------|------|
| `src/components/dashboard/GuidedTour.tsx` | The overlay component |
| `src/app/dashboard/page.tsx` | Fetches tour status; renders `<GuidedTour>` |
| `src/app/api/user/me/route.ts` | Returns `has_completed_tour` (GET) |
| `src/app/api/user/tour-complete/route.ts` | Sets `has_completed_tour = true` (PATCH) |
| `src/prisma/schema.prisma` | `User.has_completed_tour Boolean @default(false)` |

---

## Scroll-into-view behaviour

Before measuring a target's `getBoundingClientRect`, the component calls:

```js
element.scrollIntoView({ behavior: 'smooth', block: 'center' })
```

Then waits **600ms** for the scroll animation to settle before sampling the rect. This ensures Step 3 (`ask-harvey-button`) is fully in view even when it starts below the fold. The `calculateCutout` function returns a cleanup callback so pending timeouts are always cancelled on unmount or step change.

The resize handler skips the scroll and remeasures immediately (`{ scroll: false }`).

---

## Entrance animation

`isVisible` state is `false` when `cutoutRect` is null (between steps). Once `cutoutRect` is set, a 50ms delay flips `isVisible` to `true`, triggering:

- `opacity: 0 → 1`
- `transform`: 8px slide from the direction of the arrow → `translate(0,0)`

This produces a subtle fade + slide per step without any external animation library.

---

## Spotlight mechanism

```
┌─────────────────────────────── viewport ───────────────────────────────┐
│  ████████████████████████████████████████████████████████████████████  │
│  ████████████████████████████████████████████████████████████████████  │
│  ████   z-index 60 ── box-shadow 9999px rgba(0,0,0,0.6)   ██████████  │
│  ████   ┌─────────────────────────────────────────────┐   ██████████  │
│  ████   │  target element (cutout — fully visible)    │   ██████████  │
│  ████   └─────────────────────────────────────────────┘   ██████████  │
│  ████████████████████████████████████████████████████████████████████  │
└────────────────────────────────────────────────────────────────────────┘
```

- A `position: fixed` div is sized and positioned exactly over the target element (with 8px padding on each side).
- Its `boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)'` spreads a dark overlay everywhere *except* the cutout area.
- `pointerEvents: none` on the cutout so the underlying element is technically interactive (just visually highlighted).
- A separate full-screen `z-index: 59` blocker captures all click events during the tour.
- The cutout div uses `transition: all 0.4s ease` to animate between steps.

---

## Tooltip positioning

```
computeTooltipStyle(position, cutoutRect)
```

| `position` | Horizontal | Vertical |
|-----------|------------|---------|
| `'left'`  | right edge at `cutoutRect.left - 16` | vertically centred with cutout |
| `'right'` | left edge at `cutoutRect.right + 16` | vertically centred with cutout |
| `'top'`   | horizontally centred with cutout | bottom edge at `cutoutRect.top - 16` |

All positions are clamped to a minimum of 16px from each viewport edge.

---

## Tour flag lifecycle

```
User signs up
  → has_completed_tour = false  (DB default)

Dashboard mounts
  → GET /api/user/me
  → if has_completed_tour === false → showTour = true

User clicks "Got it" on step 3
  → handleTourComplete()
  → showTour = false (immediate UI update)
  → PATCH /api/user/tour-complete (fire-and-forget)
  → has_completed_tour = true in DB

Next dashboard visit
  → GET /api/user/me returns has_completed_tour = true
  → Tour not shown
```

---

## Adding steps

Edit the `TOUR_STEPS` array in `GuidedTour.tsx`. Add a `data-tour="..."` attribute to the target DOM element (Step 2 pattern). No other changes required.

---

## Step history

| Step | What was built |
|------|---------------|
| Step 1 | `has_completed_tour` DB field + API endpoints |
| Step 2 | `data-tour` attributes on 3 DOM elements |
| Step 3 | `GuidedTour` component + dashboard integration |
| Step 4 | Paywall overlay (upcoming) |
| Step 5 | TBD |
