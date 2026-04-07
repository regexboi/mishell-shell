# Plan

This folder turns `spec.md` into a five-phase execution plan that Codex agents can run one phase at a time.

## Usage

When asked to execute a phase:

1. Read `spec.md`.
2. Read this file.
3. Read the target phase doc.
4. Read the previous phase handoff in `plan/handoffs/` if one exists.
5. Execute the target phase completely.
6. Verify the work with the most relevant checks available.
7. Write the new handoff in `plan/handoffs/`.
8. Commit the phase changes.
9. Stop.

## Global Rules

- The goal is a feature-complete V1 from `spec.md`.
- Do not implement the `V2` AI assistant work.
- Prefer pragmatic decisions that keep later phases unblocked.
- Do not over-engineer around speculative future features beyond what V1 needs.
- Preserve cross-platform intent for macOS and Windows.
- Use Vite+ with React and `vp` commands for repo workflows.
- Use TypeScript throughout.
- Use shadcn/ui for styling primitives with a dark, minimal, squared, cyberpunk-terminal visual direction.
- Use TanStack where it improves structure or state management without adding unnecessary complexity.
- Each phase must end in a testable or demoable product slice, not only internal scaffolding.
- If infrastructure work is needed, it must land behind a visible workflow that the next agent or human can run and verify immediately.

## Phase Map

- `phase-01-foundation.md`
  Scaffold the app, tooling, architecture boundaries, and initial UI shell.
- `phase-02-execution-ui.md`
  Build the custom shell input flow, PTY-backed execution, and command cards.
- `phase-03-history-search.md`
  Build the SQLite-backed history features, autocomplete, and searchable command recall.
- `phase-04-terminal-mode.md`
  Add TUI detection and the raw terminal compatibility mode with `ghostty-web`.
- `phase-05-v1-polish.md`
  Finish V1 with theme support, cross-platform hardening, packaging, QA, and final docs.

## Handoffs

Use `plan/handoffs/phase-0N.md` for phase handoffs. Follow the template in `plan/handoffs/_template.md`.
