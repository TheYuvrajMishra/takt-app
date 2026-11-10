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
- Paper texture: three different kinds, one per surface type
  (`PaperTexture` `kind`): cards and blocks get the FINE grain, buttons
  and dock nodes the COARSE chunky grain, sheets and drawers the LINEN
  weave. They must read as different materials, not the same speckle
  everywhere. Realistic shadows are ONE soft shadow per surface
  (`shadows.card` / `shadows.soft` / `shadows.lifted`): the earlier two
  nested shadows drew a dark line inside the card edge and read as a
  glitch, and the nesting shrink-wrapped full-width cards to half width.
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
- Screen transitions: a real slide (±56px) + fade in the direction of
  travel (custom `sceneStyleInterpolator` + 300ms timing spec). Reduce-motion falls back to quick
  120ms fades. Total feedback under 400ms; tab screens stay mounted, so
  each keeps its scroll position.
- Swipe between tabs: a one-finger horizontal swipe anywhere on the
  screen slides to the next / previous tab (Today → Calendar → Stats),
  with the same slide transition. The swipe Pan wraps the whole tab
  navigator; inner gestures win on their own targets (a block drag, a
  dock drag, a hold all activate first and cancel it), a mostly-vertical
  swipe is a scroll, and while the category drawer is open swipes stay
  with the drawer.

## Selection law (Fix 1 — dock)
- Selection NEVER comes from a tap or a swipe. It takes a press-and-hold
  of `HOLD_MS = 300` (`src/theme/motion.ts`), cancelled by >8px of movement
  (`HOLD_CANCEL_PX`). While holding, the chip scales to 0.96 and a thin
  ring fills; a light haptic fires at activation. The ring is centered
  exactly on the icon (17dp from the node's left edge AND top, 3dp gap —
  see `RING_GEOMETRY` in `src/components/dockHelpers.ts`, tested). The
  ring's position is explicit constants, never `top: '50%'` (that resolves
  against the content-box height and sat the ring 6dp too high).
- The dock is INVISIBLE until called for — there is no collapsed strip.
  Swipe up anywhere on the navbar (or on the small up-arrow bobbing
  above it, or tap the arrow) opens a drawer of ALL chips
  (usage-ordered, most important at both ends), CENTRE-ALIGNED — every
  wrapped row is centred, not left-flushed. The drawer is transparent
  (no solid panel over the content), its pills float on paper chips, and
  it sits 8dp above the navbar (`DRAWER_TO_NAV_GAP`). Swipe down on the
  drawer or tap outside closes it. The drawer's height is driven by the
  measured grid height mirrored into a shared value (`gridHSV` — never a
  ref: a worklet captures its closure at install time, so a ref reads its
  initial value forever and the drawer stays clipped to one row). A hold
  closes the drawer first, then: a category with subcategories opens the
  radial menu (Today and Calendar), anything else starts a drag. While
  dragging, the section under the finger highlights; on Today the drop
  creates in the earliest empty slot, on Calendar it creates at the drop
  position.
- A tap on a pill is a QUICK-ADD: it creates the category in the earliest
  empty slot (no subcategory — the hold + radial is for picking one) and
  closes the drawer. A pill must respond to a tap: with no tap action, a
  tap did nothing at all and the drawer read as dead (2026-11-10). The
  tap is a fast-failing `Gesture.Tap` (maxDuration 250ms, maxDistance
  10dp), Simultaneous with the hold/pan pair — NOT Exclusive: an
  Exclusive would block the Pan until the tap failed at 250ms, so the
  hold-progress ring would not start filling until then.
- A Pan that sits over tappable content MUST have an activation threshold
  on BOTH axes (`.minDistance(10)` on the sheet's body/header Pans and the
  dock closePan). A Pan with none activates on the tap's finger jitter
  and claims the touch, so every button under it stops responding — that
  is how every button inside a sheet went dead (2026-11-10). And a
  threshold on ONE axis only is not enough: the v23 fix used
  activeOffsetY, which guards Y, but a diagonal tap jitter with a
  horizontal component still activated the Pan, so the update sheet and
  the calendar create sheet stayed dead. A tap moves <10dp in any
  direction and falls through to the button; a real drag moves more.
- Radial subcategory flow (Today and Calendar), ONE continuous touch —
  hold (300ms) → subcategories bloom → slide the finger to one → hover it
  300ms (`RADIAL_HOVER_MS`) and the drag arms (ghost follows the finger)
  → release drops it in. No lift, no tap: the radial mounts mid-touch
  and a gesture that mounts mid-touch can never see the finger already
  down, so the dock node's Pan (which owns the touch from finger-down)
  forwards the positions and `useRadialDrag` owns the hover / dwell /
  attach machine; the radial itself is visual-only (`pointerEvents="none"`).
  Releasing while hovering (before the dwell) creates that subcategory
  immediately; releasing on empty space dismisses.

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
  48→240dp and is persisted in Settings; there is no zoom stepper in the
  header (pinch only). Resize has NO visible grip lines — the top/bottom
  edge zones resize, but the lines cluttered tiny blocks.
- Blocks carry a subtle paper grain (`PaperTexture`, 4%) and a soft resting
  shadow that deepens while lifted (`shadows.soft` → `shadows.lifted`).
- Pinch zoom is SMOOTH: the pinch writes a shared value (`hourHeightSV`)
  and the grid's layout reads it on the UI thread (hour-row heights,
  block tops/heights, now-line, container height) — NO React state
  update per frame, NO rounding during the gesture. The old code called
  setHourHeight every frame and re-rendered the whole calendar, which
  is what made the zoom step and lag. The state commits only on pinch
  end (commitZoom, rounded to the nearest even number, persisted).
- Opening the calendar focuses on NOW: on tab focus it scrolls so the
  current time sits ~1.5h below the top (only when today is the anchor).
  The old mount-only effect fired while the tab was inactive (no layout
  yet), so it opened at 00:00, and it used a hardcoded 64 for the hour
  height, so a pinched zoom scrolled to the wrong place.
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
  undraggable sheets). The handle + header drag to close (minDistance 10,
  both axes); backdrop tap and hardware back close. The body is a PLAIN
  React Native ScrollView with NO gesture on it — the body drag used to
  coexist with the scroll (drag-down closed only when the inner scroll
  was at the top), but that Pan sat above every button and swallowed
  taps, and two threshold tunings (v23, v25) did not restore them, so
  the bodyPan was removed entirely (2026-11-10). Do NOT re-add a Pan
  over the body; that is the dead-buttons bug coming back. v29 briefly
  removed ALL RNGH (including the header drag) after a buttons-dead
  report that came ~5 min after v27 published (almost certainly the old
  build); v31 restored the header drag on the user's ask, keeping the
  body Pan removed. Close past ~30% height or velocity >800px/s, timing
  240ms with `DECEL`; backdrop fades with the drag. What design round 2
  (v22) actually changed in this file: only the linen PaperTexture
  (pointerEvents none) — it did not break the drag or the buttons; the
  dead-buttons bug predates v22 (reported on v21).

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

## Nudge alarm sound
- Nudges (a block starting = "up next", a block still open past its end
  = "missed") play a real alarm tone, not the default ping:
  `assets/sounds/alarm.wav` (generated two-tone beeps, see
  `scripts/gen-alarm-sound.mjs`), bundled by the expo-notifications
  plugin (`app.json` `sounds` — prebuild copies it to `res/raw`).
- The channel (`takt-nudges`) carries the sound on Android and each
  notification carries it in its content (iOS). A channel's sound cannot
  be changed in place on Android: an existing channel with the default
  sound is deleted + recreated with the alarm on init — only that case
  migrates, so a channel that already has a custom sound, or one the
  user silenced, is left alone. Guarded by `nudge.test.ts`.

## Today hero
- Left-aligned, on a butter card: TODAY + a date pill ("Tue, 10 Nov")
  on one row, "Discipline so far", the oversized score, an "X h Y min
  of Z h" line (completed vs planned minutes), then the mini timeline.
  There is NO separate greeting / clock / date text above the card —
  the timing lives in the card.
- Mini timeline (`MiniTimeline`): one horizontal bar from the first
  block's start to the last block's end, a colour-coded segment per
  block (category icon inside when it is wide enough), the free gaps
  left as empty track so the user sees where they are free. A red
  marker shows now: a pill with the current time above the bar, a
  line through it, a dot on it. The red is the only red in the app.
- Dropping a category tints ONLY the Now section (and Done). Next up
  and Left never tint — the drop creates in the earliest empty slot
  wherever it lands, so tinting those two read as a false promise.
