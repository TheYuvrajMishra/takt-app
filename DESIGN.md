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
