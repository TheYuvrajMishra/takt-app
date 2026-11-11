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
- Paper texture: cards carry the grain tile inside them (`PaperTexture`,
  5% on `Card`, 4% on calendar blocks) — a subtle paper feel, not a
  pattern. Shadows are single and carbon-tinted, never grey: a card takes
  one balanced `card` shadow (`Card` is ONE view — the old two-shell
  nesting drew a dark line inside the edge and shrink-wrapped the hero to
  half width); small surfaces take the single `soft` shadow, lifted ones
  `lifted`.
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
- A Done is undoable two ways: the Done toast carries an Undo button
  (one tap back, within the toast's life), and a done block's sheet
  offers "Mark as not done" (clears the completion, nudges return).
- Hero timeline (MiniTimeline): the WHOLE day (00:00–24:00) as a zoomed
  strip (~1 hour per viewport), draggable to day end. The red now-marker
  (pill + line + dot) rides WITH the strip, pinned to the current time:
  the strip starts centred on now, and when the user swipes the marker
  moves with the timeline — it scrolls off-screen once now is past the
  visible hour. Pill, line and dot share ONE x (markerX) and the pill is
  a fixed 56×22, so the pill can never drift off the line (a variable
  width did that). The pill sits outside (above) the bar, attached to a
  full vertical line that runs from the pill's bottom down past the bar.
  Each time block is a rounded corner (radius 8, 1dp gap). Swiping ticks
  haptically at each hour boundary (and a light tap on drag start),
  gated by the haptics setting. The only time labels are the visible
  window's start and end (below the bar), updating as you swipe. The
  strip fades to the card colour at the viewport's left and right edges
  (28dp gradients, pointerEvents none).
- Onboarding asks for the user's name (step 1, saved to settings) and
  shows phone-frame mockups of the app — Today (create from the dock),
  Calendar (plan ahead), Stats (heatmap) — instead of text-only cards.
- A test notification must go through the real nudge channel (Date
  trigger, channelId, alarm sound, actions); an immediate trigger lands
  on Android's default channel and proves nothing. Settings has a "Send
  a test notification" button for the same check.
- UX pass (20 concepts, 2026-11-11): tabular numbers on every time/number
  readout (hero score, hours line, timeline pill + edge labels, calendar
  hour labels, block times) so digits never jitter; Done is optimistic
  (commitCompletion sets state first, persists after, reverts on a failed
  write); touch targets are 44dp minimum (drawer pills, quick-create
  category/duration/suggestion chips); tracking scale (tight -0.5 on large
  display titles, wide 3 on labels, body 0); smallest labels are 11px
  (no 10px text); onboarding category rows stagger in (FadeInUp, 40ms
  apart); quick-create title autocompletes from past titles (combobox,
  up to 5 matches, tap to fill). Already handled, so not changed: safe
  area (layout contract), leading (body 1.5, headings ~1.2), line length
  (~45–55 chars on a phone), origin-aware animation (radial from the
  touch point, sheet from the bottom, tabs from the tapped direction),
  interruptible animation (all withTiming/DECEL), progressive disclosure
  (stepped onboarding, essential-only sheets), affordance (bobbing arrow,
  clear Done button, grip zones). OKLCH not applied — the fixed palette
  is already perceptually distinct (plus hatch patterns). Shared element
  transition deferred — needs a navigation refactor (tabs + sheets, not
  stack screens).
- Calendar day change slides like a page turn: the grid follows the
  finger on a two-finger swipe (slides out past 60dp, snaps back under
  it), and every anchor change (buttons, date strip, Today, swipe)
  slides the new day in from the direction of travel (250ms, DECEL).
- Calendar lands on now every time the tab opens (focus + content-size
  triggers, only when viewing today); another day keeps its own place.
- Nudge alarm: a long (~12s) repeating two-tone alarm, not one blip.
  The notification carries Done / Start / Snooze actions — Start stops
  the start-nudge (only the end wrap-up remains), Done cancels that
  block-date's nudges. The notification's small icon is a monochrome
  white clock (`assets/notification-icon.png`); Android renders a
  full-colour app icon as a blob, so the notification icon is separate.

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
  Swipe up anywhere on the navbar (or tap the small up-arrow bobbing
  above it, Today + Calendar only) opens a drawer of ALL chips
  (usage-ordered, most important at both ends). The drawer is transparent
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

- Closed-app nudges: doReschedule schedules the fresh plan BEFORE the slow
  fetch of all scheduled notifications (the plan is sorted by fire time, so
  the soonest nudge lands first). The old order fetched first, so closing
  the app a second after creating a task left the new block with no nudge.
  A block whose time window is active but the user never pressed Start
  shows "Now" (butter), not "In progress" — only an actual Start is
  progress. Onboarding is 6 steps; the "Build your first day" sandbox is
  removed.

- Notification diagnostics: Settings now has a "Notifications" section
  showing permission, channel, scheduled nudge count, and the next
  nudge. A denied permission silently schedules zero nudges
  (rescheduleIfPermitted returns 0), so the cause of "no notifications
  at all" is now visible instead of guessed at. The section has an
  "Allow notifications" button (re-prompts, or opens system settings
  when already denied) and a Refresh status button.

- Exact alarms (the late-nudge fix): a nudge was arriving 8–10 min after
  the deadline. Without the exact-alarm permission, scheduled
  notifications arrive at an approximate time — Android 14+ denies
  exact alarms by default for new installs even though the app declares
  SCHEDULE_EXACT_ALARM. Settings → Notifications now shows the exact
  alarm status and has an "Allow exact alarms" button (opens the system
  settings page, then reschedules). The diagnostics also cover the
  notification permission, channel, scheduled count and next nudge.
