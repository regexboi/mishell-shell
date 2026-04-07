# Mishell Shell

Phase 2 execution UI for the Electron-based custom shell app described in [spec.md](./spec.md).

## Commands

- `./vp install`
- `pnpm rebuild:native`
- `pnpm rebuild:node`
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

## Phase 2 Outcome

- Typed Electron main/preload/renderer boundary with a secure `window.mishell` bridge for bootstrap, command execution, execution events, and clipboard writes
- PTY-backed shell execution in Electron main using `node-pty`, with command output streamed into structured renderer cards instead of a persistent raw terminal
- SQLite command-history writes for command text, cwd, shell/session id, timing, exit code, output preview, and optional captured output file path
- Custom highlighted shell editor with free cursor placement, `Enter` to run, `Shift+Enter` for multiline input, and copy/full-output actions on command cards
- Starship-lite shell header showing cwd, shell, git branch, and recent exit/duration context
- `vp` workflow wrapper over `pnpm` for install, dev, check, test, build, and pack
- Native modules rebuild automatically for the right runtime:
  `./vp dev` and `./vp pack` rebuild for Electron, `./vp test` rebuilds for local Node.
  Run `pnpm rebuild:native` or `pnpm rebuild:node` manually if you need to switch runtimes yourself.
- `./vp dev` expects port `5173` to be free. If it is occupied, Vite now fails fast instead of drifting to another port and leaving Electron pointed at the wrong URL.
