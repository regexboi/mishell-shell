# Completion Specs

Mishell does not fetch command specs from the Fig/Amazon Q CDN at runtime.

Public command completions are vendored into this repo as a generated Mishell-owned registry:

- Source file: `electron/completion/generated/public-specs.generated.json`
- Runtime consumer: `electron/completion/command-completions.ts`
- Update script: `scripts/sync-completion-specs.mjs`

## Update Flow

1. Run `pnpm sync:completion-specs`.
2. Review the generated diff in `electron/completion/generated/public-specs.generated.json`.
3. Run `./vp test`.
4. Commit the generated registry with the code changes that depend on it.

## What The Sync Script Does

- Downloads the current public spec index and spec files.
- Parses the files as source text.
- Extracts only the static subset Mishell supports.
- Writes the sanitized output into the generated JSON registry.

The runtime never `fetch()`es or executes public spec code.

## Supported Imported Fields

The generated registry keeps the subset Mishell currently uses:

- `name`
- `description`
- `subcommands`
- `options`
- `args`
- `suggestions`
- `template`
- `loadSpec`
- generator `script` arrays
- generator `template`
- boolean generator `trigger`

Unsupported dynamic code such as arbitrary functions is intentionally dropped during sync.

## Local Specs

Project-local overrides are still supported and continue to win over the bundled registry when both exist.

Local specs must be inert JSON files in `.fig/autocomplete/build`:

- `.fig/autocomplete/build/my-command.json`
- `.fig/autocomplete/build/nested-command/index.json`

They use the same sanitized Mishell command-spec shape as the bundled registry.

Executable local `.js` specs are intentionally no longer loaded.
