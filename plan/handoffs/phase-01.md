# Phase 01 Handoff

## Completed

- Scaffolded the repo with Electron, Vite, React, TypeScript, Tailwind v4 styling, TanStack Router, TanStack Query, and Oxc lint checks.
- Added a secure preload bridge with a typed `app:get-bootstrap` IPC contract validated through `zod`.
- Added SQLite foundation with a migration runner and the initial `command_history` schema.
- Built the Phase 1 shell chrome: editor placeholder, command feed placeholder, history-search modal placeholder, and terminal-mode placeholder.
- Added `vp` workflow commands and a repo README for future agents.
- Added a capture-phase `Cmd/Ctrl+R` renderer shortcut so Recall opens in the Electron window instead of triggering browser reload behavior.

## Key Decisions

- Kept Electron ownership in `electron/` and shared contracts in `src/shared/` so main, preload, and renderer stay typed without circular structure.
- Used `better-sqlite3` in Electron main for a simple synchronous local data layer that Phase 2 and 3 can extend safely.
- Used TanStack Router plus Query immediately so async renderer state can grow without replacing the app shell later.
- Used shadcn-style primitives with Tailwind v4 and a hard-edged dark cyberpunk visual direction to set the UI baseline early.
- Split native rebuild workflows by runtime: `./vp dev` rebuilds native modules for Electron, while `./vp test` rebuilds them for local Node.

## Manual Test Path

- Run `./vp install`.
- Run `./vp dev`.
- Wait for the Electron window to open.
- Make sure you are testing the Electron window, not the raw browser tab. The real window should show a platform like `darwin/arm64`, not `browser-preview`.
- Verify the landing shell shows:
  editor scaffold in the main center pane
  command feed placeholders below it
  terminal compatibility placeholder on the right side of the main content
  surface list on the left rail
- Press `Cmd/Ctrl+R` or click `Open Cmd/Ctrl+R` and verify the history-search placeholder dialog appears with mock metadata rows.
- Confirm the header shows shell info, migration info, and focus state from the preload bootstrap payload.

## Verification

- `./vp check`
- `./vp test`
- `./vp build`

## Known Issues or Follow-Ups

- Phase 1 does not execute commands yet; all shell/feed/history/terminal content is placeholder UI.
- `ghostty-web` and `node-pty` are installed but intentionally unused until later phases.
- Packaging config exists, but `./vp pack` was not run in this phase.
- `./vp dev` expects port `5173` to be free; it now fails fast with `--strictPort` instead of silently moving to another port.

## Notes for Next Phase

- Build the execution pipeline around the existing `electron/runtime.ts`, `electron/ipc/register-app-ipc.ts`, and renderer bootstrap query instead of replacing them.
- Add PTY ownership in Electron main; keep the renderer on the custom shell surface and send structured execution updates across typed IPC.
- Extend the existing SQLite schema by writing execution rows into `command_history` as commands complete.
- Preserve the current shell scaffold layout; Phase 2 should replace placeholders with live editor and command-card behavior rather than redesigning the shell chrome.
- Keep the current runtime split in mind when adding native-backed code: Electron startup and Node-based tests cannot share the same rebuilt binary state without an explicit rebuild step.
