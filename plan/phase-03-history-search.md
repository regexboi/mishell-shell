# Phase 3: History and Search

## Read First

- `spec.md`
- `plan/README.md`
- `plan/handoffs/phase-02.md`

## Objective

Turn command history into a first-class system that powers recall, autocomplete, and rich search.

## Scope

- Finish the SQLite-backed history model for V1 needs.
- Persist and query:
  - command text
  - cwd
  - shell/session
  - timestamp
  - duration
  - exit code
  - captured output metadata
- Implement history-based autocomplete in the editor.
- Implement CWD-aware history ranking.
- Implement up-arrow history behavior scoped to the current working directory.
- Implement global history search on `Ctrl/Cmd+R`.
- Make the search results useful and metadata-rich, including command, cwd, timestamp, duration, and exit code.
- Ensure history interactions feel fast enough for daily shell use.
- Keep the data model and APIs extensible for later AI-assisted retrieval without actually implementing V2 features.

## Out of Scope

- TUI detection and terminal-mode switching
- V2 AI assistant features

## Done When

- The app has a credible rich-history experience that is materially better than shell-native history for V1.
- Autocomplete, scoped recall, and global search all operate on the persisted history system.
- The renderer and persistence layers remain clean enough for Phase 4 to add terminal-mode compatibility without rework.

## Handoff Requirements

- Write `plan/handoffs/phase-03.md`.
- Document query/indexing decisions, keyboard shortcuts, and any history limitations Phase 4 or 5 should revisit.
- Commit the phase before stopping.
