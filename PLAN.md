# Takt — PLAN.md

App: routine app that nudges you until you do the thing. Name **Takt**, package `com.takt.app`, repo `TheYuvrajMishra/takt-app`.

## Design tokens (single source of truth)
`src/theme/tokens.ts` — Carbon #0A0A0A, Cloudy #F6F5F2, white #FFFFFF (raised cards only). NO grey token anywhere. Category palette: butter #F8E39A, mint #4BBF8F, violet #6A57C0, orchid #C0468F, apricot #F4A261, carbon #0A0A0A. Status: Complete mint, Progress apricot, Missed carbon/white text, Upcoming hatched cloud. Radii 28–36 cards, full pill chips. Font: Inter Tight (expo-font), 3 weights max. Film grain overlay everywhere. NO emoji anywhere. Category icons: custom SVG 1.75px stroke, rounded caps.

## Phases
- [x] Phase 0: repo (public), Expo SDK 58 scaffold, deps installed
- [ ] Phase 1: design system + assets (tokens, fonts, grain, hatch, icons, base components, illustrations, icon/splash)
- [ ] Phase 2: data + engine (models, sqlite persistence, template/override logic, discipline score, nudge engine, tests)
- [ ] Phase 3: Today screen
- [ ] Phase 4: Calendar mode
- [ ] Phase 5: Node dock + radial quick-add + gestures
- [ ] Phase 6: Stats mode
- [ ] Phase 7: Onboarding
- [ ] Phase 8: Settings, polish, haptics, accessibility, perf
- [ ] Phase 9: CI + APK (build-apk.yml, arm64-v8a, keystore in gh secrets, release `latest` / app-release.apk)
- [ ] Phase 10: iteration cycles (target 6, cap 10) + final delivery

## Phase 10 — iteration cycles (coordinator, 2026-11-10 ~01:40 IST)
- Cycle 1 (DONE, awaiting final CI): weekday-split re-id fix — edited weekday keeps the block id, remainder re-id + completion migration in one sqlite transaction, scoped-edit/override sync, batched undo for drag/quick-edit/swap/multi-delete/create-with-shift, resolveEditedId deleted, stale-id split-chain resolution with splitFromId lineage. Tests 44 → 65, tsc clean, expo android export bundles.
- Cycle 2 (DONE, awaiting CI): Settings "Do not nudge" defaults persist (store fields + addBlock applies them; onboarding first task exempt; optimistic updateSettings; per-block nudge controls in Today + Calendar sheets; silenced creation toasts). Round-2 critics (QA 7/10, UX 7/10) flagged the quick-sheet switch going stale on category change — fixed with a dirty flag + shared defaultDoNotNudgeFor() helper; backup merge now sanitizes corrupt lists/defaults and never wipes the list on all-stale ids; getSettings coerces corrupt rows. Round 3 (final per cap) fixed the remaining UX items: Settings subscribes to lastToast (dead failure toast), revert-only-if-still-current (D3), compact "Won't nudge" tag (D4), hollow-dot markers on BlockChip/BlockCard + text in Today rows (D5). Tests 65 → 89, tsc clean, expo export OK. Committing now.
- Cycle 3 (next): TBD from remaining KNOWN_ISSUES / critic findings — candidates: nudge reliability hardening + tests; accessibility + performance pass; home-screen shortcut / "now" widget if feasible; weekday-delete completion orphan in stats (open, needs a decision).
- Cycle 3 (DONE, awaiting CI): nudge reliability hardening — Done cancels only that block-date + explicit reschedule; started blocks get wrap-up nudges only (guaranteed one at end even at max 1); init awaits load() before initNudges + hydrated-effect reschedule; serialized schedule-first reschedule; true rolling 48h window with post-midnight slots dated on their fire day; permission-guarded hook, cold-start prompt deferred to onboarding (denied → system settings); single notification-handler owner; body tap opens Today; max 12/block cap + corrupt-settings fallbacks; copyIndex/totalForBlock fixed. Critic round 1: 6/10 → fixes → round 2: 8/10; round-2 low defects (R1–R6, R8) fixed in a final pass with tests. Tests 89 → 102, tsc clean, expo export OK. Committing now.
- Cycle 4 (DONE, awaiting CI): Calendar multi-block undo atomic per user action — duplicate, paste, apply-template wrap the whole loop in one outer batch; batch snapshot is lazy (first mutation, not begin) so empty batches plant no entry and preserve redo; no-op guards on move/resize/patch/snooze/edit/deleteCategory for missing ids (stale ids still resolve via split chain); applyTemplate re-entry guard; scope-confirm failures toast. Critic round 1: 7/10 → fixes → round 2: 9/10; round-2 lows (N1–N3) fixed in a final pass. Tests 102 → 108, tsc clean, expo export OK. Committing now.
- Cycle 5 (DONE + GREEN, CI #11 success 16m31s, versionCode 11, commit a391aea): Accessibility + performance pass
- Cycle 6 (DONE, awaiting CI): Launcher shortcuts (Android-only; iOS Quick Actions out of scope) — local config plugin (plugins/with-app-shortcuts.js) adds 3 static shortcuts: "What now?" → takt:// (Today), "Calendar" → takt://calendar, "Stats" → takt://stats, each with a distinct Carbon-stroke vector drawable. QA round 1: 5/10 → round 2: 8/10; design round 1: 5/10. Fixes: meta-data moved into the launcher MainActivity (application-level is silently ignored per Android docs), plugin tested (8 tests: manifest placement/idempotency/fallback, XML ids/icons/links/labels), @expo/config-plugins + @types/node now direct deps (npm ci verified in a clean copy), widget deferral logged as [decided]. CI #12 FAILED at :app:processReleaseResources — aapt rejects literal label strings (shortcutShortLabel/LongLabel are reference-type); fixed by moving labels to res/values/shortcuts_strings.xml as @string refs (tests now assert the strings file; 138 tests). Residual: XML/drawables tests assert plugin constants, not the generated res/ files; no on-device check yet (long-press menu + tap destinations need a real device); no local Android SDK, so aapt linking is proven by CI only. Tests 129 → 138, tsc clean, expo export OK. Committing now. — dead largeText/reduceMotion toggles wired up: new TText wrappers (all 15 files codemodded) scale fontSize AND lineHeight ×1.18 via pure scaleTextStyle (theme/textScale, tested: ratio-preservation invariant + exact hero 110→130/118→139, clock 64→76/72→85, chevron 20→24/22→26 numbers), forwardRef; useAppReducedMotion gates Dock magnification, RadialMenu bloom, Sheet slide, BlockCard snap-back, and all 7 Modals (Sheet + EndOfDaySheet + Stats day summary + 4 calendar sheets); Stats heatmap colour-blind: per-category (colour, pattern) pairs unique across all 10 defaults (patternForCategory, categoryPatternById) + custom categories resolve from the live store list in Stats (dayDominant, filter chips, focus lists) and in calendar rendering (categoryById takes the live list — custom blocks no longer mislabel as "Custom"/apricot); perf audit only (Skia unused in src, grain is one tiled PNG, drag previews snap-guarded). Critic round 1: 6/10 → fixes → round 2: 8/10; round-2 new MEDIUM (calendar categoryById) + stale stats.ts comment fixed in a final pass. Tests 108 → 129, tsc clean, expo export OK. Committing now.

## File map (ownership — do not cross-write)
- `src/theme/*` — tokens, fonts, grain, hatch
- `src/types.ts`, `src/lib/core.ts` — shared types + pure logic (do not change signatures without updating all callers)
- `src/lib/db.ts`, `src/lib/nudge.ts`, `src/store/*` — Worker A (data + engine)
- `src/components/*` — shared UI (Card, Pill, Chip, Sheet, Button, DockNode, GrainOverlay, CategoryIcon)
- `src/app/(tabs)/index.tsx` — Today (Worker B)
- `src/app/(tabs)/calendar.tsx` — Calendar (Worker C)
- `src/app/(tabs)/stats.tsx` — Stats (Worker D)
- `src/app/onboarding.tsx`, `src/app/settings.tsx` — Worker D
- `src/components/Dock.tsx`, `src/components/RadialMenu.tsx` — Worker B (shared by Today + Calendar)
- `assets/*` — Worker E (icons, illustrations, splash)
- `.github/workflows/build-apk.yml` — Worker E

## Integration (coordinator, 2026-11-10 ~00:25 IST)
- All 5 workers landed; tsc clean, vitest 38/38, expo-doctor 20/20, android export bundles.
- Fixed: app.json top-level splash removed (SDK 58 schema) -> expo-splash-screen plugin; installed expo-splash-screen, expo-file-system, expo-sharing, vite (vitest peer).
- Wired root layout: store load, initNudges + response listener, onboarding gate (redirects to /onboarding until done).
- Known gaps (see KNOWN_ISSUES.md): Calendar/Stats run on local sample data until store wiring lands; Dock drop creates at earliest slot, not drop position; no device smoke test yet.

## Iteration 1 — store wiring (coordinator, 2026-11-10 ~00:40 IST)
- Calendar, Stats, Settings, Onboarding all wired to the real zustand store; patchBlock added; real Dock used in Calendar with drop-position creation. tsc clean, vitest 44/44, android export bundles.
- BLOCKER: gh OAuth token lacks `workflow` scope — push of `.github/workflows/build-apk.yml` rejected ("refusing to allow an OAuth App to create or update workflow ... without `workflow` scope"). Workflow file is in the local working tree at .github/workflows/build-apk.yml (untracked). Unblock: run `gh auth refresh --hostname github.com -s workflow` and complete the device-code flow at https://github.com/login/device (needs a browser + the user's GitHub login). Then `git add .github && git commit && git push` triggers CI.
