# Phase 05 Handoff

## Completed

- Finished V1 polish in the renderer with:
  - multi-palette dark theme support persisted in local storage
  - terminal-mode theming aligned with the active shell theme
  - cleaner V1 copy/state messaging across the shell chrome
  - cross-platform path-completion triggering for POSIX and Windows-style path tokens
- Hardened the desktop app/runtime path by:
  - moving packaged app startup cwd to the user home directory
  - hiding the BrowserWindow until ready
  - disabling spellcheck in the shell editor surface
  - updating bootstrap release metadata to Phase 05 / V1
  - broadening shell-flavor detection for `powershell`, `pwsh`, and `cmd` without `.exe`
- Finalized the packaging workflow by:
  - fixing `vp pack` so it runs the Electron packaging script instead of `pnpm pack`
  - configuring `electron-builder` for macOS zip/dmg output and Windows nsis/portable output
  - enabling unsigned local packaging with `CSC_IDENTITY_AUTO_DISCOVERY=false`
  - unpacking native module payloads for `better-sqlite3` and `node-pty`
- Rewrote the README as final V1 documentation with workflow notes, packaging guidance, and a full smoke checklist.
- Added tests for the new cross-platform path-completion trigger helper.

## Key Decisions

- Theme support stays inside the established dark cyberpunk visual system rather than introducing light mode in V1.
- Packaged builds now default to `app.getPath("home")`, while local dev still uses the current repo cwd for faster iteration.
- The `vp` wrapper now uses `pnpm run` for scripted workflows so `vp pack` cannot collide with pnpm’s built-in tarball command.
- Packaging artifacts are intentionally not committed; `release/` and `*.tgz` are now ignored.

## Manual Test Path

1. Run `./vp dev`.
2. Run `pwd` and confirm the command stays in the card feed and updates cwd context.
3. Run `git status --short` and confirm output previews plus copy actions work.
4. Run `false` or `missing-command` and confirm the failure card path is clear.
5. Use `Tab` on a recent command prefix and confirm history autocomplete appears.
6. Use `Tab` on a path token such as `./src/ma` or `C:\Us` and confirm path completion appears.
7. Use `ArrowUp` on the first editor line and confirm cwd recall works.
8. Open `Cmd/Ctrl+R`, search history, and reuse a prior command.
9. Run `vim README.md` or `lazygit` and confirm Mishell switches into terminal mode.
10. Exit the interactive app and confirm focus returns to the editor and a terminal summary card is recorded.
11. Switch between the V1 themes and confirm both shell chrome and terminal mode update coherently.
12. Run `./vp build` and `./vp pack`.

## Verification

- `./vp check`
- `./vp test`
- `./vp build`
- `./vp pack`

## Known Issues or Follow-Ups

- Vite still reports a chunk-size warning for the `ghostty-web` terminal bundle during production builds. The build succeeds, but terminal mode remains the dominant renderer chunk.
- Packaging currently uses the default Electron app icon because the repo still lacks branded macOS/Windows icon assets.
- `electron-builder` warns that `author` is missing from `package.json`. This is non-blocking for local packaging but should be filled in before external distribution.
- The first packaging run may spend time downloading the Electron platform zip and DMG helper bundle. One retry was needed in this phase after a transient GitHub EOF during download.

## Recommended Next Work After V1

- Add branded app icons plus package metadata for a cleaner distribution story.
- Reduce the renderer bundle weight around terminal mode if startup size becomes a real concern.
- Expand terminal-mode detection beyond command-prefix heuristics only if real workflows show false negatives worth fixing.
- If V2 begins, use the existing SQLite history and typed IPC boundaries as the grounding layer rather than introducing a parallel data path.
