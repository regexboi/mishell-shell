# Phase 03 Handoff

## Completed

- Added typed history IPC surfaces for autocomplete, cwd-scoped recall, and global search.
- Extended the SQLite history layer with query helpers for:
  - grouped autocomplete suggestions
  - current-working-directory recall
  - metadata-rich global search
- Added `0002_history_search` indexes to keep cwd recall and common command-history lookups fast.
- Upgraded the renderer shell surface with:
  - history autocomplete below the editor
  - `Tab` acceptance for the selected suggestion
  - `ArrowUp` cwd-scoped recall and `ArrowDown` restore/forward navigation
  - a real `Cmd/Ctrl+R` search dialog with keyboard navigation and metadata preview
- Updated the browser-preview fallback so the Phase 3 UI still works outside Electron.
- Added tests covering the new migration plus autocomplete/search/recall query behavior.

## Key Decisions

- Kept Phase 2’s `command_history` table as the single source of truth. Phase 3 adds query/read paths instead of introducing a second history store.
- Added three indexes:
  - `command_history_cwd_started_at_idx`
  - `command_history_command_text_started_at_idx`
  - `command_history_cwd_command_text_started_at_idx`
- Search/autocomplete ranking is pragmatic V1 logic, not FTS:
  - autocomplete prefers prefix matches, then same-cwd matches, then recency
  - global search filters by whitespace-separated terms across `command_text` and `cwd`, then sorts by command match quality, cwd match, and recency
- Keyboard behavior landed as:
  - `Tab`: accept selected autocomplete suggestion
  - `ArrowDown`: cycle autocomplete suggestions when visible
  - `ArrowUp`: recall history scoped to the current cwd when the cursor is on the first line
  - `ArrowDown`: move forward through that recall session / restore the original draft
  - `Cmd/Ctrl+R`: open global history search

## Manual Test Path

- Run `./vp dev`.
- In the Electron window, run a few commands in the same cwd such as:
  - `pwd`
  - `git status --short`
  - `pnpm check`
- Type `git st` and confirm autocomplete rows appear below the editor.
- Press `Tab` and confirm the selected history suggestion replaces the draft.
- Clear the draft, press `ArrowUp`, and confirm recent commands from the current cwd are recalled.
- Press `ArrowDown` and confirm the recall session moves forward or restores the original draft.
- Press `Cmd/Ctrl+R` / `Ctrl+R`, search for `git`, and confirm the dialog shows command, cwd, timestamp, duration, exit code, and output preview.
- Use `Enter` or click `Reuse Command` on a result and confirm the command is inserted back into the editor.
- Restart `./vp dev`, reopen `Cmd/Ctrl+R`, and confirm previously executed commands are still searchable.

## Verification

- `./vp check`
- `./vp test`
- `./vp build`

## Known Issues or Follow-Ups

- Search uses indexed `LIKE`-based ranking rather than SQLite FTS. This is fine for V1 and current scale, but Phase 5 can revisit FTS if large histories make substring search feel slower.
- Up-arrow recall intentionally triggers only when the cursor is on the first editor line. This preserves multiline editing below that point, but the behavior is still a compromise versus a fully custom editor model.
- Global search currently previews stored output metadata only. It does not reopen historical full output logs yet.
- The shell is still one PTY per submitted command. Cwd persists, but shell-local environment mutations still do not.

## Notes for Next Phase

- Phase 4 should preserve the editor/card/history flow as the default path and only switch to `ghostty-web` for real interactive/TUI sessions.
- If terminal mode needs historical context, reuse the current typed history APIs instead of scraping renderer state.
- If Phase 4 diverts some commands away from cards, keep the history insert path consistent so autocomplete/search still see all finished executions.
