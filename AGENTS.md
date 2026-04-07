# AGENTS.md

## Repo Defaults

- Build the feature-complete V1 described in `spec.md`.
- Do not implement anything explicitly marked `V2`.
- Use Electron for desktop app architecture, `node-pty` for shell execution, `ghostty-web` for terminal mode, and local SQLite for history/metadata.
- Use Vite+ with React, TypeScript, and Oxc-backed checks.
- Use `vp` notation for repo workflows: `vp install`, `vp dev`, `vp check`, `vp test`, `vp build`, `vp pack`, `vp run ...`.
- If a package-manager-specific command is unavoidable, use `pnpm`.
- Use shadcn/ui for styling primitives.
- Use TanStack where it meaningfully improves the renderer architecture, especially TanStack Router for structured navigation/state-in-URL and TanStack Query for async/cacheable renderer data flows.
- UI direction: dark theme, purple accents, ultra minimal, squared borders, cyberpunk terminal feel, keyboard-first, avoid excess cards and avoid soft/glassy styling.

## Phase Execution Contract

When the user says `execute phase N`:

1. Read `spec.md`.
2. Read `plan/README.md`.
3. Read the target phase doc.
4. Read the previous phase handoff if it exists. For phase 1, there is no previous handoff.
5. Complete the phase scope end-to-end without stopping at partial implementation.
6. Stay inside the current phase scope except for small unblockers or cleanup required to land the phase cleanly.
7. Run the most relevant verification commands you can.
8. Write `plan/handoffs/phase-0N.md` as a handoff for the next agent.
9. Create one intentional commit for the phase.
10. Stop after the commit and handoff are complete.

## Handoff Expectations

Each phase handoff should be concise and useful to the next agent. Include:

- What was completed
- Key files or systems changed
- Commands run for verification
- Known issues, tradeoffs, or follow-up items
- Specific advice for the next phase

## Engineering Defaults

- Keep the preload bridge secure, typed, and minimal.
- Prefer typed boundaries between Electron main, preload, renderer, and persistence layers.
- Keep the custom shell UI as the default experience. Raw terminal mode is a compatibility fallback for TUI apps, not the main UI.
- Make reasonable design and implementation decisions locally instead of asking for minor clarifications.
