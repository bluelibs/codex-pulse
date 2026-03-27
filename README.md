# Codex Pulse

Codex Pulse is a small macOS Electron app that turns local Codex usage data into a tray-friendly dashboard. It reads recent session files from your Codex home, runs `@ccusage/codex` in offline mode, caches the result, and renders a compact React UI focused on today and week-to-date usage.

To install it, look at the releases in this repo (in the right side) and download the latest DMG.

## What It Does

- Lives in the macOS menu bar and hides the dock icon on launch
- Opens a compact desktop window with usage metrics and model mix
- Shows the latest local Codex weekly limit state when recent rate-limit data is available
- Reads usage data from the local Codex data directory
- Reuses cached snapshots for fast startup
- Refreshes in the background when Codex activity changes
- Builds a synthetic mirrored `CODEX_HOME` from recent files before running reports

## Stack

- Electron 38
- React 19
- TypeScript 5
- Vite via `electron-vite`
- `electron-builder` for macOS packaging
- `vitest` + Testing Library for tests
- `@ccusage/codex` for usage report generation
- `zod` for JSON validation

## Product Overview

The app is designed for a "launch, glance, refresh" workflow:

- `Today`: token totals, cache reuse, output volume, and cost
- `Week to date`: aggregate usage from the ISO week start through today
- `Week rhythm`: per-day trend bars
- `Token mix`: input vs output and cached reuse
- `Models`: token share by model, including fallback flags
- `Codex weekly limit`: the latest locally observed weekly usage percentage and reset time

If cached data exists and Codex activity has changed since the last snapshot, the renderer gets the cached view immediately while a refresh runs in the background.

## How It Works

### 1. Boot

When Electron starts, the main process creates a `UsageDashboardService` with:

- a cache file in Electron `userData`
- a mirror directory in Electron `userData`
- a runner that shells into the bundled `@ccusage/codex` CLI

The app primes the cache, registers IPC handlers, creates the browser window, and installs a tray icon with:

- `Show Codex Pulse`
- `Refresh Usage`
- `Quit`

Closing the window hides it instead of quitting the app.

### 2. Detect changes in Codex data

The service inspects the Codex home directory, which defaults to:

```text
~/.codex
```

It looks at:

- `sessions/`
- `archived_sessions/`
- `history.jsonl`

Two layers of change detection are used:

- `coarseSentinel`: a quick stat-based snapshot of `history.jsonl`, today's session dir, yesterday's session dir, and `archived_sessions/`
- `preciseFingerprint`: a SHA-1 of relevant `.jsonl` file paths, mtimes, and sizes

This keeps launches fast while avoiding unnecessary report recomputation.

### 3. Collect recent files

Only recent `.jsonl` files are considered. The service:

- finds the current ISO week start
- includes files modified since roughly the day before that week window
- scans both live and archived session trees

### 4. Rebuild a mirrored Codex home

Before running reports, the app deletes and recreates a synthetic mirror directory, then symlinks the relevant session files into:

```text
<mirrorRoot>/sessions/live/...
<mirrorRoot>/sessions/archived/...
```

This gives `@ccusage/codex` a focused local dataset instead of the entire Codex history.

### 5. Run `@ccusage/codex`

The app invokes the package's CLI entry with Electron's Node runtime and:

- `daily`
- `--json`
- `--offline`
- `--since`
- `--until`
- `--timezone`
- `--locale en-US`

It sets:

```text
CODEX_HOME=<mirrorRoot>
ELECTRON_RUN_AS_NODE=1
```

Two reports are generated in parallel:

- today only
- week start through today

The JSON output is validated with `zod`.

### 6. Assemble the dashboard snapshot

The app combines the reports into a renderer-friendly snapshot containing:

- generated timestamp
- timezone
- today totals
- week totals
- daily trend points
- grouped per-day model breakdowns
- merged model totals
- relevant file count
- mirror build timestamp

### 7. Serve data to the renderer

The preload script exposes `window.codexPulse` with:

- `getCachedDashboard()`
- `loadDashboard()`
- `refreshDashboard()`
- `onDashboardUpdated(listener)`

The React app loads the dashboard on mount and updates when the main process publishes a refresh result.

## Repository Layout

```text
.
├── src/
│   ├── main/                  # Electron main process, tray, IPC, services
│   ├── preload/               # Safe renderer bridge
│   ├── renderer/              # React UI
│   └── shared/                # Shared types
├── electron.vite.config.ts    # Build config for main/preload/renderer
├── vitest.config.ts           # Test config
└── package.json               # Scripts, dependencies, packaging config
```

More specifically:

- `src/main/index.ts`: app bootstrap, tray wiring, window lifecycle
- `src/main/ipc.ts`: IPC handlers and dashboard update broadcasting
- `src/main/services/usageDashboardService.ts`: cache + refresh orchestration
- `src/main/services/fingerprint.ts`: Codex file discovery and change detection
- `src/main/services/mirrorBuilder.ts`: mirror directory rebuild via symlinks
- `src/main/services/runCcusage.ts`: CLI process execution and schema validation
- `src/main/services/dashboardAssembler.ts`: report-to-view-model transformation
- `src/preload/index.ts`: `contextBridge` API
- `src/renderer/src/App.tsx`: top-level dashboard state and loading behavior
- `src/renderer/src/components/*`: presentational dashboard panels
- `src/shared/usage.ts`: shared app contracts

## Requirements

- macOS
- Node.js 20+ recommended
- npm
- A local Codex data directory available at `~/.codex`, or `CODEX_HOME` set before launch

## Getting Started

Install dependencies:

```bash
npm install
```

Run the app in development:

```bash
npm run dev
```

Type-check the project:

```bash
npm run typecheck
```

Run the test suite:

```bash
npm test
```

Build the app quickly without typecheck or packaging:

```bash
npm run build:fast
```

Build the app:

```bash
npm run build
```

Build unpacked output only:

```bash
npm run build:dir
```

Preview the packaged app locally:

```bash
npm run preview
```

## Packaging

`electron-builder` is configured for macOS and currently targets:

- `dmg`
- `zip`

The packaged app name is:

```text
Codex Pulse
```

The app ID is:

```text
com.theodordiaconu.codexpulse
```

## Data, Cache, and Local State

The app stores its generated artifacts under Electron's `userData` directory:

- `usage-cache.json`: serialized dashboard snapshot and fingerprints
- `codex-home-mirror/`: synthetic mirrored Codex home used for reporting

The cache is used to:

- show data immediately on startup when available
- avoid rerunning reports if the precise fingerprint matches
- fall back gracefully if refresh fails

## Testing

Current automated coverage includes:

- `mirrorBuilder` symlink reconstruction
- `UsageDashboardService` caching and background refresh behavior
- renderer behavior in `App`, including preload-driven loading and refresh flows

Notes:

- `vitest` is configured with a JSDOM environment and Testing Library setup

## Assumptions and Behavior Notes

- The app is optimized for recent usage, not full historical exploration
- Session discovery is based on file mtimes, not deep parsing before filtering
- The dock icon is hidden on macOS
- Closing the window hides the app; quitting is handled from the tray menu
- The refresh path can return cached data if a newer snapshot cannot be built
- The preload bridge is required for the renderer to talk to the main process; the UI has fallback error states if it is missing

## Future Improvement Ideas

- Add renderer integration tests
- Make the scanned Codex window configurable
- Support richer drill-down by day and model
- Add explicit empty-state handling for first-time users with no Codex history
- Expose cache and mirror locations in a diagnostics panel

## Scripts

```text
npm run dev         # Start Electron + Vite in development
npm run build:fast  # Bundle only for quick local iteration
npm run build       # Typecheck, bundle, and package for macOS
npm run build:dir   # Typecheck, bundle, and create unpacked output
npm run preview     # Preview built app
npm run typecheck   # Run TypeScript checks for app and node config
npm test            # Run Vitest once
npm run test:watch  # Run Vitest in watch mode
```
