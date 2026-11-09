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
