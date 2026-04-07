# Phase 1: Foundation

## Read First

- `spec.md`
- `plan/README.md`
- No previous handoff exists for this phase

## Objective

Create the project foundation and architecture for the desktop app so later phases can land cleanly without reworking the stack.

## Scope

- Scaffold the project with Vite+, React, TypeScript, and Oxc-backed checks.
- Establish a clean Electron structure for main, preload, and renderer.
- Set up the initial dependency baseline for Electron, `node-pty`, SQLite access, `ghostty-web`, shadcn/ui, and TanStack libraries that are clearly justified by the app structure.
- Choose a project layout that keeps desktop, renderer, and persistence concerns separated and maintainable.
- Establish the secure preload bridge and typed IPC surface.
- Create the initial renderer app shell with placeholder regions for:
  - custom shell editor
  - command/result card feed
  - history search
  - terminal mode
- Set the visual system direction early: dark, purple-accented, squared, minimal, terminal-inspired.
- Add the base data layer and migration strategy for SQLite, even if the full history feature lands later.
- Add a minimal launchable desktop app path so the repo can boot, develop, and build from this phase onward.
- Add baseline verification and project docs needed for later agents to work efficiently.
- End the phase with a visible desktop shell scaffold that can be launched and inspected, even if features are still placeholders.

## Out of Scope

- Full command execution UX
- Rich command cards
- Autocomplete and history search behavior
- TUI detection and terminal-mode switching
- V2 AI assistant features

## Done When

- The app boots locally through the chosen desktop workflow.
- A human can launch the desktop app and see the initial shell chrome, placeholder surfaces, and visual system direction.
- The repo has a clear command surface based on `vp`.
- Electron main/preload/renderer boundaries are in place and typed.
- Styling, component, and state-management foundations are established without locking the app into poor patterns.
- The codebase is ready for the next agent to implement shell execution without structural cleanup first.

## Handoff Requirements

- Write `plan/handoffs/phase-01.md`.
- Document the chosen project structure, any notable stack decisions, and anything Phase 2 should build on directly.
- Include the exact commands and manual steps to launch and inspect the Phase 1 app shell.
- Commit the phase before stopping.
