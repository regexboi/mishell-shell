# Phase 04 Handoff

## Completed

- Added a second execution path for interactive commands that keeps the custom editor/card flow as default but launches a long-lived PTY-backed terminal session when terminal mode is needed.
- Added typed terminal IPC for:
  - session input writes
  - terminal resize propagation
  - shared execution events that distinguish card output from terminal output
- Integrated a renderer-side `ghostty-web` surface with fit/focus lifecycle, PTY input forwarding, and resize syncing.
- Kept terminal-mode executions in the same history pipeline by writing summary rows into `command_history` and saving the raw PTY transcript to disk.
- Updated the shell scaffold so:
  - normal commands still render into cards
  - detected TUIs switch into a dedicated compatibility view
  - terminal sessions still leave behind a status card in the feed when they finish
- Updated the browser-preview fallback to simulate the terminal-mode flow well enough for renderer development outside Electron.
- Added unit coverage for the terminal-mode detection heuristic.

## Key Decisions

- TUI detection is heuristic in V1 and happens before launch, based on the resolved command prefix rather than escape-sequence detection after output starts.
- The detection list currently targets the intended compatibility class: `vim`, `nvim`, `vi`, `lazygit`, `codex`, `ssh`, shell REPLs, and similar interactive tools.
- Terminal sessions still produce a `CommandExecution` row and feed card, but live output is routed only to the `ghostty-web` surface instead of the card body.
- Terminal-mode history rows store a human-readable summary in `output_preview` and the raw PTY transcript path in `output_path`; the renderer does not reopen that raw transcript yet.
- `Ctrl+C` is passed through to the active PTY. Mishell exits terminal mode when the underlying process exits; it does not forcibly tear down the session from the renderer.

## Manual Test Path

- Run `./vp dev`.
- In the Electron window, run a normal command like `pwd` and confirm it still stays in the editor/card flow.
- Run `vim README.md` and confirm Mishell switches into the terminal compatibility surface instead of streaming raw escape sequences into a card.
- Exit `vim` with `:q` and confirm focus returns to the custom shell UI and the feed shows a terminal-mode summary card.
- Run `codex` or `lazygit` and confirm the app again enters terminal mode.
- Use `Ctrl+C` against a session that accepts it, and confirm Mishell returns to the default shell UI when the process exits.
- Open `Cmd/Ctrl+R` afterward and confirm the interactive command is present in history search with a terminal-session summary.

Apps/commands used for terminal-mode verification in automated coverage:

- `vim README.md`
- `sudo lazygit`
- `FOO=1 env BAR=2 codex`
- `pnpm check`
- `git status --short`
- `vim --help`

## Verification

- `./vp check`
- `./vp test`
- `./vp build`

## Known Issues or Follow-Ups

- Detection is command-prefix based, so compound shell expressions like `echo ok && vim README.md` will stay on the normal card path unless Phase 5 broadens the parser or adds a manual override.
- The transcript saved for terminal sessions is the raw PTY stream. Mishell records the file path for history, but the current renderer does not expose transcript replay.
- `ghostty-web` adds a large renderer chunk in production builds. Vite currently reports a chunk-size warning; code-splitting the terminal surface is a reasonable Phase 5 cleanup.
- Cross-platform behavior is implemented for POSIX shells, PowerShell, and `cmd.exe`, but Windows-specific manual validation still needs to happen in a real Electron session.

## Notes for Next Phase

- Phase 5 should manually validate terminal-mode behavior on both macOS and Windows using the commands above, especially PowerShell and `cmd.exe` launch paths.
- If final V1 polish needs stronger TUI coverage, add either a more capable shell parser or a user-visible manual “open in terminal mode” escape hatch without weakening the default card UX.
- Consider lazy-loading the terminal surface so normal app startup does not always pay the `ghostty-web` bundle cost.
- Theme polish should keep terminal mode visually subordinate to the default shell UI: it is a compatibility view, not the primary chrome.
