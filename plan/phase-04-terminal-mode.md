# Phase 4: Terminal Mode

## Read First

- `spec.md`
- `plan/README.md`
- `plan/handoffs/phase-03.md`

## Objective

Add the compatibility layer for full-screen interactive terminal apps while preserving the custom shell UI as the default experience.

## Scope

- Detect when execution should switch from card-based shell UI to raw terminal mode for full-screen or interactive TUI apps.
- Integrate `ghostty-web` as the renderer terminal surface for this mode.
- Preserve shell/session correctness through the transition between normal command UI and terminal mode.
- Handle terminal sizing, focus, and lifecycle cleanly enough for practical daily use.
- Support exiting terminal mode back to the normal shell UI with `Ctrl+C` when appropriate for the active session behavior.
- Make sure interactive tools such as `vim`, `lazygit`, and `codex` are the reference class of compatibility targets.
- Ensure terminal mode is clearly a fallback compatibility view, not the default shell presentation.
- Close any architecture gaps discovered in earlier phases that block robust TUI support.

## Out of Scope

- V2 AI assistant features
- Major visual polish that can wait for Phase 5

## Done When

- Interactive full-screen shell apps are usable through terminal mode.
- Normal commands still feel native to the custom shell UI.
- Switching between modes feels intentional and stable rather than accidental.

## Handoff Requirements

- Write `plan/handoffs/phase-04.md`.
- Document TUI detection behavior, compatibility assumptions, and any platform-specific caveats for final V1 hardening.
- Commit the phase before stopping.
