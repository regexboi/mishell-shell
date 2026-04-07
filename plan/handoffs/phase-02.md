# Phase 02 Handoff

## Completed

- Replaced the placeholder shell scaffold with a real Phase 2 interaction flow: highlighted editor, `Enter` execution, `Shift+Enter` multiline input, live command feed, and full-output dialog.
- Added a PTY-backed execution service in Electron main using `node-pty`, with shell-specific wrappers that emit structured exit-code and cwd markers for the renderer pipeline.
- Wired typed IPC for `app:run-command` plus streamed execution events from main to preload to renderer.
- Persisted execution metadata into SQLite `command_history` rows on completion, including command text, cwd, shell, session id, timing, exit code, preview text, and output file path.
- Added copy command/output/both actions and secure preload clipboard access.
- Added coverage for command-history inserts plus execution-marker/output-preview parsing helpers.

## Key Decisions

- Editor approach: plain `textarea` with a mirrored highlighted `<pre>` underneath it. This keeps native cursor movement and selection behavior while still rendering shell-oriented syntax colors.
- Execution model: one PTY-backed shell process per submitted command, not a long-lived interactive shell session yet. Commands are still executed through the user shell, and the wrapper captures final exit code plus resulting cwd so `cd some-dir` updates the session cwd for the next command.
- Shell context is maintained in Electron main as the source of truth. Renderer updates its header from completion events instead of inferring cwd or git state locally.
- Full output is kept in renderer state for the current session and also written to a per-command log file path for future history/search work.

## Manual Test Path

- Run `./vp install`.
- Run `./vp dev`.
- In the Electron window, confirm the header shows `Phase 02 Execution UI` and the editor is focused.
- Run `pwd` and verify a success card appears with output, exit code `0`, duration, and copy actions.
- Run `git status --short` and verify the header branch/cwd context still matches the current repo.
- Run `cd ..` and then `pwd` and verify the next command uses the updated cwd in both the header and the card.
- Run a failing command such as `false` or `missing-command` and verify the card shows failure plus non-zero exit state.
- Use `Copy command`, `Copy output`, and `Copy both` on a completed card.
- Open `Cmd/Ctrl+R` and verify the Phase 3 placeholder still opens while explaining that execution metadata is now being stored.

## Verification

- `./vp check`
- `./vp test`
- `./vp build`

## Known Issues or Follow-Ups

- The shell is not a fully persistent interactive session yet. Cwd persistence works via wrapper capture, but exported shell variables, aliases, and other session-local mutations do not persist between commands.
- TUI detection is still unimplemented. Full-screen interactive programs will currently run through the Phase 2 command path instead of switching to raw terminal mode.
- Output streaming is renderer-local for the active session; Phase 3 will need explicit read/query surfaces if history search should reopen prior full outputs from disk.
- The browser preview fallback is intentionally simulated and should not be used for validating the real PTY path.

## Notes for Next Phase

- Phase 3 should build query IPC and renderer search UI on top of the existing `command_history` writes instead of introducing a second history store.
- Respect the current execution event pipeline. Autocomplete/history recall should read persisted data, not scrape command cards from renderer state.
- If Phase 3 needs access to prior full outputs, add a typed output-read path against the stored `output_path` files rather than bloating bootstrap payloads.
- Phase 4 should preserve the current editor/card experience as the default path and only divert to `ghostty-web` for commands that are actually interactive TUIs.
