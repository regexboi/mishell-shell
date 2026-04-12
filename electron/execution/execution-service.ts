import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { spawn, type IPty } from "node-pty";

import type {
  CommandCompletionRequest,
  CommandCompletionResponse,
  CommandExecution,
  ExecutionEvent,
  HistoryAutocompleteRequest,
  HistoryAutocompleteResponse,
  HistoryRecallRequest,
  HistoryRecallResponse,
  HistorySearchRequest,
  HistorySearchResponse,
  InterruptExecutionRequest,
  PathCompletionRequest,
  PathCompletionResponse,
  RunCommandRequest,
  RunCommandResponse,
  ShellContext,
  TerminalInputRequest,
  TerminalResizeRequest,
} from "@shared/contracts";
import {
  getPrimaryCommand,
  shouldUseTerminalMode as shouldCommandUseTerminalMode,
} from "@shared/terminal-mode";
import { resolveCommandCompletions } from "../completion/command-completions";

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
  hostQueryBuffer: string;
  queryReplyProfile: TerminalQueryReplyProfile;
  transcriptPath: string;
  transcriptStream: fs.WriteStream;
};

type ActiveCardExecution = {
  child: IPty;
};

type TerminalQueryReplyProfile = "codex" | null;

type InterceptedTerminalChunk = {
  forwardChunk: string;
  nextPendingBuffer: string;
  responses: string[];
};

type TerminalPromotionScanResult = {
  nextPendingBuffer: string;
  shouldPromote: boolean;
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
  getCommandCompletions: (
    input: CommandCompletionRequest,
  ) => Promise<CommandCompletionResponse>;
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
  interruptExecution: (input: InterruptExecutionRequest) => void;
  writeTerminalInput: (input: TerminalInputRequest) => void;
  resizeTerminal: (input: TerminalResizeRequest) => void;
  dispose: () => void;
};

const INTERRUPT_INPUT = "\u0003";

const CODEX_TERMINAL_QUERY_REPLIES = [
  {
    query: "\u001b[6n",
    response: "\u001b[1;1R",
  },
  {
    query: "\u001b[c",
    response: "\u001b[?1;2c",
  },
  {
    query: "\u001b]10;?\u001b\\",
    response: "\u001b]10;#ffffff\u0007",
  },
  {
    query: "\u001b]11;?\u001b\\",
    response: "\u001b]11;#000000\u0007",
  },
] as const;

const TERMINAL_MODE_TRIGGER_SEQUENCES = [
  "\u001b[?47h",
  "\u001b[?1047h",
  "\u001b[?1049h",
] as const;

export function createExecutionService(
  options: ExecutionServiceOptions,
): ExecutionService {
  fs.mkdirSync(options.outputsDirectory, { recursive: true });

  let shellContext = buildShellContext({
    cwd: options.initialCwd,
    executable: options.shellExecutable,
  });
  const activeCardExecutions = new Map<string, ActiveCardExecution>();
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
    const cwdCapturePath = path.join(
      options.outputsDirectory,
      `${executionId}.cwd`,
    );
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
    let promotedExecution: CommandExecution | null = null;
    let terminalPromotionScanBuffer = "";

    const complete = (result: {
      exitCode: number | null;
      output: string;
      cwd: string;
    }) => {
      if (finished) {
        return;
      }

      finished = true;
      activeCardExecutions.delete(executionId);

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

      fs.rmSync(cwdCapturePath, { force: true });
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
            cwdCapturePath,
          }),
        },
      );

      activeCardExecutions.set(executionId, { child });

      child.onData((chunk) => {
        rawOutput += chunk;

        if (promotedExecution) {
          const activeExecution = activeTerminalExecutions.get(executionId);

          if (!activeExecution) {
            return;
          }

          activeExecution.transcriptStream.write(chunk);

          const interceptedChunk = interceptTerminalHostQueries({
            chunk,
            pendingBuffer: activeExecution.hostQueryBuffer,
            profile: activeExecution.queryReplyProfile,
          });

          activeExecution.hostQueryBuffer = interceptedChunk.nextPendingBuffer;

          for (const response of interceptedChunk.responses) {
            child.write(response);
          }

          if (interceptedChunk.forwardChunk.length === 0) {
            return;
          }

          emitEvent({
            type: "output",
            executionId,
            chunk: interceptedChunk.forwardChunk,
            target: "terminal",
          });
          return;
        }

        const promotionScan = scanForTerminalModeTrigger({
          chunk,
          pendingBuffer: terminalPromotionScanBuffer,
        });

        terminalPromotionScanBuffer = promotionScan.nextPendingBuffer;

        if (promotionScan.shouldPromote) {
          const transcriptPath = path.join(
            options.outputsDirectory,
            `${executionId}.pty.log`,
          );
          const transcriptStream = fs.createWriteStream(transcriptPath, {
            flags: "a",
            encoding: "utf8",
          });
          const queryReplyProfile = getTerminalQueryReplyProfile(input.commandText);
          const promotedBaseExecution = {
            ...baseExecution,
            presentation: "terminal" as const,
            output:
              "Terminal mode attached. Focus the compatibility surface and use Ctrl+C when the active program accepts it.",
          };
          const interceptedChunk = interceptTerminalHostQueries({
            chunk: rawOutput,
            pendingBuffer: "",
            profile: queryReplyProfile,
          });

          promotedExecution = promotedBaseExecution;
          activeCardExecutions.delete(executionId);
          activeTerminalExecutions.set(executionId, {
            child,
            cwdCapturePath,
            hostQueryBuffer: interceptedChunk.nextPendingBuffer,
            queryReplyProfile,
            transcriptPath,
            transcriptStream,
          });
          transcriptStream.write(rawOutput);

          emitEvent({
            type: "presentation-changed",
            executionId,
            presentation: "terminal",
          });

          for (const response of interceptedChunk.responses) {
            child.write(response);
          }

          if (interceptedChunk.forwardChunk.length > 0) {
            emitEvent({
              type: "output",
              executionId,
              chunk: interceptedChunk.forwardChunk,
              target: "terminal",
            });
          }

          return;
        }

        emitEvent({
          type: "output",
          executionId,
          chunk,
          target: "card",
        });
      });

      child.onExit(({ exitCode }) => {
        if (promotedExecution) {
          const activeExecution = activeTerminalExecutions.get(executionId);

          if (activeExecution) {
            activeExecution.hostQueryBuffer = "";
          }

          finishTerminalExecution({
            executionId,
            exitCode,
            activeTerminalExecutions,
            baseExecution: promotedExecution,
            emitEvent,
            finalizeExecution,
            currentCwd:
              parseExecutionOutput(rawOutput, marker).cwd ??
              readRecordedCwd(cwdCapturePath) ??
              shellContext.cwd,
          });
          return;
        }

        const parsedOutput = parseExecutionOutput(rawOutput, marker);

        complete({
          exitCode: parsedOutput.exitCode ?? exitCode,
          output: parsedOutput.output,
          cwd:
            parsedOutput.cwd ??
            readRecordedCwd(cwdCapturePath) ??
            shellContext.cwd,
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
        hostQueryBuffer: "",
        queryReplyProfile: getTerminalQueryReplyProfile(input.commandText),
        transcriptPath,
        transcriptStream,
      });

      child.onData((chunk) => {
        const activeExecution = activeTerminalExecutions.get(executionId);

        if (!activeExecution) {
          return;
        }

        transcriptStream.write(chunk);

        const interceptedChunk = interceptTerminalHostQueries({
          chunk,
          pendingBuffer: activeExecution.hostQueryBuffer,
          profile: activeExecution.queryReplyProfile,
        });

        activeExecution.hostQueryBuffer = interceptedChunk.nextPendingBuffer;

        for (const response of interceptedChunk.responses) {
          child.write(response);
        }

        if (interceptedChunk.forwardChunk.length === 0) {
          return;
        }

        emitEvent({
          type: "output",
          executionId,
          chunk: interceptedChunk.forwardChunk,
          target: "terminal",
        });
      });

      child.onExit(({ exitCode }) => {
        const activeExecution = activeTerminalExecutions.get(executionId);

        if (activeExecution) {
          activeExecution.hostQueryBuffer = "";
        }

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
    getCommandCompletions(input) {
      return resolveCommandCompletions(input);
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
    interruptExecution(input) {
      const activeCardExecution = activeCardExecutions.get(input.executionId);

      if (activeCardExecution) {
        activeCardExecution.child.write(INTERRUPT_INPUT);
        return;
      }

      activeTerminalExecutions.get(input.executionId)?.child.write(INTERRUPT_INPUT);
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
      for (const activeExecution of activeCardExecutions.values()) {
        activeExecution.child.kill();
      }

      activeCardExecutions.clear();

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
  return shouldCommandUseTerminalMode(commandText);
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
        'if ($env:MISHELL_CWD_FILE) { Set-Content -LiteralPath $env:MISHELL_CWD_FILE -Value (Get-Location).Path -NoNewline }',
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
        'if defined MISHELL_CWD_FILE cd > "%MISHELL_CWD_FILE%"',
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
        'if test -n "$MISHELL_CWD_FILE"; pwd > "$MISHELL_CWD_FILE"; end',
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
      'if [ -n "$MISHELL_CWD_FILE" ]; then pwd > "$MISHELL_CWD_FILE"; fi',
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

  if (
    shellName === "powershell" ||
    shellName === "powershell.exe" ||
    shellName === "pwsh" ||
    shellName === "pwsh.exe"
  ) {
    return "powershell";
  }

  if (shellName === "cmd" || shellName === "cmd.exe") {
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

function getTerminalQueryReplyProfile(
  commandText: string,
): TerminalQueryReplyProfile {
  return getPrimaryCommand(commandText) === "codex" ? "codex" : null;
}

export function interceptTerminalHostQueries({
  chunk,
  pendingBuffer,
  profile,
}: {
  chunk: string;
  pendingBuffer: string;
  profile: TerminalQueryReplyProfile;
}): InterceptedTerminalChunk {
  if (profile !== "codex") {
    return {
      forwardChunk: `${pendingBuffer}${chunk}`,
      nextPendingBuffer: "",
      responses: [],
    };
  }

  const combined = `${pendingBuffer}${chunk}`;
  let cursor = 0;
  let forwardChunk = "";
  const responses: string[] = [];

  while (cursor < combined.length) {
    if (combined[cursor] !== "\u001b") {
      forwardChunk += combined[cursor];
      cursor += 1;
      continue;
    }

    const matchedQuery = CODEX_TERMINAL_QUERY_REPLIES.find(({ query }) =>
      combined.startsWith(query, cursor)
    );

    if (matchedQuery) {
      responses.push(matchedQuery.response);
      cursor += matchedQuery.query.length;
      continue;
    }

    const trailingSlice = combined.slice(cursor);
    const pendingQueryPrefix = CODEX_TERMINAL_QUERY_REPLIES.find(({ query }) =>
      query.startsWith(trailingSlice)
    );

    if (pendingQueryPrefix) {
      return {
        forwardChunk,
        nextPendingBuffer: trailingSlice,
        responses,
      };
    }

    forwardChunk += combined[cursor];
    cursor += 1;
  }

  return {
    forwardChunk,
    nextPendingBuffer: "",
    responses,
  };
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

export function scanForTerminalModeTrigger({
  chunk,
  pendingBuffer,
}: {
  chunk: string;
  pendingBuffer: string;
}): TerminalPromotionScanResult {
  const combined = `${pendingBuffer}${chunk}`;

  if (
    TERMINAL_MODE_TRIGGER_SEQUENCES.some((sequence) =>
      combined.includes(sequence)
    )
  ) {
    return {
      nextPendingBuffer: "",
      shouldPromote: true,
    };
  }

  const maxSequenceLength = Math.max(
    ...TERMINAL_MODE_TRIGGER_SEQUENCES.map((sequence) => sequence.length),
  );

  return {
    nextPendingBuffer: combined.slice(-(maxSequenceLength - 1)),
    shouldPromote: false,
  };
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
