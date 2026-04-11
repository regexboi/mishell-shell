import os from "node:os";
import path from "node:path";

import type { BootstrapPayload } from "@shared/contracts";

import { initializeDatabase, type DatabaseContext } from "./db/database";
import {
  createExecutionService,
  type ExecutionService,
} from "./execution/execution-service";

export type AppRuntime = {
  launchedAt: string;
  database: DatabaseContext;
  execution: ExecutionService;
};

export function createAppRuntime({
  initialCwd,
  userDataPath,
}: {
  initialCwd: string;
  userDataPath: string;
}): AppRuntime {
  const shellExecutable =
    process.env.SHELL ??
    process.env.ComSpec ??
    (process.platform === "win32"
      ? "powershell.exe"
      : os.userInfo().shell || "/bin/sh");
  const database = initializeDatabase(userDataPath);

  return {
    launchedAt: new Date().toISOString(),
    database,
    execution: createExecutionService({
      database,
      initialCwd,
      outputsDirectory: path.join(userDataPath, "command-output"),
      shellExecutable,
    }),
  };
}

export function buildBootstrapPayload(runtime: AppRuntime): BootstrapPayload {
  return {
    appName: "Mishell",
    platform: `${process.platform}/${process.arch}`,
    shell: runtime.execution.getShellContext(),
    database: runtime.database.snapshot,
    surfaces: [
      {
        id: "editor",
        label: "Editor",
        status: "active",
        shortcut: "Enter",
        description:
          "Primary command surface for composition, edits, and PTY-backed execution.",
      },
      {
        id: "feed",
        label: "Result Feed",
        status: "ready",
        shortcut: "Tab",
        description: "Structured command cards replace traditional scrollback for normal shell work.",
      },
      {
        id: "history",
        label: "History Search",
        status: "ready",
        shortcut: "Cmd/Ctrl+R",
        description:
          "SQLite-backed recall, autocomplete, and scoped history power daily command reuse.",
      },
      {
        id: "terminal",
        label: "Terminal Mode",
        status: "ready",
        shortcut: "Ctrl+C",
        description:
          "Interactive TUIs use a dedicated compatibility surface instead of the default UI.",
      },
    ],
    focusMode: {
      defaultSurface: "editor",
      keyboardFirst: true,
    },
    release: {
      stage: "phase-05-v1-polish",
      launchedAt: runtime.launchedAt,
    },
  };
}
