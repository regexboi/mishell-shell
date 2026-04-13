# Completion Spec Import Plan

## Goal

Give Mishell Warp-style command discovery for junior developers:

- fuzzy command, flag, and argument suggestions
- short descriptions in the completion UI
- live values such as branches, containers, namespaces, and scripts
- broad CLI coverage without hand-authoring every command from scratch

The recommended bootstrap source is the Amazon Q / Fig completion ecosystem, not a Mishell-only spec library.

## Why This Direction

Public evidence shows that the Amazon Q / Fig stack exposes:

- an open-source autocomplete runtime and parser
- a public spec CDN
- a large existing spec corpus
- local `.fig/autocomplete/build` support for private or team-specific specs

Key facts verified during research:

- Upstream repo license: `MIT OR Apache-2.0`
- Public spec index exists at `https://specs.q.us-east-1.amazonaws.com/index.json`
- Current corpus size observed on 2026-04-12: `1484` completions
- Diff-versioned specs observed on 2026-04-12: `6`
- Confirmed present in the public corpus: `docker`, `pnpm`, `vite`, `rustup`, `jq`, `kubectl`, `git`, `zip`

Relevant sources:

- `https://github.com/aws/amazon-q-developer-cli-autocomplete`
- `https://github.com/aws/amazon-q-developer-cli-autocomplete/blob/main/packages/autocomplete-parser/src/loadSpec.ts`
- `https://github.com/aws/amazon-q-developer-cli-autocomplete/blob/main/packages/autocomplete-parser/src/loadHelpers.ts`
- `https://specs.q.us-east-1.amazonaws.com/index.json`
- `https://docs.warp.dev/terminal/command-completions/completions`

## Product Position

Mishell should not depend on shell-native completion alone.

Shell-native completion is still useful as a fallback, but the primary experience should be Mishell-owned:

- parse the input buffer ourselves
- resolve command structure from imported specs
- render one consistent UI with descriptions and fuzzy matching
- run a controlled set of dynamic generators for live values

This is the closest match to the Warp behavior the product wants.

## Current Mishell Fit

Mishell already has the right boundary for this work:

- renderer completion behavior is concentrated in `src/components/chrome/shell-scaffold.tsx`
- typed IPC contracts live in `src/shared/contracts.ts`
- completion backends already live in `electron/execution/execution-service.ts`

Today the editor supports:

- history autocomplete
- path completion

That means command-spec completion can be added as a new provider instead of a rewrite.

## Recommendation

Build a Mishell completion engine that imports Fig/Q specs into a Mishell-owned intermediate representation.

Do not couple the product directly to the upstream runtime.

The right architecture is a hybrid:

1. Import static command structure from Fig/Q specs.
2. Support a limited, explicit subset of dynamic generator semantics.
3. Support `loadSpec` for spec composition.
4. Support local `.fig/autocomplete/build` for private specs.
5. Fall back to shell-native or Carapace-style bridging only when Mishell has no structured answer.

## Proposed Intermediate Representation

Mishell should normalize all completion sources into one IR.

Suggested top-level entities:

- `CompletionRequest`
- `CompletionCandidate`
- `CommandSpec`
- `SubcommandNode`
- `OptionNode`
- `ArgumentNode`
- `GeneratorDefinition`
- `GeneratorResult`

Suggested candidate fields:

- `kind`: command, subcommand, option, argument, value, path, history
- `label`
- `insertText`
- `description`
- `source`
- `priority`
- `icon`
- `requiresValue`
- `dangerous`
- `group`
- `replacementRange`

Suggested source values:

- `fig-public`
- `fig-local`
- `mishell-built-in`
- `generator`
- `path`
- `history`
- `shell-fallback`

## Upstream Semantics To Support First

The first importer should handle the subset that produces the most value with the least complexity.

### Phase A: Static Structure

Support:

- `name`
- `description`
- `subcommands`
- `options`
- `args`
- `suggestions`
- `filterStrategy`
- common `template` values such as files and folders
- `loadSpec`

This already gives strong results for many CLIs.

### Phase B: Common Dynamic Behavior

Support a constrained subset of generators:

- array `script`
- function-like triggers after import normalization
- `postProcess`
- cache hints
- query-term based filtering

Focus first on generators that are broadly useful and low risk:

- Git branches
- Docker containers, images, and contexts
- pnpm workspace scripts
- filesystem-backed suggestions

### Phase C: Advanced and Deferred Semantics

Defer initially:

- arbitrary upstream UI-only metadata that does not improve Mishell UX
- broad compatibility with every custom generator edge case
- full execution compatibility with the entire Fig runtime surface
- version-diff execution beyond simple selection and caching

## Import Strategy

### Option 1: Runtime Compatibility Layer

Mishell executes Fig-like specs at request time.

Pros:

- maximum compatibility
- broad corpus support quickly
- fewer translation mismatches

Cons:

- more complexity in sandboxing and performance
- greater coupling to upstream spec semantics
- harder to reason about correctness and caching

### Option 2: Static Importer / Transpiler

Mishell evaluates or parses upstream specs and converts them into its own IR.

Pros:

- better product control
- easier ranking and UI consistency
- easier long-term maintenance

Cons:

- some dynamic behavior will need custom adapters
- not every upstream spec feature will map cleanly

### Recommended Path

Use a hybrid importer:

- translate static structure into Mishell IR
- preserve a small set of supported generator behaviors
- reject or degrade unsupported behaviors safely

This is the best fit for Mishell.

## Spec Sources

Mishell should support three tiers of spec input.

### Tier 1: Public Fig/Q CDN

Primary bootstrap source for breadth.

Use:

- `index.json` for discovery
- `*.js` spec files as sync-time input for conversion into a Mishell-owned registry

This is the fastest path to broad day-one coverage.

### Tier 2: Local `.fig/autocomplete/build`

Primary path for:

- private company tooling
- user custom specs
- offline or pinned development flows

This avoids inventing a new private-spec ecosystem immediately.

Use inert JSON specs only. Mishell should not execute local spec code at runtime.

### Tier 3: Mishell-Owned Built-Ins

Reserved for:

- commands where Mishell wants better UX than upstream provides
- hardening fragile or high-value specs
- commands with special product behavior

Examples:

- `git`
- `docker`
- `kubectl`
- `pnpm`

## Provider Pipeline

Completion resolution should be provider-based.

Suggested order:

1. Mishell built-in spec overrides
2. Imported Fig local specs
3. Imported Fig public specs
4. Mishell dynamic generators
5. Path provider
6. History provider
7. Shell fallback provider

The final UI should merge all results into one ranked list.

## Ranking Rules

Initial ranking policy:

- prefer structured command matches over history
- prefer exact-prefix over fuzzy matches
- prefer current-node-valid options over global noise
- prefer live generator values when a value is expected
- suppress paths when the parser knows a flag or subcommand is expected
- downrank dangerous options unless strongly matched

For junior users, description quality matters as much as lexical match.

## Safety Model

Dynamic generators are the biggest risk area.

Rules:

- no arbitrary shell execution from untrusted specs by default
- support only allowlisted command execution patterns at first
- timebox all generator execution
- cache aggressively
- label stale vs live results internally
- degrade to static suggestions when generator execution fails

If broader generator execution is later supported, it should be guarded by:

- user settings
- provenance labels
- execution timeouts
- explicit environment controls

## Caching

Use layered caching:

- spec index cache
- spec file cache keyed by source and version
- parsed IR cache
- generator result cache keyed by command, cwd, and relevant tokens

Recommended cache modes:

- memory cache for active session
- optional disk cache for public specs
- short TTL for live generators

## Rollout Plan

### Milestone 1: Corpus Ingestion

- fetch and mirror public spec index
- import static structure from public specs
- expose parser-backed command, subcommand, and option suggestions
- ship descriptions in the completion menu

Success condition:

- Mishell can offer structured completions for hundreds of commands on day one

### Milestone 2: High-Value Dynamic Resolvers

- Git branches
- Docker objects
- pnpm scripts and workspaces
- basic Kubernetes contexts and namespaces

Success condition:

- high-value commands feel materially better than shell-native completion

### Milestone 3: Local Spec Support

- read `.fig/autocomplete/build`
- support team or private specs
- require inert JSON local specs
- add provenance display for local vs public specs

Success condition:

- internal tooling can participate without Mishell-specific authoring

### Milestone 4: Fallbacks and Hardening

- shell fallback provider
- optional Carapace bridge exploration
- failure-mode cleanup
- metrics and profiling

Success condition:

- graceful behavior on unsupported commands and low-latency steady state

## Non-Goals

Not part of the first implementation:

- full reimplementation of the complete Fig runtime
- LLM-based suggestion generation on every `Tab`
- replacing shell-native completion for every edge case
- inventing a brand new spec authoring standard before importing an existing one

## Open Questions

- Should Mishell mirror the public CDN into a repo-owned cache artifact, or fetch on demand?
- How much of upstream generator execution should be supported before introducing a settings gate?
- Do we want a visible source label in the UI such as `Public spec`, `Local spec`, or `Live`?
- Should unsupported upstream behaviors be logged to a diagnostics panel for fast iteration?

## Recommended Next Step

Prototype the importer, not the UI.

The first spike should answer:

- Can Mishell ingest `docker`, `pnpm`, `vite`, and `git` from the public corpus into a stable IR?
- Which upstream fields and generator behaviors are required immediately?
- What percentage of the top 100 commands become useful with static import only?

If that spike succeeds, the product can safely scale from a very large starting library instead of hand-curating a tiny initial catalog.
