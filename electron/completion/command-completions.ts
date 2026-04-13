import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type {
  CommandCompletionItem,
  CommandCompletionRequest,
  CommandCompletionResponse,
} from "@shared/contracts";
import bundledPublicSpecs from "./generated/public-specs.generated.json";

const LOCAL_FIG_BUILD_SEGMENTS = [".fig", "autocomplete", "build"] as const;
const MAX_CANDIDATES_TO_DESCRIBE = 6;
const ROOT_COMMAND_NAME_PATTERN = /^[^/\\]+$/;
const ENV_ASSIGNMENT_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*=.*$/;
const SHELL_COMMAND_SEPARATORS = ["&&", "||", "|&", "|", ";", "&"] as const;
const WRAPPER_COMMANDS = new Set(["builtin", "command", "exec", "nohup", "time"]);
const DYNAMIC_GENERATOR_COMMAND_ALLOWLIST = new Set([
  "bash",
  "cat",
  "docker",
  "git",
  "jq",
  "kubectl",
  "ls",
  "npm",
  "pnpm",
  "rustup",
  "sh",
]);
const COMPLETION_GENERATOR_TIMEOUT_MS = 1200;
const COMPLETION_GENERATOR_KILL_GRACE_MS = 150;
const WRAPPER_OPTIONS_WITH_ARGUMENT = new Map<string, Set<string>>([
  [
    "env",
    new Set(["-c", "-s", "-u", "--chdir", "--split-string", "--unset"]),
  ],
  [
    "exec",
    new Set(["-a"]),
  ],
  [
    "sudo",
    new Set([
      "-c",
      "-g",
      "-h",
      "-p",
      "-r",
      "-t",
      "-u",
      "--group",
      "--host",
      "--prompt",
      "--role",
      "--type",
      "--user",
    ]),
  ],
  [
    "time",
    new Set(["-f", "-o", "--format", "--output"]),
  ],
]);

type FigSuggestion =
  | string
  | {
      description?: string;
      displayName?: string;
      insertValue?: string;
      name?: string | string[];
    };

type FigGenerator = {
  custom?: (
    tokens: string[],
    execute: ExecuteCommand,
    generatorContext?: unknown,
  ) => Promise<FigSuggestion[] | null | undefined> | FigSuggestion[] | null | undefined;
  postProcess?: (
    stdout: string,
    tokens: string[],
    generatorContext?: unknown,
  ) => FigSuggestion[] | null | undefined;
  script?:
    | string[]
    | ((tokens: string[], query: string) => string[] | undefined | null);
  template?: string | string[];
  trigger?: boolean | ((tokens: string[], query: string) => boolean);
};

type FigArgument = {
  description?: string;
  generators?: FigGenerator | FigGenerator[];
  isVariadic?: boolean;
  suggestions?: FigSuggestion[];
  template?: string | string[];
};

type FigOption = {
  args?: FigArgument | FigArgument[];
  description?: string;
  isDangerous?: boolean;
  isPersistent?: boolean;
  name?: string | string[];
};

type FigCommand = {
  args?: FigArgument | FigArgument[];
  description?: string;
  generateSpec?: (
    tokens: string[],
    execute: ExecuteCommand,
  ) => Promise<FigCommand | null | undefined> | FigCommand | null | undefined;
  loadSpec?: string;
  name?: string | string[];
  options?: FigOption[];
  subcommands?: FigCommand[];
};

type ExecuteCommand = (input: {
  args?: string[];
  command: string;
  cwd?: string;
}) => Promise<{
  exitCode: number | null;
  stderr: string;
  stdout: string;
}>;

type CommandRegistry = {
  executeCommand?: ExecuteCommand;
  listCommands: () => Promise<Array<{ name: string; source: "fig-local" | "fig-public" }>>;
  loadSpec: (
    name: string,
  ) => Promise<{
    source: "fig-local" | "fig-public";
    spec: FigCommand;
  } | null>;
};

type CompletionToken = {
  end: number;
  start: number;
  value: string;
};

type ParsedDraft = {
  currentToken: CompletionToken | null;
  tokens: CompletionToken[];
  trailingWhitespace: boolean;
};

type ActiveCommandContext = {
  ancestors: Array<{
    source: "fig-local" | "fig-public";
    spec: FigCommand;
  }>;
  commandTokens: string[];
  current: {
    source: "fig-local" | "fig-public";
    spec: FigCommand;
  };
  cwd: string;
  executeCommand: ExecuteCommand;
  pendingArgument: FigArgument | null;
  positionalIndex: number;
  query: string;
  replacementEnd: number;
  replacementStart: number;
};

type PendingOptionArgument = {
  argumentIndex: number;
  option: FigOption;
};

const publicCommandIndexPromiseCache = new Map<string, Promise<string[]>>();
const localCommandIndexPromiseCache = new Map<string, Promise<string[]>>();
const localCommandSpecPromiseCache = new Map<
  string,
  Promise<{ source: "fig-local"; spec: FigCommand } | null>
>();
const bundledPublicSpecRegistry = bundledPublicSpecs as {
  commands: string[];
  specs: Record<string, FigCommand>;
};

export async function resolveCommandCompletions(
  input: CommandCompletionRequest,
): Promise<CommandCompletionResponse> {
  return resolveCommandCompletionsWithRegistry(input, createCommandRegistry(input.cwd));
}

export async function resolveCommandCompletionsWithRegistry(
  input: CommandCompletionRequest,
  registry: CommandRegistry,
): Promise<CommandCompletionResponse> {
  const parsedDraft = parseCompletionDraft(input.draft);
  const limit = input.limit;
  const offset = input.offset;

  if (parsedDraft.tokens.length === 0) {
    return {
      hasMore: false,
      items: [],
      resolvedCommand: false,
      yieldToPath: false,
    };
  }

  const commandTokenIndex = getCommandTokenIndex(parsedDraft.tokens);

  if (commandTokenIndex === null) {
    return {
      hasMore: false,
      items: [],
      resolvedCommand: false,
      yieldToPath: false,
    };
  }

  const commandToken = parsedDraft.tokens[commandTokenIndex];
  const isCompletingCommandToken = parsedDraft.currentToken === commandToken;

  if (isCompletingCommandToken) {
    const commandQuery = parsedDraft.currentToken?.value ?? "";

    if (!commandQuery) {
      return {
        hasMore: false,
        items: [],
        resolvedCommand: false,
        yieldToPath: false,
      };
    }

    return resolveRootCommandCompletions({
      draft: input.draft,
      limit,
      offset,
      query: commandQuery,
      registry,
      replacementEnd: parsedDraft.currentToken?.end ?? input.draft.length,
      replacementStart: parsedDraft.currentToken?.start ?? input.draft.length,
    });
  }

  const context = await resolveActiveCommandContext(
    parsedDraft,
    registry,
    commandTokenIndex,
    input.cwd,
    input.draft.length,
  );

  if (!context) {
    return {
      hasMore: false,
      items: [],
      resolvedCommand: false,
      yieldToPath: false,
    };
  }

  return buildContextualCompletions({
    context,
    draft: input.draft,
    limit,
    offset,
  });
}

function createCommandRegistry(cwd: string): CommandRegistry {
  const localSpecDirectories = getLocalSpecDirectories(cwd);

  return {
    listCommands: async () => {
      const [localCommands, publicCommands] = await Promise.all([
        loadLocalCommandIndex(localSpecDirectories),
        loadBundledCommandIndex(),
      ]);

      const merged = new Map<string, "fig-local" | "fig-public">();

      for (const name of publicCommands) {
        merged.set(name, "fig-public");
      }

      for (const name of localCommands) {
        merged.set(name, "fig-local");
      }

      return [...merged.entries()]
        .map(([name, source]) => ({ name, source }))
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    loadSpec: async (name) => {
      const local = await loadLocalSpec(name, localSpecDirectories);

      if (local) {
        return local;
      }

      return loadBundledSpec(name);
    },
  };
}

function getLocalSpecDirectories(cwd: string) {
  const directories: string[] = [];
  const visited = new Set<string>();
  const homeDirectory = os.homedir();
  let currentDirectory = path.resolve(cwd);

  while (true) {
    const candidate = path.join(currentDirectory, ...LOCAL_FIG_BUILD_SEGMENTS);

    if (!visited.has(candidate)) {
      directories.push(candidate);
      visited.add(candidate);
    }

    if (currentDirectory === homeDirectory || currentDirectory === path.parse(currentDirectory).root) {
      break;
    }

    currentDirectory = path.dirname(currentDirectory);
  }

  const homeBuildDirectory = path.join(homeDirectory, ...LOCAL_FIG_BUILD_SEGMENTS);

  if (!visited.has(homeBuildDirectory)) {
    directories.push(homeBuildDirectory);
  }

  return directories;
}

async function loadLocalCommandIndex(specDirectories: string[]) {
  const cacheKey = specDirectories.join("|");

  if (!localCommandIndexPromiseCache.has(cacheKey)) {
    localCommandIndexPromiseCache.set(cacheKey, Promise.resolve(scanLocalCommandIndex(specDirectories)));
  }

  return localCommandIndexPromiseCache.get(cacheKey)!;
}

function scanLocalCommandIndex(specDirectories: string[]) {
  const names = new Set<string>();

  for (const directory of specDirectories) {
    let entries: fs.Dirent[];

    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        names.add(entry.name.slice(0, -5));
        continue;
      }

      if (entry.isDirectory()) {
        const indexPath = path.join(directory, entry.name, "index.json");

        if (fs.existsSync(indexPath)) {
          names.add(entry.name);
        }
      }
    }
  }

  return [...names].filter((value) => ROOT_COMMAND_NAME_PATTERN.test(value)).sort((left, right) =>
    left.localeCompare(right),
  );
}

async function loadPublicCommandIndex() {
  const cacheKey = "bundled-public-spec-index";

  if (!publicCommandIndexPromiseCache.has(cacheKey)) {
    publicCommandIndexPromiseCache.set(
      cacheKey,
      Promise.resolve(getBundledPublicCommandIndex()),
    );
  }

  return publicCommandIndexPromiseCache.get(cacheKey)!;
}

async function loadBundledCommandIndex() {
  return loadPublicCommandIndex();
}

function getBundledPublicCommandIndex() {
  return bundledPublicSpecRegistry.commands
    .filter((value): value is string => typeof value === "string")
    .filter((value) => ROOT_COMMAND_NAME_PATTERN.test(value))
    .sort((left, right) => left.localeCompare(right));
}

async function loadLocalSpec(
  name: string,
  specDirectories: string[],
): Promise<{ source: "fig-local"; spec: FigCommand } | null> {
  const cacheKey = `${specDirectories.join("|")}::${name}`;

  if (!localCommandSpecPromiseCache.has(cacheKey)) {
    localCommandSpecPromiseCache.set(cacheKey, Promise.resolve(importLocalSpec(name, specDirectories)));
  }

  return localCommandSpecPromiseCache.get(cacheKey)!;
}

async function importLocalSpec(
  name: string,
  specDirectories: string[],
): Promise<{ source: "fig-local"; spec: FigCommand } | null> {
  for (const directory of specDirectories) {
    const filePath = getSpecFilePath(directory, name);

    if (!filePath) {
      continue;
    }

    try {
      const source = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(source) as unknown;

      if (!isFigCommand(parsed)) {
        continue;
      }

      return {
        source: "fig-local",
        spec: parsed,
      };
    } catch {
      continue;
    }
  }

  return null;
}

async function loadBundledSpec(
  name: string,
): Promise<{ source: "fig-public"; spec: FigCommand } | null> {
  const spec = bundledPublicSpecRegistry.specs[name];

  if (!isFigCommand(spec)) {
    return null;
  }

  return {
    source: "fig-public",
    spec,
  };
}

async function resolveRootCommandCompletions({
  draft,
  limit,
  offset,
  query,
  registry,
  replacementEnd,
  replacementStart,
}: {
  draft: string;
  limit: number;
  offset: number;
  query: string;
  registry: CommandRegistry;
  replacementEnd: number;
  replacementStart: number;
}): Promise<CommandCompletionResponse> {
  const commands = await registry.listCommands();
  const rankedNames = commands
    .map((candidate) => ({
      ...candidate,
      score: fuzzyScore(candidate.name, query),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      if (left.source !== right.source) {
        return left.source === "fig-local" ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

  const { hasMore, items: pageCandidates } = paginateCandidates(
    rankedNames,
    offset,
    limit,
  );

  const describedNames = await Promise.all(
    pageCandidates.slice(0, MAX_CANDIDATES_TO_DESCRIBE).map(async (candidate) => ({
      description: (await registry.loadSpec(candidate.name))?.spec.description ?? null,
      name: candidate.name,
      source: candidate.source,
    })),
  );

  const descriptionByName = new Map(
    describedNames.map((candidate) => [candidate.name, candidate.description]),
  );

  return {
    hasMore,
    items: pageCandidates.map((candidate) => ({
      description: descriptionByName.get(candidate.name) ?? null,
      detail: getSpecSourceDetail(candidate.source),
      kind: "command",
      label: candidate.name,
      nextValue: applyCompletionReplacement({
        draft,
        insertText: `${candidate.name} `,
        replacementEnd,
        replacementStart,
      }),
      source: candidate.source,
    } satisfies CommandCompletionItem)),
    resolvedCommand: false,
    yieldToPath: false,
  };
}

async function resolveActiveCommandContext(
  parsedDraft: ParsedDraft,
  registry: CommandRegistry,
  commandTokenIndex: number,
  cwd: string,
  draftLength: number,
): Promise<ActiveCommandContext | null> {
  const commandToken = parsedDraft.tokens[commandTokenIndex];
  const executeCommand =
    registry.executeCommand ?? createGeneratorExecutor(commandToken.value, cwd);
  const rootSpec = await materializeLoadedSpec(
    await registry.loadSpec(commandToken.value),
    parsedDraft.tokens
      .slice(commandTokenIndex)
      .map((token) => token.value)
      .concat(parsedDraft.trailingWhitespace ? [""] : []),
    executeCommand,
  );

  if (!rootSpec) {
    return null;
  }

  const currentToken = parsedDraft.currentToken;
  let replacementStart = currentToken?.start ?? draftLength;
  let replacementEnd = currentToken?.end ?? replacementStart;
  let query = currentToken?.value ?? "";
  const commandTokens = parsedDraft.tokens
    .slice(commandTokenIndex)
    .map((token) => token.value);

  if (parsedDraft.trailingWhitespace) {
    commandTokens.push("");
  }

  const tokensToTraverse = parsedDraft.trailingWhitespace
    ? parsedDraft.tokens.slice(commandTokenIndex + 1)
    : parsedDraft.tokens.slice(commandTokenIndex + 1, -1);

  let current = rootSpec;
  const ancestors = [rootSpec];
  let positionalIndex = 0;
  let pendingOptionArgument: PendingOptionArgument | null = null;

  for (const token of tokensToTraverse) {
    if (pendingOptionArgument) {
      pendingOptionArgument = getNextPendingOptionArgument(pendingOptionArgument);
      continue;
    }

    const optionMatch = findMatchingOption(
      [
        ...getPersistentOptions(ancestors.map((ancestor) => ancestor.spec)),
        ...getOptions(current.spec),
      ],
      token.value,
    );

    if (optionMatch) {
      if (optionConsumesInlineValue(optionMatch, token.value)) {
        continue;
      }

      if (getOptionArgument(optionMatch)) {
        pendingOptionArgument = {
          argumentIndex: 0,
          option: optionMatch,
        };
      }

      continue;
    }

    const matchedSubcommand = await findMatchingSubcommand(
      current,
      token.value,
      registry,
      commandTokens,
      executeCommand,
    );

    if (matchedSubcommand) {
      current = matchedSubcommand;
      ancestors.push(matchedSubcommand);
      positionalIndex = 0;
      pendingOptionArgument = null;
      continue;
    }

    positionalIndex += 1;
  }

  const pendingArgument = pendingOptionArgument
    ? getOptionArgument(pendingOptionArgument.option, pendingOptionArgument.argumentIndex)
    : null;
  const inlineOptionValueContext =
    currentToken && !parsedDraft.trailingWhitespace
      ? resolveInlineOptionValueContext(
          [
            ...getPersistentOptions(ancestors.map((ancestor) => ancestor.spec)),
            ...getOptions(current.spec),
          ],
          currentToken,
        )
      : null;
  const activePendingArgument =
    inlineOptionValueContext?.argument ?? pendingArgument;

  if (inlineOptionValueContext) {
    query = inlineOptionValueContext.query;
    replacementStart = inlineOptionValueContext.replacementStart;
    replacementEnd = inlineOptionValueContext.replacementEnd;
  }

  return {
    ancestors,
    commandTokens,
    current,
    cwd,
    executeCommand,
    pendingArgument: activePendingArgument,
    positionalIndex,
    query,
    replacementEnd,
    replacementStart,
  };
}

async function buildContextualCompletions({
  context,
  draft,
  limit,
  offset,
}: {
  context: ActiveCommandContext;
  draft: string;
  limit: number;
  offset: number;
}): Promise<CommandCompletionResponse> {
  const activeArgument =
    context.pendingArgument ??
    resolvePositionalArgument(context.current.spec.args, context.positionalIndex);
  const yieldToPath = shouldYieldToPathCompletion(activeArgument);

  const valueCompletions = await buildArgumentValueCompletions({
    argument: activeArgument,
    context,
    draft,
    limit,
    offset,
  });

  if (valueCompletions.items.length > 0) {
    return {
      ...valueCompletions,
      yieldToPath,
    };
  }

  if (yieldToPath) {
    return {
      hasMore: false,
      items: [],
      resolvedCommand: true,
      yieldToPath: true,
    };
  }

  const subcommandCandidates = getSubcommands(context.current.spec)
    .map((subcommand) => {
      const label = getPreferredName(subcommand.name);

      if (!label || context.query.startsWith("-")) {
        return null;
      }

      const score = fuzzyScore(label, context.query);

      if (score < 0) {
        return null;
      }

      return {
        description: subcommand.description ?? null,
        detail:
          getSpecSourceDetail(context.current.source),
        insertText: `${label} `,
        kind: "subcommand" as const,
        label,
        score,
        source: context.current.source,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const optionCandidates = (context.query.startsWith("-") || !context.query
    ? getCompletionOptions(context.ancestors, context.current)
    : []
  )
    .map((option) => {
      const label = getPreferredName(option.name);

      if (!label) {
        return null;
      }

      const score = fuzzyScore(label, context.query);

      if (score < 0) {
        return null;
      }

      return {
        description: option.description ?? null,
        detail:
          getSpecSourceDetail(context.current.source),
        insertText: `${label}${getOptionArgument(option) ? " " : ""}`,
        kind: "option" as const,
        label,
        score: score + (context.query.startsWith("-") && label.startsWith("--") ? 2 : 0),
        source: context.current.source,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

  const rankedCandidates = [...subcommandCandidates, ...optionCandidates]
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      const leftKindPriority = getContextualCandidateKindPriority(left.kind, context.query);
      const rightKindPriority = getContextualCandidateKindPriority(right.kind, context.query);

      if (leftKindPriority !== rightKindPriority) {
        return leftKindPriority - rightKindPriority;
      }

      if (left.source !== right.source) {
        return left.source === "fig-local" ? -1 : 1;
      }

      return left.label.localeCompare(right.label);
    });
  const { hasMore, items: pageCandidates } = paginateCandidates(
    rankedCandidates,
    offset,
    limit,
  );

  return {
    hasMore,
    items: pageCandidates.map((candidate) => ({
      description: candidate.description,
      detail: candidate.detail,
      kind: candidate.kind,
      label: candidate.label,
      nextValue: applyCompletionReplacement({
        draft,
        insertText: candidate.insertText,
        replacementEnd: context.replacementEnd,
        replacementStart: context.replacementStart,
      }),
      source: candidate.source,
    } satisfies CommandCompletionItem)),
    resolvedCommand: true,
    yieldToPath: false,
  };
}

function getContextualCandidateKindPriority(
  kind: "option" | "subcommand",
  query: string,
) {
  if (query.startsWith("-")) {
    return kind === "option" ? 0 : 1;
  }

  if (!query) {
    return kind === "subcommand" ? 0 : 1;
  }

  return 0;
}

async function buildArgumentValueCompletions({
  argument,
  context,
  draft,
  limit,
  offset,
}: {
  argument: FigArgument | null;
  context: ActiveCommandContext;
  draft: string;
  limit: number;
  offset: number;
}): Promise<CommandCompletionResponse> {
  if (!argument) {
    return {
      hasMore: false,
      items: [],
      resolvedCommand: true,
      yieldToPath: false,
    };
  }

  const staticSuggestions = argument.suggestions
    ? normalizeSuggestions(argument.suggestions)
    : [];
  const generatorSuggestions = await resolveGeneratorSuggestions(argument, context);
  const candidates = deduplicateCandidates([...staticSuggestions, ...generatorSuggestions])
    .map((suggestion) => ({
      ...suggestion,
      score: fuzzyScore(suggestion.label, context.query),
    }))
    .filter((candidate) => candidate.score >= 0)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }

      return left.label.localeCompare(right.label);
    });
  const { hasMore, items: pageCandidates } = paginateCandidates(
    candidates,
    offset,
    limit,
  );

  return {
    hasMore,
    items: pageCandidates.map((candidate) => ({
      description: candidate.description,
      detail:
        candidate.detail ?? getSpecSourceDetail(context.current.source),
      kind: "value",
      label: candidate.label,
      nextValue: applyCompletionReplacement({
        draft,
        insertText: `${candidate.insertText}${argument.isVariadic ? "" : " "}`,
        replacementEnd: context.replacementEnd,
        replacementStart: context.replacementStart,
      }),
      source: context.current.source,
    } satisfies CommandCompletionItem)),
    resolvedCommand: true,
    yieldToPath: false,
  };
}

function paginateCandidates<T>(items: T[], offset: number, limit: number) {
  const pageItems = items.slice(offset, offset + limit);

  return {
    hasMore: offset + pageItems.length < items.length,
    items: pageItems,
  };
}

async function resolveGeneratorSuggestions(
  argument: FigArgument,
  context: ActiveCommandContext,
) {
  const generators = normalizeGenerators(argument.generators);

  if (generators.length === 0) {
    return [];
  }

  const suggestions = await Promise.all(
    generators.map((generator) => resolveGeneratorSuggestionsForOne(generator, argument, context)),
  );

  return suggestions.flat();
}

async function resolveGeneratorSuggestionsForOne(
  generator: FigGenerator,
  argument: FigArgument,
  context: ActiveCommandContext,
) {
  if (!shouldRunGenerator(generator, context.commandTokens, context.query)) {
    return [];
  }

  const execute = context.executeCommand;

  try {
    if (typeof generator.custom === "function") {
      const result = await generator.custom(context.commandTokens, execute, {
        currentWorkingDirectory: context.cwd,
      });

      return normalizeSuggestions(result ?? []).map((item) => ({
        ...item,
        detail: argument.description ?? "Live",
      }));
    }

    const script = resolveGeneratorScript(generator, context.commandTokens, context.query);

    if (!script || script.length === 0) {
      return [];
    }

    const [command, ...args] = script;
    const output = await execute({
      args,
      command,
      cwd: context.cwd,
    });

    if (output.exitCode !== 0) {
      return [];
    }

    if (typeof generator.postProcess === "function") {
      return normalizeSuggestions(
        generator.postProcess(output.stdout, context.commandTokens, {
          currentWorkingDirectory: context.cwd,
        }) ?? [],
      ).map((item) => ({
        ...item,
        detail: argument.description ?? "Live",
      }));
    }

    return output.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        description: null,
        detail: argument.description ?? "Live",
        insertText: line,
        label: line,
      }));
  } catch {
    return [];
  }
}

function shouldRunGenerator(
  generator: FigGenerator,
  tokens: string[],
  query: string,
) {
  if (generator.trigger === undefined) {
    return true;
  }

  if (typeof generator.trigger === "boolean") {
    return generator.trigger;
  }

  try {
    return generator.trigger(tokens, query);
  } catch {
    return false;
  }
}

function resolveGeneratorScript(
  generator: FigGenerator,
  tokens: string[],
  query: string,
) {
  if (Array.isArray(generator.script)) {
    return generator.script;
  }

  if (typeof generator.script === "function") {
    try {
      const result = generator.script(tokens, query);
      return Array.isArray(result) ? result : null;
    } catch {
      return null;
    }
  }

  return null;
}

function createDefaultExecuteCommand(): ExecuteCommand {
  return async ({ args = [], command, cwd }) =>
    new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;
      let forceKillTimer: NodeJS.Timeout | null = null;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const finish = (result: {
        exitCode: number | null;
        stderr: string;
        stdout: string;
      }) => {
        if (settled) {
          return;
        }

        settled = true;

        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
        }

        if (forceKillTimer) {
          clearTimeout(forceKillTimer);
        }

        resolve(result);
      };

      try {
        const child = spawn(command, args, {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
        });

        child.stdout?.setEncoding("utf8");
        child.stdout?.on("data", (chunk: string) => {
          stdout += chunk;
        });

        child.stderr?.setEncoding("utf8");
        child.stderr?.on("data", (chunk: string) => {
          stderr += chunk;
        });

        child.on("error", (error) => {
          finish({
            exitCode: 1,
            stderr: appendGeneratorStderr(stderr, error.message),
            stdout,
          });
        });

        child.on("close", (exitCode) => {
          finish({
            exitCode: timedOut ? null : exitCode,
            stderr,
            stdout,
          });
        });

        timeoutTimer = setTimeout(() => {
          timedOut = true;
          stderr = appendGeneratorStderr(
            stderr,
            `Completion generator timed out after ${COMPLETION_GENERATOR_TIMEOUT_MS} ms`,
          );
          child.kill("SIGTERM");
          forceKillTimer = setTimeout(() => {
            child.kill("SIGKILL");
          }, COMPLETION_GENERATOR_KILL_GRACE_MS);
          forceKillTimer.unref?.();
        }, COMPLETION_GENERATOR_TIMEOUT_MS);
        timeoutTimer.unref?.();
      } catch (error) {
        finish({
          exitCode: 1,
          stderr:
            error instanceof Error ? error.message : "Failed to start completion generator",
          stdout,
        });
      }
    });
}

function createGeneratorExecutor(rootCommand: string, cwd: string): ExecuteCommand {
  const execute = createDefaultExecuteCommand();

  return async ({ args = [], command, cwd: targetCwd = cwd }) => {
    if (
      command !== rootCommand &&
      !DYNAMIC_GENERATOR_COMMAND_ALLOWLIST.has(command)
    ) {
      return {
        exitCode: 1,
        stderr: `Generator command ${command} is not allowed`,
        stdout: "",
      };
    }

    return execute({
      args,
      command,
      cwd: targetCwd,
    });
  };
}

function deduplicateCandidates(
  candidates: Array<{
    description: string | null;
    detail?: string | null;
    insertText: string;
    label: string;
  }>,
) {
  const seen = new Set<string>();
  const unique: typeof candidates = [];

  for (const candidate of candidates) {
    const key = `${candidate.label}\u0000${candidate.insertText}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

function shouldYieldToPathCompletion(argument: FigArgument | null) {
  if (!argument) {
    return false;
  }

  if (hasFilesystemTemplate(argument.template)) {
    return true;
  }

  return normalizeGenerators(argument.generators).some((generator) =>
    hasFilesystemTemplate(generator.template),
  );
}

function normalizeGenerators(generators: FigArgument["generators"]) {
  if (!generators) {
    return [];
  }

  return Array.isArray(generators) ? generators : [generators];
}

function normalizeSuggestions(suggestions: FigSuggestion[]) {
  return suggestions
    .map((suggestion) => {
      if (typeof suggestion === "string") {
        return {
          description: null,
          insertText: suggestion,
          label: suggestion,
        };
      }

      const label = suggestion.displayName ?? getPreferredName(suggestion.name);

      if (!label) {
        return null;
      }

      return {
        description: suggestion.description ?? null,
        insertText:
          suggestion.insertValue ?? getPreferredName(suggestion.name) ?? label,
        label,
      };
    })
    .filter((suggestion): suggestion is NonNullable<typeof suggestion> => suggestion !== null);
}

async function findMatchingSubcommand(
  command: { source: "fig-local" | "fig-public"; spec: FigCommand },
  tokenValue: string,
  registry: CommandRegistry,
  commandTokens: string[],
  executeCommand: ExecuteCommand,
) {
  for (const subcommand of getSubcommands(command.spec)) {
    if (!matchesAlias(subcommand.name, tokenValue)) {
      continue;
    }

    if (!subcommand.loadSpec) {
      return {
        source: command.source,
        spec: subcommand,
      };
    }

    return (await materializeLoadedSpec(
      await registry.loadSpec(subcommand.loadSpec),
      commandTokens,
      executeCommand,
    )) ?? {
      source: command.source,
      spec: subcommand,
    };
  }

  return null;
}

function getCompletionOptions(
  ancestors: Array<{ source: "fig-local" | "fig-public"; spec: FigCommand }>,
  current: { source: "fig-local" | "fig-public"; spec: FigCommand },
) {
  const seen = new Set<string>();
  const items: FigOption[] = [];

  for (const option of [
    ...getPersistentOptions(ancestors.map((ancestor) => ancestor.spec)),
    ...getOptions(current.spec),
  ]) {
    const key = getPreferredName(option.name);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push(option);
  }

  return items;
}

function getPersistentOptions(ancestors: FigCommand[]) {
  return ancestors.flatMap((ancestor) =>
    getOptions(ancestor).filter((option) => option.isPersistent),
  );
}

function getSubcommands(command: FigCommand) {
  return Array.isArray(command.subcommands) ? command.subcommands : [];
}

function getOptions(command: FigCommand) {
  return Array.isArray(command.options) ? command.options : [];
}

function getOptionArguments(option: FigOption) {
  if (!option.args) {
    return [];
  }

  return Array.isArray(option.args) ? option.args : [option.args];
}

function getOptionArgument(option: FigOption, argumentIndex = 0) {
  const args = getOptionArguments(option);
  const selected = args[argumentIndex] ?? args.at(-1);

  if (!selected) {
    return null;
  }

  if (selected.isVariadic) {
    return selected;
  }

  return args[argumentIndex] ?? null;
}

function getNextPendingOptionArgument(pendingOptionArgument: PendingOptionArgument) {
  const currentArgument = getOptionArgument(
    pendingOptionArgument.option,
    pendingOptionArgument.argumentIndex,
  );

  if (!currentArgument) {
    return null;
  }

  if (currentArgument.isVariadic) {
    return pendingOptionArgument;
  }

  if (!getOptionArgument(pendingOptionArgument.option, pendingOptionArgument.argumentIndex + 1)) {
    return null;
  }

  return {
    argumentIndex: pendingOptionArgument.argumentIndex + 1,
    option: pendingOptionArgument.option,
  };
}

function resolveInlineOptionValueContext(
  options: FigOption[],
  currentToken: CompletionToken,
) {
  for (const option of options) {
    for (const alias of toAliases(option.name)) {
      if (!alias.startsWith("--") || !currentToken.value.startsWith(`${alias}=`)) {
        continue;
      }

      const argument = getOptionArgument(option);

      if (!argument) {
        return null;
      }

      const query = currentToken.value.slice(alias.length + 1);

      return {
        argument,
        query,
        replacementEnd: currentToken.end,
        replacementStart: currentToken.start + alias.length + 1,
      };
    }
  }

  return null;
}

function resolvePositionalArgument(
  args: FigCommand["args"],
  positionalIndex: number,
): FigArgument | null {
  if (!args) {
    return null;
  }

  if (!Array.isArray(args)) {
    return args;
  }

  const selected = args[positionalIndex] ?? args.at(-1);

  if (!selected) {
    return null;
  }

  if (selected.isVariadic) {
    return selected;
  }

  return args[positionalIndex] ?? null;
}

function findMatchingOption(options: FigOption[], tokenValue: string) {
  return (
    options.find((option) =>
      toAliases(option.name).some(
        (alias) =>
          tokenValue === alias ||
          (alias.startsWith("--") && tokenValue.startsWith(`${alias}=`)),
      ),
    ) ?? null
  );
}

function optionConsumesInlineValue(option: FigOption, tokenValue: string) {
  if (!getOptionArgument(option)) {
    return false;
  }

  return toAliases(option.name).some(
    (alias) => alias.startsWith("--") && tokenValue.startsWith(`${alias}=`),
  );
}

function parseCompletionDraft(draft: string): ParsedDraft {
  const tokens: CompletionToken[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;
  let tokenStart = -1;

  for (let index = 0; index < draft.length; index += 1) {
    const character = draft[index]!;

    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      if (quote !== "'") {
        escaping = true;
        if (tokenStart < 0) {
          tokenStart = index;
        }
        continue;
      }

      if (tokenStart < 0) {
        tokenStart = index;
      }

      current += character;
      continue;
    }

    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      if (tokenStart < 0) {
        tokenStart = index;
      }
      continue;
    }

    const separator = getShellCommandSeparator(draft, index);

    if (separator) {
      if (tokenStart >= 0) {
        tokens.push({
          end: index,
          start: tokenStart,
          value: current,
        });
        current = "";
        tokenStart = -1;
      }

      tokens.push({
        end: index + separator.length,
        start: index,
        value: separator,
      });
      index += separator.length - 1;
      continue;
    }

    if (/\s/.test(character)) {
      if (tokenStart >= 0) {
        tokens.push({
          end: index,
          start: tokenStart,
          value: current,
        });
        current = "";
        tokenStart = -1;
      }

      continue;
    }

    if (tokenStart < 0) {
      tokenStart = index;
    }

    current += character;
  }

  if (tokenStart >= 0) {
    tokens.push({
      end: draft.length,
      start: tokenStart,
      value: current,
    });
  }

  return {
    currentToken: /\s$/.test(draft) ? null : (tokens.at(-1) ?? null),
    tokens,
    trailingWhitespace: /\s$/.test(draft),
  };
}

function getCommandTokenIndex(tokens: CompletionToken[]) {
  let segmentStart = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    if (isCommandSeparatorToken(tokens[index]!.value)) {
      segmentStart = index + 1;
    }
  }

  let index = segmentStart;

  while (index < tokens.length && ENV_ASSIGNMENT_PATTERN.test(tokens[index]!.value)) {
    index += 1;
  }

  while (index < tokens.length) {
    const token = tokens[index]!.value;
    const normalized = token.toLowerCase();

    if (isCommandSeparatorToken(token)) {
      return null;
    }

    if (normalized === "sudo" || normalized === "env" || WRAPPER_COMMANDS.has(normalized)) {
      index = skipWrapperTokens(tokens, index, normalized);
      continue;
    }

    return index;
  }

  return null;
}

function skipWrapperTokens(
  tokens: CompletionToken[],
  startIndex: number,
  wrapper: string,
) {
  let index = startIndex + 1;

  while (index < tokens.length) {
    const value = tokens[index]!.value;

    if (isCommandSeparatorToken(value)) {
      break;
    }

    if (value === "--") {
      index += 1;
      break;
    }

    if (wrapper === "env" && ENV_ASSIGNMENT_PATTERN.test(value)) {
      index += 1;
      continue;
    }

    if (!value.startsWith("-") || value === "-") {
      break;
    }

    const consumesArgument = wrapperOptionConsumesNextToken(wrapper, value);
    index += 1;

    if (consumesArgument && index < tokens.length && tokens[index]!.value !== "--") {
      index += 1;
    }
  }

  return index;
}

function getShellCommandSeparator(draft: string, index: number) {
  return SHELL_COMMAND_SEPARATORS.find((separator) => draft.startsWith(separator, index)) ?? null;
}

function isCommandSeparatorToken(tokenValue: string) {
  return SHELL_COMMAND_SEPARATORS.includes(tokenValue as (typeof SHELL_COMMAND_SEPARATORS)[number]);
}

function wrapperOptionConsumesNextToken(wrapper: string, tokenValue: string) {
  const options = WRAPPER_OPTIONS_WITH_ARGUMENT.get(wrapper);

  if (!options) {
    return false;
  }

  const normalized = tokenValue.toLowerCase();

  for (const option of options) {
    if (normalized === option) {
      return true;
    }

    if (normalized.startsWith(`${option}=`)) {
      return false;
    }

    if (option.startsWith("-") && !option.startsWith("--") && normalized.startsWith(option)) {
      return false;
    }
  }

  return false;
}

function appendGeneratorStderr(existing: string, message: string) {
  if (!message) {
    return existing;
  }

  return existing ? `${existing}\n${message}` : message;
}

function fuzzyScore(candidate: string, query: string) {
  if (!query) {
    return 0;
  }

  const normalizedCandidate = candidate.toLowerCase();
  const normalizedQuery = query.toLowerCase();

  if (normalizedCandidate === normalizedQuery) {
    return 10_000;
  }

  if (normalizedCandidate.startsWith(normalizedQuery)) {
    return 8_000 - (normalizedCandidate.length - normalizedQuery.length);
  }

  const containsIndex = normalizedCandidate.indexOf(normalizedQuery);

  if (containsIndex >= 0) {
    return 6_000 - containsIndex * 10;
  }

  let queryIndex = 0;
  let score = 0;
  let contiguous = 0;

  for (
    let candidateIndex = 0;
    candidateIndex < normalizedCandidate.length;
    candidateIndex += 1
  ) {
    if (normalizedCandidate[candidateIndex] !== normalizedQuery[queryIndex]) {
      contiguous = 0;
      continue;
    }

    score += 25 + contiguous * 10;
    queryIndex += 1;
    contiguous += 1;

    if (queryIndex >= normalizedQuery.length) {
      return 1_000 + score - normalizedCandidate.length;
    }
  }

  return -1;
}

function applyCompletionReplacement({
  draft,
  insertText,
  replacementEnd,
  replacementStart,
}: {
  draft: string;
  insertText: string;
  replacementEnd: number;
  replacementStart: number;
}) {
  return `${draft.slice(0, replacementStart)}${insertText}${draft.slice(replacementEnd)}`;
}

function toAliases(name: string | string[] | undefined) {
  if (typeof name === "string") {
    return [name];
  }

  if (Array.isArray(name)) {
    return name.filter((value): value is string => typeof value === "string");
  }

  return [];
}

function getPreferredName(name: string | string[] | undefined) {
  const aliases = toAliases(name);

  return (
    aliases.find((alias) => alias.startsWith("--")) ??
    aliases.find((alias) => !alias.startsWith("-")) ??
    aliases[0] ??
    null
  );
}

function matchesAlias(name: string | string[] | undefined, tokenValue: string) {
  return toAliases(name).some(
    (alias) => alias.toLowerCase() === tokenValue.toLowerCase(),
  );
}

function getSpecFilePath(directory: string, name: string) {
  const basePath = path.join(directory, ...name.split("/"));
  const directFile = `${basePath}.json`;

  if (fs.existsSync(directFile)) {
    return directFile;
  }

  const indexFile = path.join(basePath, "index.json");

  if (fs.existsSync(indexFile)) {
    return indexFile;
  }

  return null;
}

function isFigCommand(value: unknown): value is FigCommand {
  return typeof value === "object" && value !== null;
}

function getSpecSourceDetail(source: "fig-local" | "fig-public") {
  return source === "fig-local" ? "Local spec" : "Bundled spec";
}

function hasFilesystemTemplate(template: string | string[] | undefined) {
  if (!template) {
    return false;
  }

  const values = Array.isArray(template) ? template : [template];

  return values.some((value) => value === "filepaths" || value === "folders");
}

async function materializeLoadedSpec(
  loaded: {
    source: "fig-local" | "fig-public";
    spec: FigCommand;
  } | null,
  commandTokens: string[],
  executeCommand: ExecuteCommand,
) {
  if (!loaded) {
    return null;
  }

  const generated = await resolveGeneratedSpec(loaded.spec, commandTokens, executeCommand);

  if (!generated) {
    return loaded;
  }

  return {
    ...loaded,
    spec: mergeSpecs(loaded.spec, generated),
  };
}

async function resolveGeneratedSpec(
  spec: FigCommand,
  commandTokens: string[],
  executeCommand: ExecuteCommand,
) {
  if (typeof spec.generateSpec !== "function") {
    return null;
  }

  try {
    return (await spec.generateSpec(commandTokens, executeCommand)) ?? null;
  } catch {
    return null;
  }
}

function mergeSpecs(base: FigCommand, generated: FigCommand): FigCommand {
  return {
    ...base,
    ...generated,
    options:
      generated.options && generated.options.length > 0
        ? [...generated.options, ...getOptions(base)]
        : base.options,
    subcommands:
      generated.subcommands && generated.subcommands.length > 0
        ? [...generated.subcommands, ...getSubcommands(base)]
        : base.subcommands,
  };
}
