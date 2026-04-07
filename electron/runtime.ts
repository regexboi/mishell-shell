import os from "node:os";

import type { BootstrapPayload } from "@shared/contracts";

import { initializeDatabase, type DatabaseContext } from "./db/database";

export type AppRuntime = {
  launchedAt: string;
  database: DatabaseContext;
};

export function createAppRuntime(userDataPath: string): AppRuntime {
  return {
    launchedAt: new Date().toISOString(),
    database: initializeDatabase(userDataPath),
  };
}

export function buildBootstrapPayload(runtime: AppRuntime): BootstrapPayload {
  return {
    appName: "Mishell",
    platform: `${process.platform}/${process.arch}`,
    shell: {
      executable:
        process.env.SHELL ??
        process.env.ComSpec ??
        (process.platform === "win32"
          ? "powershell.exe"
          : os.userInfo().shell || "/bin/sh"),
      cwd: process.cwd(),
    },
    database: runtime.database.snapshot,
    surfaces: [
      {
        id: "editor",
        label: "Editor",
        status: "ready",
        shortcut: "Enter",
        description:
          "Primary command surface for composition, edits, and future inline completion.",
      },
      {
        id: "feed",
        label: "Result Feed",
        status: "planned",
        shortcut: "Tab",
        description: "Structured command cards replace traditional scrollback.",
      },
      {
        id: "history",
        label: "History Search",
        status: "planned",
        shortcut: "Cmd/Ctrl+R",
        description:
          "SQLite-backed history recall will surface command, cwd, timing, and exit metadata.",
      },
      {
        id: "terminal",
        label: "Terminal Mode",
        status: "standby",
        shortcut: "Ctrl+C",
        description:
          "Full-screen TUIs will use a dedicated compatibility surface instead of the default UI.",
      },
    ],
    focusMode: {
      defaultSurface: "editor",
      keyboardFirst: true,
    },
    release: {
      stage: "phase-01-foundation",
      launchedAt: runtime.launchedAt,
    },
  };
}
