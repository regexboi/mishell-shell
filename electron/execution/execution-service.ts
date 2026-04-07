import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { spawn } from "node-pty";

import type {
  CommandExecution,
  ExecutionEvent,
  HistoryAutocompleteRequest,
  HistoryAutocompleteResponse,
  HistoryRecallRequest,
  HistoryRecallResponse,
  HistorySearchRequest,
  HistorySearchResponse,
  RunCommandRequest,
  RunCommandResponse,
  ShellContext,
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

export type ExecutionService = {
  getShellContext: () => ShellContext;
  getHistoryAutocomplete: (
    input: HistoryAutocompleteRequest,
  ) => HistoryAutocompleteResponse;
  searchHistory: (input: HistorySearchRequest) => HistorySearchResponse;
  getHistoryRecall: (input: HistoryRecallRequest) => HistoryRecallResponse;
  runCommand: (
    input: RunCommandRequest,
    emitEvent: (event: ExecutionEvent) => void,
  ) => Promise<RunCommandResponse>;
};

export function createExecutionService(
  options: ExecutionServiceOptions,
): ExecutionService {
  fs.mkdirSync(options.outputsDirectory, { recursive: true });

  let shellContext = buildShellContext({
    cwd: options.initialCwd,
    executable: options.shellExecutable,
  });

  return {
    getShellContext() {
      return shellContext;
    },
    getHistoryAutocomplete(input) {
      return queryHistoryAutocomplete(options.database.db, input);
    },
    searchHistory(input) {
      return queryHistorySearch(options.database.db, input);
    },
    getHistoryRecall(input) {
      return queryHistoryRecall(options.database.db, input);
    },
    async runCommand(input, emitEvent) {
      const executionId = randomUUID();
      const marker = `__MISHELL_${executionId.replaceAll("-", "_")}__`;
      const startedAt = new Date().toISOString();
      const baseExecution: CommandExecution = {
        id: executionId,
        commandText: input.commandText,
        cwd: shellContext.cwd,
        shell: shellContext.executable,
        startedAt,
        finishedAt: null,
        status: "running",
        durationMs: null,
        exitCode: null,
        outputPreview: "",
        output: "",
        outputPath: null,
      };

      emitEvent({
        type: "started",
        execution: baseExecution,
      });

      return new Promise<RunCommandResponse>((resolve) => {
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

          const finishedAt = new Date().toISOString();
          const durationMs = Math.max(
            0,
            Date.parse(finishedAt) - Date.parse(baseExecution.startedAt),
          );
          const normalizedOutput = normalizeOutput(result.output);
          const outputPreview = createOutputPreview(normalizedOutput);
          const outputPath =
            normalizedOutput.trim().length > 0
              ? writeOutputFile(
                  options.outputsDirectory,
                  executionId,
                  normalizedOutput,
                )
              : null;
          const finalExitCode = result.exitCode ?? 1;
          const execution: CommandExecution = {
            ...baseExecution,
            finishedAt,
            status: finalExitCode === 0 ? "succeeded" : "failed",
            durationMs,
            exitCode: finalExitCode,
            outputPreview,
            output: normalizedOutput,
            outputPath,
          };

          shellContext = buildShellContext({
            cwd: result.cwd,
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

          resolve({
            executionId,
          });
        };

        try {
          const child = spawn(
            shellContext.executable,
            buildShellArguments(shellContext.executable),
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
      });
    },
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
    .replace(new RegExp(`\\n?${escapeRegExp(marker)}EXIT_CODE=-?\\d+\\n?`, "g"), "\n")
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
}: {
  commandText: string;
  marker: string;
}) {
  return {
    ...process.env,
    MISHELL_COMMAND: commandText,
    MISHELL_MARKER: marker,
  };
}

function buildShellArguments(executable: string) {
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
