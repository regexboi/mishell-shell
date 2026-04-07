# Phase 2: Execution UI

## Read First

- `spec.md`
- `plan/README.md`
- `plan/handoffs/phase-01.md`

## Objective

Deliver the main shell experience: a custom editor-driven command surface backed by a real shell, with results rendered as structured UI instead of traditional scrollback.

## Scope

- Implement the custom shell editor/input experience as the default interaction model.
- Support free cursor placement and shell-oriented editing behavior appropriate for the chosen editor approach.
- Add shell syntax highlighting.
- Wire command execution through a real PTY-backed shell for correctness.
- Keep normal command execution in the custom UI path rather than falling back to the raw terminal view.
- Render each executed command as a result card with at least:
  - command text
  - status
  - exit code
  - duration
  - cwd/context
  - output preview and access to full output
  - copy command/output/both actions
- Add the shell header/prompt context area with Starship-style contextual information where practical for V1.
- Persist the execution metadata required for history features, even if some query UX arrives in the next phase.
- Make sure the renderer architecture remains compatible with upcoming search/history and terminal-mode work.

## Out of Scope

- Full global history search UX
- Mature autocomplete ranking
- TUI detection and raw terminal mode
- V2 AI assistant features

## Done When

- A user can launch the app, enter shell commands in the custom UI, run them through a PTY, and inspect results via cards.
- The execution pipeline records the metadata the history system will need.
- The UI feels like a custom shell surface, not a wrapped terminal.

## Handoff Requirements

- Write `plan/handoffs/phase-02.md`.
- Call out the editor approach, PTY execution model, and any edge cases Phase 3 or 4 must respect.
- Commit the phase before stopping.
