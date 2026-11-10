# Takt — DESIGN.md (tokens + rules)

## Tokens (`src/theme/tokens.ts`)
- `carbon: #0A0A0A` — text, primary fills, Missed pill, nav
- `cloud: #F6F5F2` — app background
- `paper: #FFFFFF` — raised cards only
- `butter: #F8E39A`, `mint: #4BBF8F`, `violet: #6A57C0`, `orchid: #C0468F`, `apricot: #F4A261`
- Category colors: Job carbon, Food apricot, Learning violet, Workout orchid, Gaming butter, Journaling mint, Sleep/Rest carbon, Project violet, Study butter, Custom apricot (cycle palette for new customs)
- Status: Complete mint, Progress apricot, Missed carbon + white text, Upcoming hatched cloud (diagonal hatch on cloud)
- Radii: card 28–36, chip/dock full pill (999)
- Font: Inter Tight — Regular 400, Medium 500, SemiBold 600 only. Headlines big + confident, percentages oversized light-weight numerals.
- Hairlines: carbon at 10–15% opacity only. No grey token, no slate, no blue-black, no grey text.
- Film grain: Skia noise or tiled PNG at ~4–6% opacity over whole app.
- Hatch: 45° diagonal stripes for "unfilled"/upcoming segments and hatched card accents.
- Icons: custom SVG, 1.75px stroke, rounded caps, carbon stroke on color fill.
- NO emoji anywhere (UI, notifications, copy).

## Rules
- Today is center-aligned, one hero per screen, current task is the only saturated element.
- Big Done button bottom-center on Today hero. Black pill bottom nav, active tab filled black pill.
- Bar charts: white bars on butter card, active bar solid carbon.
- Heatmap: mono ramp via hatch density; category colors only when a filter is active.
- Every edit asks scope: "Today only" / "From today onwards" (Calendar adds "This weekday from today" under More). Today mode defaults to Today only.
- Undo/redo with toast on every edit.

## Layout rules (Fix 3 — the navbar overlap must never come back)
- ONE layout contract: `src/components/layout.tsx` (`LayoutProvider`,
  `useBottomInset()`, `useDockBottom()`). It measures the real navbar
  height (`onLayout` in the tab bar) + the real dock height (collapsed or
  expanded, reported by the Dock) + the safe-area bottom + a fixed 16dp gap
  (`LAYOUT_GAP`), and exposes the combined bottom inset everywhere.
- Every screen MUST use `<Screen>`, `<ScrollScreen>` or `<ListScreen>`.
  Never a raw `ScrollView` / `FlatList` / `SectionList` at screen level,
  and never a hand-written `paddingBottom` to clear the navbar/dock.
  Nested horizontal scrollers (chip rows, timeline strips) are the only
  exception. Enforced by `src/lib/__tests__/layoutContract.test.ts`.
- Floating elements (dock, toasts, undo bars, multi-select bar) position
  from the same context (`useBottomInset()` / `useDockBottom()`), never
  with hard-coded bottom values.
- The dock sits above the navbar by construction (`bottom: dockBottom`);
  the expanded grid also clears the navbar and the safe area.
- Verify every screen scrolled to the very end on small (360x640) and tall
  (412x915) viewports, dock collapsed and expanded. Device screenshots are
  not possible in this VM — verify on a real device before release
  (see KNOWN_ISSUES.md).

## Motion law (Fix 4 — navbar)
- Timing ONLY, `Easing.bezier(0.22, 1, 0.36, 1)` (`DECEL` in
  `src/theme/motion.ts`), ~300ms (`NAV_MS`). NO spring / overshoot / bounce
  anywhere in the nav — no `withSpring` remains in `src`.
- The active pill morphs: its x and width interpolate together on the UI
  thread, measured per tab via `onLayout`. Icons cross-fade outline →
  filled; labels reveal (opacity + small slide). Pressed tab scales to
  0.97 with timing; light haptic on tab change.
- Screen transitions: cross-fade + subtle 10px translate in the direction
  of travel (custom `sceneStyleInterpolator` + 280ms timing spec — the
  built-in 'shift' uses 50px, too far). Reduce-motion falls back to quick
  120ms fades. Total feedback under 400ms; tab screens stay mounted, so
  each keeps its scroll position.

## Selection law (Fix 1 — dock)
- Selection NEVER comes from a tap or a swipe. It takes a press-and-hold
  of `HOLD_MS = 300` (`src/theme/motion.ts`), cancelled by >8px of movement
  (`HOLD_CANCEL_PX`). While holding, the chip scales to 0.96 and a thin
  ring fills; a light haptic fires at activation. The ring is centered
  exactly on the icon (17dp from the node's left edge AND top, 3dp gap —
  see `RING_GEOMETRY` in `src/components/dockHelpers.ts`, tested). The
  ring's position is explicit constants, never `top: '50%'` (that resolves
  against the content-box height and sat the ring 6dp too high).
- The dock is a fixed row of the 3–4 most-used chips (usage-ordered, most
  important at both ends) with a drag handle; the collapsed container is
  transparent (no solid band over the content below). Swipe up on the
  dock/handle (or tap the handle) expands it into a drawer panel with all
  chips. The drawer's height is driven by measured heights mirrored into
  shared values (`rowHSV`/`gridHSV`/`handleHSV` — never refs: a worklet
  captures its closure at install time, so a ref reads its initial value
  forever and the drawer stays clipped to one row). Swipe down or tap outside collapses. A hold closes the drawer
  first, then: a category with subcategories opens the radial menu (Today),
  anything else starts a drag. While dragging, the section under the
  finger highlights; on Today the drop creates in the earliest empty slot.
- Radial subcategory flow (Today): hold a category with subs → options
  bloom → drag the pointer to highlight one → dwelling 450ms closes the
  drawer automatically and arms the drag → release drops it in.

## Calendar blocks (Fix 2)
- Blocks render adaptively by height (`variantForHeight`): tiny blocks
  (≤32dp) are never empty — they show "Title - 9:00" on one line; larger
  blocks add range, category icon, notes preview. Overlapping tiny blocks
  get side-by-side lanes (`assignLanes`).
- A tap opens a detail peek sheet (full title, range, duration, category,
  notes; edit / duplicate / delete / mark done / Select). Dragging and
  resizing need a 300ms hold first (haptic + lift), snap to 5 minutes with
  a haptic tick per snap, and ask scope afterwards ("Today only" /
  "From today onwards") with undo. Pinch zoom changes hour height
  48→240dp and is persisted in Settings.
- Gesture composition law (learned 2026-11-10 — drag/resize were dead on
  device): a LongPress and a manual-activation Pan MUST be
  `Gesture.Simultaneous(hold, pan)`, with the tap `Exclusive` against the
  pair. `Exclusive(hold, pan, tap)` lets the LongPress win at 300ms and
  cancel the Pan, so the drag never starts. Guarded by
  `blockCardWorklet.test.ts`.
- Pinch zoom must compose with the native scroll gesture
  (`Gesture.Native()` in the `outerGestures` Simultaneous group), or the
  ScrollView claims two-finger touches and the pinch never fires.

## Sheets (Fix 5)
- ONE shared `<Sheet>` for every drawer. It renders
  `GestureHandlerRootView` inside the Modal (that was the root cause of
  undraggable sheets), the handle + header always drag, and the body scroll
  and the sheet drag coexist (drag-down closes only when the inner scroll
  is at the top). Close past ~30% height or velocity >800px/s, timing
  240ms with `DECEL`; backdrop fades with the drag; hardware back and
  backdrop tap close.

## Auto-updater (Fix 6)
- Every CI release publishes `version.json` next to the APK
  (versionCode, versionName, apkUrl, sha256, sizeBytes, notes,
  publishedAt). The app checks on launch + foreground (≤ once/6h, manual
  check in Settings), compares versionCode, and offers a non-blocking
  update: sheet + Today banner + Settings row. "Later" suppresses 24h for
  that version; checks fail silently offline.
- Download in-app with progress + cancel; the file is verified by size +
  SHA-256 (pure-TS incremental hash, NIST-vector tested) before anything
  is offered to install. Verification is its own status (`verifying`,
  with progress) — the download bar must never sit frozen at 100% while
  the hash runs. The hash path is the hot loop: base64 decode via a
  char-code lookup table (never `indexOf` per char) and a reused message
  schedule + direct byte reads in compress (never a fresh array/DataView
  per block). Install goes through Android's own package
  installer via a FileProvider content URI; the one manual step is
  Android's own "allow installs from Takt" confirm, said once in the
  sheet. The downloaded APK is deleted after the app is replaced. After
  an update: a "What's new" card from the release notes + nudges
  rescheduled.
