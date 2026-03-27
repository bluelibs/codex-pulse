# Changelog

## [0.2.0] — 2026-03-27

### Highlights

This release focuses on making your spending picture much clearer: you can now see exactly how much of your Codex weekly budget is left, estimate real USD savings from prompt caching, and watch your token rhythm roll up properly across week/month/year time windows — all wrapped in a more polished, draggable window with better typography.

---

### New Features

#### Codex Weekly Limit Bar
A new `CodexLimitBar` component appears at the top of the dashboard whenever a rate-limit event has been recorded. It shows used vs. remaining percentage, the exact reset timestamp, and the plan tier (pill badge). Fully accessible — implements `role="progressbar"` with all required ARIA attributes. When no rate-limit data is available yet, a gentle muted banner explains what to expect.

#### Cache Savings Estimator
A new `cacheSavings.ts` module computes an estimated USD saving from prompt-cache hits across the major model families (`gpt-5`, `gpt-5-mini`, `o1`, `o3`, `o4-mini`, and more). The estimate mirrors the pricing bundled with `@ccusage/codex` 18.0.10 and is surfaced directly inside the **Mix Panel**, so you can see cache efficiency alongside model breakdown at a glance.

#### Smart Rhythm Aggregation
The trend chart now buckles data into the right granularity per time window:
- **Week** → one bar per day
- **Month** → one bar per ISO week
- **Year** → one bar per calendar month

The dedicated `rhythm.ts` module handles ISO-week alignment, UTC-safe month/year boundaries, and graceful empty-bucket filling — no more awkwardly sparse month charts.

#### Toggle Window from Tray
Clicking the tray icon now *toggles* the main window: click once to open, click again to dismiss. Previously the window would always come to front regardless of its current state.

#### Close Window on ESC
Press `Escape` to dismiss the main window instantly — handy when you've pulled up the dashboard mid-keystroke and want to get back to work fast.

---

### Improvements

- **Draggable window** — the floating panel can now be repositioned by dragging its header region.
- **Better typography** — font stack and sizing refined across the whole UI for improved legibility at Mac's native resolution.
- **HeroDial clamping** — the signal dial now clamps its fill angle cleanly to [0 %, 100 %] so it never visually overflows at extreme values.
- **Fast build script** — a new `b:f` npm script was added for a quicker incremental build during development.
- **Expanded test coverage** — new unit tests for `CodexLimitBar`, `HeroDial`, `cacheSavings`, `rhythm`, `codexWeeklyLimit` service, and `usageDashboardService`.

---

### Bug Fixes

- Tray click handler was always foregrounding the window even when it was already visible; now correctly toggles.
- `usageDashboardService` data assembly cleaned up — redundant code paths removed that could produce duplicate sections in the output.

---

## [0.1.0] — 2026-03-26

Initial release.

- `ccusage` data pipeline: runs the `ccusage` CLI, mirrors/caches results, and assembles a structured dashboard payload.
- **Hero Dial** showing today's spend as a signal strength meter.
- **Trend Panel** with a 7-day / 30-day / 90-day sparkline.
- **Mix Panel** with per-model token breakdown.
- **Model Panel** listing the top heavy-lifting models.
- **Metric Cards** for total cost, tokens in/out, and cache token counts.
- Menubar tray icon with native macOS appearance.
- IPC bridge between main and renderer processes.
- Fingerprint-based deduplication for usage records.
