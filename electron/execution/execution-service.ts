import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { spawn, type IPty } from "node-pty";

import type {
  CommandExecution,
  ExecutionEvent,
  HistoryAutocompleteRequest,
  HistoryAutocompleteResponse,
  HistoryRecallRequest,
  HistoryRecallResponse,
  HistorySearchRequest,
  HistorySearchResponse,
  PathCompletionRequest,
  PathCompletionResponse,
  RunCommandRequest,
  RunCommandResponse,
  ShellContext,
  TerminalInputRequest,
  TerminalResizeRequest,
} from "@shared/contracts";

import type { DatabaseContext } from "../db/database";
import {
  insertCommandHistory,
  queryHistoryAutocomplete,
  queryHistoryRecall,
  queryHistorySearch,
} from "../db/command-history";

type ShellFlavor = "cmd" | "fish" | "powershell" | "posix";

type ExecutionServiceOptions = {
  database: DatabaseContext;
  initialCwd: string;
  outputsDirectory: string;
  shellExecutable: string;
};

type ParsedExecutionOutput = {
  exitCode: number | null;
  cwd: string | null;
  output: string;
};

type ActiveTerminalExecution = {
  child: IPty;
  cwdCapturePath: string;
  transcriptPath: string;
  transcriptStream: fs.WriteStream;
};

type CompletionPathApi = Pick<
  typeof path.posix,
  "isAbsolute" | "join" | "parse" | "resolve" | "sep"
>;

type CompletionContextOptions = {
  isDirectory?: (candidate: string) => boolean;
  pathApi?: CompletionPathApi;
};

export type ExecutionService = {
  getShellContext: () => ShellContext;
  getHistoryAutocomplete: (
    input: HistoryAutocompleteRequest,
  ) => HistoryAutocompleteResponse;
  getPathCompletions: (input: PathCompletionRequest) => PathCompletionResponse;
  searchHistory: (input: HistorySearchRequest) => HistorySearchResponse;
  getHistoryRecall: (input: HistoryRecallRequest) => HistoryRecallResponse;
  runCommand: (
    input: RunCommandRequest,
    emitEvent: (event: ExecutionEvent) => void,
  ) => Promise<RunCommandResponse>;
  writeTerminalInput: (input: TerminalInputRequest) => void;
  resizeTerminal: (input: TerminalResizeRequest) => void;
  dispose: () => void;
};

const TERMINAL_MODE_COMMANDS = new Set([
  "bash",
  "btop",
  "claude",
  "cmd",
  "cmd.exe",
  "codex",
  "fish",
  "fzf",
  "gitui",
  "htop",
  "k9s",
  "lazydocker",
  "lazygit",
  "less",
  "man",
  "more",
  "nano",
  "nvim",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "screen",
  "ssh",
  "tig",
  "tmux",
  "top",
  "vi",
  "vim",
  "watch",
  "zsh",
]);

const NON_INTERACTIVE_FLAGS = new Set([
  "--help",
  "--version",
  "-h",
  "-v",
  "-V",
]);

const LEADING_COMMAND_WRAPPERS = new Set([
  "builtin",
  "command",
  "exec",
  "nohup",
  "time",
]);

export function createExecutionService(
  options: ExecutionServiceOptions,
): ExecutionService {
  fs.mkdirSync(options.outputsDirectory, { recursive: true });

  let shellContext = buildShellContext({
    cwd: options.initialCwd,
    executable: options.shellExecutable,
  });
  const activeTerminalExecutions = new Map<string, ActiveTerminalExecution>();

  const finalizeExecution = ({
    baseExecution,
    exitCode,
    output,
    cwd,
    outputPath,
    emitEvent,
  }: {
    baseExecution: CommandExecution;
    exitCode: number | null;
    output: string;
    cwd: string;
    outputPath: string | null;
    emitEvent: (event: ExecutionEvent) => void;
  }) => {
    const finishedAt = new Date().toISOString();
    const durationMs = Math.max(
      0,
      Date.parse(finishedAt) - Date.parse(baseExecution.startedAt),
    );
    const finalExitCode = exitCode ?? 1;
    const execution: CommandExecution = {
      ...baseExecution,
      finishedAt,
      status: finalExitCode === 0 ? "succeeded" : "failed",
      durationMs,
      exitCode: finalExitCode,
      outputPreview: baseExecution.presentation === "terminal"
        ? output
        : createOutputPreview(output),
      output: baseExecution.presentation === "terminal" ? "" : output,
      outputPath,
    };

    shellContext = buildShellContext({
      cwd,
      executable: shellContext.executable,
      sessionId: shellContext.sessionId,
    });

    insertCommandHistory(options.database.db, {
      commandText: execution.commandText,
      cwd: execution.cwd,
      shell: execution.shell,
      sessionId: shellContext.sessionId,
      startedAt: execution.startedAt,
      durationMs: execution.durationMs,
      exitCode: execution.exitCode,
      outputPreview: execution.outputPreview,
      outputPath: execution.outputPath,
    });

    emitEvent({
      type: "completed",
      execution,
      shellContext,
    });
  };

  const startCardExecution = (
    input: RunCommandRequest,
    emitEvent: (event: ExecutionEvent) => void,
  ): RunCommandResponse => {
    const executionId = randomUUID();
    const marker = `__MISHELL_${executionId.replaceAll("-", "_")}__`;
    const baseExecution = buildExecution({
      executionId,
      commandText: input.commandText,
      presentation: "card",
      shellContext,
    });

    emitEvent({
      type: "started",
      execution: baseExecution,
    });

    let rawOutput = "";
    let finished = false;

    const complete = (result: {
      exitCode: number | null;
      output: string;
      cwd: string;
    }) => {
      if (finished) {
        return;
      }

      finished = true;

      const normalizedOutput = normalizeOutput(result.output);
      const outputPath =
        normalizedOutput.trim().length > 0
          ? writeOutputFile(options.outputsDirectory, executionId, normalizedOutput)
          : null;

      finalizeExecution({
        baseExecution,
        exitCode: result.exitCode,
        output: normalizedOutput,
        cwd: result.cwd,
        outputPath,
        emitEvent,
      });
    };

    try {
      const child = spawn(
        shellContext.executable,
        buildCardShellArguments(shellContext.executable),
        {
          name: "xterm-256color",
          cols: 120,
          rows: 40,
          cwd: shellContext.cwd,
          env: buildShellEnvironment({
            commandText: input.commandText,
            marker,
          }),
        },
      );

      child.onData((chunk) => {
        rawOutput += chunk;

        emitEvent({
          type: "output",
          executionId,
          chunk,
          target: "card",
        });
      });

      child.onExit(({ exitCode }) => {
        const parsedOutput = parseExecutionOutput(rawOutput, marker);

        complete({
          exitCode: parsedOutput.exitCode ?? exitCode,
          output: parsedOutput.output,
          cwd: parsedOutput.cwd ?? shellContext.cwd,
        });
      });
    } catch (error) {
      complete({
        exitCode: 1,
        output:
          error instanceof Error
            ? `Mishell failed to start the shell: ${error.message}`
            : "Mishell failed to start the shell.",
        cwd: shellContext.cwd,
      });
    }

    return {
      executionId,
      mode: "card",
    };
  };

  const startTerminalExecution = (
    input: RunCommandRequest,
    emitEvent: (event: ExecutionEvent) => void,
  ): RunCommandResponse => {
    const executionId = randomUUID();
    const cwdCapturePath = path.join(
      options.outputsDirectory,
      `${executionId}.cwd`,
    );
    const transcriptPath = path.join(
      options.outputsDirectory,
      `${executionId}.pty.log`,
    );
    const baseExecution = buildExecution({
      executionId,
      commandText: input.commandText,
      presentation: "terminal",
      shellContext,
      output:
        "Terminal mode attached. Focus the compatibility surface and use Ctrl+C when the active program accepts it.",
    });

    emitEvent({
      type: "started",
      execution: baseExecution,
    });

    try {
      const transcriptStream = fs.createWriteStream(transcriptPath, {
        flags: "a",
        encoding: "utf8",
      });
      const child = spawn(
        shellContext.executable,
        buildTerminalShellArguments(shellContext.executable),
        {
          name: "xterm-256color",
          cols: 120,
          rows: 40,
          cwd: shellContext.cwd,
          env: buildShellEnvironment({
            commandText: input.commandText,
            cwdCapturePath,
          }),
        },
      );

      activeTerminalExecutions.set(executionId, {
        child,
        cwdCapturePath,
        transcriptPath,
        transcriptStream,
      });

      child.onData((chunk) => {
        transcriptStream.write(chunk);

        emitEvent({
          type: "output",
          executionId,
          chunk,
          target: "terminal",
        });
      });

      child.onExit(({ exitCode }) => {
        finishTerminalExecution({
          executionId,
          exitCode,
          activeTerminalExecutions,
          baseExecution,
          emitEvent,
          finalizeExecution,
          currentCwd: shellContext.cwd,
        });
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? `Mishell failed to start terminal mode: ${error.message}`
          : "Mishell failed to start terminal mode.";

      finalizeExecution({
        baseExecution,
        exitCode: 1,
        output: message,
        cwd: shellContext.cwd,
        outputPath: null,
        emitEvent,
      });
    }

    return {
      executionId,
      mode: "terminal",
    };
  };

  return {
    getShellContext() {
      return shellContext;
    },
    getHistoryAutocomplete(input) {
      return queryHistoryAutocomplete(options.database.db, input);
    },
    getPathCompletions(input) {
      return resolvePathCompletions(input);
    },
    searchHistory(input) {
      return queryHistorySearch(options.database.db, input);
    },
    getHistoryRecall(input) {
      return queryHistoryRecall(options.database.db, input);
    },
    async runCommand(input, emitEvent) {
      return shouldUseTerminalMode(input.commandText)
        ? startTerminalExecution(input, emitEvent)
        : startCardExecution(input, emitEvent);
    },
    writeTerminalInput(input) {
      activeTerminalExecutions.get(input.executionId)?.child.write(input.data);
    },
    resizeTerminal(input) {
      activeTerminalExecutions.get(input.executionId)?.child.resize(
        input.cols,
        input.rows,
      );
    },
    dispose() {
      for (const activeExecution of activeTerminalExecutions.values()) {
        activeExecution.child.kill();
        activeExecution.transcriptStream.destroy();
      }

      activeTerminalExecutions.clear();
    },
  };
}

type FinalizeExecution = (args: {
  baseExecution: CommandExecution;
  exitCode: number | null;
  output: string;
  cwd: string;
  outputPath: string | null;
  emitEvent: (event: ExecutionEvent) => void;
}) => void;

function finishTerminalExecution({
  executionId,
  exitCode,
  activeTerminalExecutions,
  baseExecution,
  emitEvent,
  finalizeExecution,
  currentCwd,
}: {
  executionId: string;
  exitCode: number;
  activeTerminalExecutions: Map<string, ActiveTerminalExecution>;
  baseExecution: CommandExecution;
  emitEvent: (event: ExecutionEvent) => void;
  finalizeExecution: FinalizeExecution;
  currentCwd: string;
}) {
  const activeExecution = activeTerminalExecutions.get(executionId);

  if (!activeExecution) {
    return;
  }

  activeTerminalExecutions.delete(executionId);

  activeExecution.transcriptStream.end(() => {
    const nextCwd = readRecordedCwd(activeExecution.cwdCapturePath) ?? currentCwd;
    const transcriptSize = readFileSize(activeExecution.transcriptPath);
    const outputPath =
      transcriptSize > 0 ? activeExecution.transcriptPath : null;

    if (!outputPath) {
      fs.rmSync(activeExecution.transcriptPath, { force: true });
    }

    fs.rmSync(activeExecution.cwdCapturePath, { force: true });

    finalizeExecution({
      baseExecution,
      exitCode,
      output: createTerminalSummary(exitCode),
      cwd: nextCwd,
      outputPath,
      emitEvent,
    });
  });
}

function buildExecution({
  executionId,
  commandText,
  presentation,
  shellContext,
  output = "",
}: {
  executionId: string;
  commandText: string;
  presentation: "card" | "terminal";
  shellContext: ShellContext;
  output?: string;
}): CommandExecution {
  return {
    id: executionId,
    presentation,
    commandText,
    cwd: shellContext.cwd,
    shell: shellContext.executable,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    durationMs: null,
    exitCode: null,
    outputPreview: "",
    output,
    outputPath: null,
  };
}

export function parseExecutionOutput(
  rawOutput: string,
  marker: string,
): ParsedExecutionOutput {
  const normalized = normalizeOutput(rawOutput);
  const exitMatch = normalized.match(
    new RegExp(`${escapeRegExp(marker)}EXIT_CODE=(-?\\d+)`, "m"),
  );
  const cwdMatch = normalized.match(
    new RegExp(`${escapeRegExp(marker)}CWD=(.+)$`, "m"),
  );

  const cleaned = normalized
    .replace(
      new RegExp(`\\n?${escapeRegExp(marker)}EXIT_CODE=-?\\d+\\n?`, "g"),
      "\n",
    )
    .replace(new RegExp(`\\n?${escapeRegExp(marker)}CWD=.+\\n?`, "g"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return {
    exitCode: exitMatch ? Number.parseInt(exitMatch[1], 10) : null,
    cwd: cwdMatch ? cwdMatch[1].trim() : null,
    output: cleaned,
  };
}

export function createOutputPreview(output: string) {
  const condensed = output.trim();

  if (condensed.length === 0) {
    return "";
  }

  const lines = condensed.split("\n").slice(0, 8);
  const preview = lines.join("\n");

  if (condensed.length <= 640 && lines.length === condensed.split("\n").length) {
    return preview;
  }

  return `${preview.slice(0, 640).trimEnd()}\n…`;
}

export function shouldUseTerminalMode(commandText: string) {
  const tokens = tokenizeCommand(commandText);

  if (tokens.length === 0) {
    return false;
  }

  const { command, remaining } = extractPrimaryCommand(tokens);

  if (!command || !TERMINAL_MODE_COMMANDS.has(command)) {
    return false;
  }

  return !remaining.some((token) => NON_INTERACTIVE_FLAGS.has(token));
}

function buildShellContext({
  cwd,
  executable,
  sessionId = randomUUID(),
}: {
  cwd: string;
  executable: string;
  sessionId?: string;
}): ShellContext {
  return {
    executable,
    shellName: getShellName(executable),
    cwd,
    displayCwd: formatDisplayCwd(cwd),
    gitBranch: detectGitBranch(cwd),
    sessionId,
  };
}

function buildShellEnvironment({
  commandText,
  marker,
  cwdCapturePath,
}: {
  commandText: string;
  marker?: string;
  cwdCapturePath?: string;
}) {
  return {
    ...process.env,
    MISHELL_COMMAND: commandText,
    ...(marker ? { MISHELL_MARKER: marker } : {}),
    ...(cwdCapturePath ? { MISHELL_CWD_FILE: cwdCapturePath } : {}),
  };
}

function buildCardShellArguments(executable: string) {
  const flavor = detectShellFlavor(executable);

  if (flavor === "powershell") {
    return [
      "-NoLogo",
      "-NoProfile",
      "-Command",
      [
        '$ErrorActionPreference = "Continue"',
        "Invoke-Expression $env:MISHELL_COMMAND",
        "$mishellSucceeded = $?",
        "$mishellExit = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } elseif ($mishellSucceeded) { 0 } else { 1 }",
        'Write-Output ""',
        'Write-Output ($env:MISHELL_MARKER + "EXIT_CODE=" + $mishellExit)',
        'Write-Output ($env:MISHELL_MARKER + "CWD=" + (Get-Location).Path)',
        "exit $mishellExit",
      ].join("; "),
    ];
  }

  if (flavor === "cmd") {
    return [
      "/d",
      "/v:on",
      "/s",
      "/c",
      [
        "call %MISHELL_COMMAND%",
        "set MISHELL_EXIT=!ERRORLEVEL!",
        "echo.",
        "echo %MISHELL_MARKER%EXIT_CODE=!MISHELL_EXIT!",
        "echo %MISHELL_MARKER%CWD=!CD!",
        "exit /b !MISHELL_EXIT!",
      ].join(" & "),
    ];
  }

  if (flavor === "fish") {
    return [
      "-c",
      [
        'eval "$MISHELL_COMMAND"',
        "set mishell_exit $status",
        'printf "\\n%sEXIT_CODE=%s\\n" "$MISHELL_MARKER" "$mishell_exit"',
        'printf "%sCWD=%s\\n" "$MISHELL_MARKER" "$PWD"',
        "exit $mishell_exit",
      ].join("; "),
    ];
  }

  return [
    "-lc",
    [
      'eval "$MISHELL_COMMAND"',
      "mishell_exit=$?",
      'printf "\\n%sEXIT_CODE=%s\\n" "$MISHELL_MARKER" "$mishell_exit"',
      'printf "%sCWD=%s\\n" "$MISHELL_MARKER" "$PWD"',
      'exit "$mishell_exit"',
    ].join("; "),
  ];
}

function buildTerminalShellArguments(executable: string) {
  const flavor = detectShellFlavor(executable);

  if (flavor === "powershell") {
    return [
      "-NoLogo",
      "-NoProfile",
      "-Command",
      [
        '$ErrorActionPreference = "Continue"',
        "Invoke-Expression $env:MISHELL_COMMAND",
        "$mishellSucceeded = $?",
        "$mishellExit = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } elseif ($mishellSucceeded) { 0 } else { 1 }",
        'Set-Content -LiteralPath $env:MISHELL_CWD_FILE -Value (Get-Location).Path -NoNewline',
        "exit $mishellExit",
      ].join("; "),
    ];
  }

  if (flavor === "cmd") {
    return [
      "/d",
      "/v:on",
      "/s",
      "/c",
      [
        "call %MISHELL_COMMAND%",
        "set MISHELL_EXIT=!ERRORLEVEL!",
        'cd > "%MISHELL_CWD_FILE%"',
        "exit /b !MISHELL_EXIT!",
      ].join(" & "),
    ];
  }

  if (flavor === "fish") {
    return [
      "-c",
      [
        'eval "$MISHELL_COMMAND"',
        "set mishell_exit $status",
        'pwd > "$MISHELL_CWD_FILE"',
        "exit $mishell_exit",
      ].join("; "),
    ];
  }

  return [
    "-lc",
    [
      'eval "$MISHELL_COMMAND"',
      "mishell_exit=$?",
      'pwd > "$MISHELL_CWD_FILE"',
      'exit "$mishell_exit"',
    ].join("; "),
  ];
}

function detectShellFlavor(executable: string): ShellFlavor {
  const shellName = path.basename(executable).toLowerCase();

  if (shellName === "fish") {
    return "fish";
  }

  if (shellName === "powershell.exe" || shellName === "pwsh.exe") {
    return "powershell";
  }

  if (shellName === "cmd.exe") {
    return "cmd";
  }

  return "posix";
}

function getShellName(executable: string) {
  return path.basename(executable).replace(/\.(exe|cmd)$/i, "");
}

function detectGitBranch(cwd: string) {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    return null;
  }

  const branch = result.stdout.trim();

  return branch.length > 0 ? branch : null;
}

function formatDisplayCwd(cwd: string) {
  const homeDirectory = os.homedir();

  if (cwd === homeDirectory) {
    return "~";
  }

  if (cwd.startsWith(`${homeDirectory}${path.sep}`)) {
    return `~${path.sep}${cwd.slice(homeDirectory.length + 1)}`;
  }

  return cwd;
}

function normalizeOutput(output: string) {
  return output.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function writeOutputFile(
  outputsDirectory: string,
  executionId: string,
  output: string,
) {
  const outputPath = path.join(outputsDirectory, `${executionId}.log`);
  fs.writeFileSync(outputPath, output, "utf8");
  return outputPath;
}

function createTerminalSummary(exitCode: number) {
  return exitCode === 0
    ? "Interactive session completed and returned to the shell UI."
    : `Interactive session exited with code ${exitCode}.`;
}

export function resolvePathCompletions(
  input: PathCompletionRequest,
): PathCompletionResponse {
  const context = getCompletionContext(input.draft, input.cwd);

  if (!context) {
    return { items: [] };
  }

  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(context.searchDirectory, { withFileTypes: true });
  } catch {
    return { items: [] };
  }

  const items = entries
    .filter((entry) => entry.name.startsWith(context.prefix))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return Number(right.isDirectory()) - Number(left.isDirectory());
      }

      return left.name.localeCompare(right.name);
    })
    .slice(0, input.limit)
    .map((entry) => {
      const suffix = entry.isDirectory() ? context.separator : "";
      const replacement = `${context.relativeBase}${entry.name}${suffix}`;

      return {
        nextValue: `${input.draft.slice(0, context.tokenStart)}${replacement}`,
        label: `${entry.name}${suffix}`,
        path: context.pathApi.join(context.searchDirectory, entry.name),
        isDirectory: entry.isDirectory(),
      };
    });

  return { items };
}

function readRecordedCwd(cwdCapturePath: string) {
  if (!fs.existsSync(cwdCapturePath)) {
    return null;
  }

  const recorded = fs.readFileSync(cwdCapturePath, "utf8").trim();

  return recorded.length > 0 ? recorded : null;
}

function readFileSize(filePath: string) {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  return fs.statSync(filePath).size;
}

function tokenizeCommand(commandText: string) {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (const character of commandText) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }

    if (character === "\\") {
      escaping = quote === "'" ? false : true;

      if (!escaping) {
        current += character;
      }
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
      continue;
    }

    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

export function getCompletionContext(
  draft: string,
  cwd: string,
  options: CompletionContextOptions = {},
) {
  if (!draft.trim()) {
    return null;
  }

  const trailingWhitespace = /\s$/.test(draft);
  const pathApi = options.pathApi ?? selectCompletionPathApi("", cwd);

  if (trailingWhitespace) {
    return {
      tokenStart: draft.length,
      prefix: "",
      relativeBase: "",
      searchDirectory: cwd,
      separator: pathApi.sep,
      pathApi,
    };
  }

  const tokenMatch = draft.match(/(?:^|\s)([^\s]+)$/);
  const token = tokenMatch?.[1];

  if (!token || token.startsWith("-")) {
    return null;
  }

  const tokenStart = draft.length - token.length;
  const completionPathApi = options.pathApi ?? selectCompletionPathApi(token, cwd);
  const separatorIndex = Math.max(token.lastIndexOf("/"), token.lastIndexOf("\\"));
  const relativeBase =
    separatorIndex >= 0 ? token.slice(0, separatorIndex + 1) : "";
  const prefix = separatorIndex >= 0 ? token.slice(separatorIndex + 1) : token;
  const baseDirectory =
    relativeBase.length > 0
      ? resolveCompletionBase(cwd, relativeBase, {
          isDirectory: options.isDirectory,
          pathApi: completionPathApi,
        })
      : cwd;

  if (!baseDirectory) {
    return null;
  }

  return {
    tokenStart,
    prefix,
    relativeBase,
    searchDirectory: baseDirectory,
    separator: selectCompletionSeparator(token, completionPathApi),
    pathApi: completionPathApi,
  };
}

function resolveCompletionBase(
  cwd: string,
  relativeBase: string,
  options: CompletionContextOptions = {},
) {
  const pathApi = options.pathApi ?? selectCompletionPathApi(relativeBase, cwd);
  const normalizedBase = trimTrailingCompletionSeparator(relativeBase, pathApi);

  const resolved = pathApi.isAbsolute(normalizedBase)
    ? normalizedBase
    : pathApi.resolve(cwd, normalizedBase);

  const isDirectory = options.isDirectory ?? isExistingDirectory;

  try {
    if (!isDirectory(resolved)) {
      return null;
    }

    return resolved;
  } catch {
    return null;
  }
}

function selectCompletionPathApi(
  token: string,
  cwd: string,
): CompletionPathApi {
  if (
    token.includes("\\") ||
    looksLikeWindowsPath(token) ||
    looksLikeWindowsPath(cwd)
  ) {
    return path.win32;
  }

  return path.posix;
}

function selectCompletionSeparator(
  token: string,
  pathApi: CompletionPathApi,
) {
  if (token.includes("\\")) {
    return "\\";
  }

  if (token.includes("/")) {
    return "/";
  }

  return pathApi.sep;
}

function trimTrailingCompletionSeparator(
  relativeBase: string,
  pathApi: CompletionPathApi,
) {
  if (!/[\\/]+$/.test(relativeBase)) {
    return relativeBase;
  }

  const root = pathApi.parse(relativeBase).root;

  if (relativeBase.length <= root.length) {
    return relativeBase;
  }

  const trimmed = relativeBase.replace(/[\\/]+$/, "");

  return trimmed.length < root.length ? root : trimmed;
}

function looksLikeWindowsPath(value: string) {
  return /^[A-Za-z]:(?:[\\/]|$)/.test(value) || value.startsWith("\\\\");
}

function isExistingDirectory(candidate: string) {
  return fs.statSync(candidate).isDirectory();
}

function extractPrimaryCommand(tokens: string[]) {
  let index = 0;

  while (tokens[index] && isEnvAssignment(tokens[index]!)) {
    index += 1;
  }

  while (tokens[index]) {
    const token = tokens[index]!.toLowerCase();

    if (token === "sudo") {
      index += 1;

      while (
        tokens[index] &&
        tokens[index] !== "--" &&
        tokens[index]!.startsWith("-")
      ) {
        index += 1;
      }

      if (tokens[index] === "--") {
        index += 1;
      }

      continue;
    }

    if (token === "env") {
      index += 1;

      while (tokens[index]) {
        if (tokens[index] === "--") {
          index += 1;
          break;
        }

        if (
          tokens[index]!.startsWith("-") ||
          isEnvAssignment(tokens[index]!)
        ) {
          index += 1;
          continue;
        }

        break;
      }

      continue;
    }

    if (LEADING_COMMAND_WRAPPERS.has(token)) {
      index += 1;
      continue;
    }

    const commandToken = tokens[index]!;
    const normalizedCommand = commandToken
      .split(/[\\/]/)
      .pop()
      ?.toLowerCase();

    return {
      command: normalizedCommand ?? null,
      remaining: tokens.slice(index + 1).map((value) => value.toLowerCase()),
    };
  }

  return {
    command: null,
    remaining: [],
  };
}

function isEnvAssignment(token: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*=.*$/.test(token);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
