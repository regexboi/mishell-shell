# Phase 5: V1 Polish and Hardening

## Read First

- `spec.md`
- `plan/README.md`
- `plan/handoffs/phase-04.md`

## Objective

Finish the product as a shippable V1 by tightening UX, quality, cross-platform behavior, and project documentation.

## Scope

- Finish theme support for V1 within the chosen visual system.
- Refine the interface so the overall experience feels polished, fast, and coherent.
- Remove rough edges in keyboard flow, focus handling, loading states, empty states, and error handling.
- Harden macOS and Windows behavior where practical within the repo and local testing environment.
- Finalize packaging/build workflow appropriate for shipping the Electron app on both target platforms.
- Add or improve tests and smoke checks for the highest-risk areas.
- Clean up migrations, configuration, scripts, and docs so the repo is understandable to future agents and human maintainers.
- Verify that V1 success criteria from `spec.md` are met.
- Explicitly leave V2 AI assistant work out of scope.

## Out of Scope

- New net-new product surface beyond V1
- V2 AI assistant features

## Done When

- The repo is feature-complete for V1 as defined by `spec.md`.
- The app feels polished enough to evaluate as a real product direction rather than a prototype skeleton.
- The build, run, and verification paths are documented and usable.

## Handoff Requirements

- Write `plan/handoffs/phase-05.md`.
- Summarize final V1 status, remaining non-blocking rough edges, and recommended next work after V1.
- Commit the phase before stopping.
