# KNOWN_ISSUES.md

(None yet — log here as they are found. Never fake a fix; log and move on.)
- Calendar screen uses local sample state, not the zustand store yet (TODO marked in code); scope sheet records scope but does not propagate to templates.
- Stats/Settings/Onboarding run on a seeded sample dataset until store wiring lands (one-line swap via src/lib/stats.ts daysFromStore).
- Dock drop + radial attach create at earliest empty slot, not at the exact drop position on the timeline.
- No on-device smoke test yet (gestures/haptics verified by typecheck + bundle only).
- Backup/restore now has expo-file-system + expo-sharing installed; verify on device.
