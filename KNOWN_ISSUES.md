# KNOWN_ISSUES.md

(None yet — log here as they are found. Never fake a fix; log and move on.)
- [resolved 2026-11-10] Calendar screen used local sample state, not the zustand store yet — now wired to the store (all mutations through store actions with the scope sheet; real Dock.tsx with drop-position creates). Scope sheet now runs the change after a scope is picked instead of recording it after the fact.
- [resolved 2026-11-10] Stats/Settings/Onboarding ran on a seeded sample dataset until store wiring landed — now all read the store (Stats via daysFromStore, Settings via settings + updateSettings, Onboarding persists onboardingDone and schedules a real first-task block for tomorrow).
- [resolved 2026-11-10] Dock drop + radial attach created at earliest empty slot, not at the exact drop position — Calendar dock drops now measure the grid and create at the drop position (falls back to earliest slot outside the grid). Today-screen dock drops still use the earliest slot.
- No on-device smoke test yet (gestures/haptics verified by typecheck + bundle only).
- Backup/restore now has expo-file-system + expo-sharing installed; verify on device.
- Calendar: one drag/resize that auto-shifts neighbours costs several store undo entries (one per shifted block) — the store has no multi-block batch op yet, so a single Undo may only revert part of a drag.
- Calendar: store toasts are read via the `lastToast` subscription; the same toast text twice in a row does not re-trigger the toast display.
- Settings "Do not nudge" defaults are still local state (no store field for them yet) and do not survive a restart.
- Onboarding steps 3–4 (category picks, sandbox timeline) are still local state by design; only step 7 and finish() touch the store.
