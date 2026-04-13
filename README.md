# Mishell Shell

Mishell is an Electron desktop shell with a custom editor-first workflow, PTY-backed execution, SQLite history/search, and a raw terminal compatibility surface for interactive TUIs.

## V1 Scope

- Custom shell editor with syntax highlighting, multiline input, cwd recall, and history/path completion
- Structured command cards with exit status, timing, output preview, and copy actions
- SQLite-backed history search on `Cmd/Ctrl+R`
- Automatic terminal-mode fallback for interactive tools such as `vim`, `lazygit`, `codex`, and shell REPLs
- Dark theme system with multiple V1 palettes
- Typed Electron main/preload/renderer boundaries

## Commands

- `./vp install`
- `pnpm rebuild:native`
- `pnpm rebuild:node`
- `./vp dev`
- `pnpm sync:completion-specs`
- `./vp check`
- `./vp test`
- `./vp build`
- `./vp pack`
- `pnpm pack:dir`

## Workflow Notes

- `./vp dev` rebuilds native modules for Electron before launching the app.
- `./vp test` rebuilds native modules for the local Node runtime before running Vitest.
- `pnpm sync:completion-specs` refreshes the vendored command-spec registry documented in [electron/completion/README.md](/Users/mishca/scripts/mishell-shell/electron/completion/README.md).
- Local completion overrides in `.fig/autocomplete/build` must be JSON specs; executable local Fig `.js` specs are not loaded.
- `./vp dev` expects port `5173` to be free and fails fast if it is occupied.
- In packaged builds Mishell starts in the user home directory. In local dev it starts in the current repo cwd.
- `./vp pack` creates platform installers/artifacts in `release/` with signing auto-discovery disabled for local unsigned builds.
- `pnpm pack:dir` is the faster unpacked packaging path when you only need a local smoke build.

## Project Structure

- `electron/`
  Electron main process, preload bridge, execution service, and SQLite bootstrap.
- `electron/db/`
  Database initialization, migrations, and history query helpers.
- `src/`
  React renderer, shell chrome, and UI primitives.
- `src/shared/`
  IPC contracts and shared API types.
- `plan/`
  Phase docs and agent handoffs.

## Manual Smoke Checklist

1. Run `./vp dev`.
2. Run `pwd` and confirm it stays in the card flow and updates cwd context.
3. Run `git status --short` and confirm output previews/copy actions work.
4. Run `false` or `missing-command` and confirm failure cards render clearly.
5. Press `Tab` on a recent command prefix and confirm history autocomplete appears.
6. Press `Tab` on a filesystem token such as `./src/ma` or `C:\Us` and confirm path completion appears.
7. Press `ArrowUp` in the editor on the first line and confirm cwd-scoped recall works.
8. Press `Cmd/Ctrl+R`, search history, and reuse a prior command.
9. Run `vim README.md` or `lazygit` and confirm Mishell switches into terminal mode.
10. Exit the interactive app and confirm focus returns to the editor and a terminal summary card is recorded.
11. Switch themes and confirm chrome plus terminal mode update coherently.
12. Run `./vp build` and `./vp pack` to validate the production and packaging paths.

## Packaging Targets

- macOS: `dmg`, `zip`
- Windows: `nsis`, `portable`

`electron-builder` currently falls back to Electron defaults for app icons because repo branding assets are still minimal.
