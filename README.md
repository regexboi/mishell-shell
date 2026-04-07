# Mishell Shell

Phase 1 foundation for the Electron-based custom shell UI described in [spec.md](./spec.md).

## Commands

- `./vp install`
- `./vp dev`
- `./vp check`
- `./vp test`
- `./vp build`
- `./vp pack`

## Project Structure

- `electron/`
  Electron main process, preload bridge, IPC handlers, and SQLite bootstrap.
- `electron/db/migrations/`
  Versioned SQL migrations for local persistence.
- `src/`
  React renderer, TanStack app shell, and shadcn-style UI primitives.
- `src/shared/`
  IPC contracts and types shared between preload, main, and renderer.

## Phase 1 Outcome

- Typed Electron main/preload/renderer boundary with a minimal secure `window.mishell` bridge
- SQLite initialization plus a baseline `command_history` table and migration path
- Launchable renderer shell scaffold with placeholder regions for editor, feed, history search, and terminal compatibility mode
- `vp` workflow wrapper over `pnpm` for install, dev, check, test, build, and pack
