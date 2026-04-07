import type { MishellApi } from "@shared/api";
import type { ExecutionEvent, RunCommandRequest } from "@shared/contracts";

const previewListeners = new Set<(event: ExecutionEvent) => void>();

const browserFallback: MishellApi = {
  app: {
    async getBootstrap() {
      return {
        appName: "Mishell",
        platform: "browser-preview",
        shell: {
          shellName: "zsh",
          executable: "/bin/zsh",
          cwd: "/workspace",
          displayCwd: "/workspace",
          gitBranch: "preview",
          sessionId: "browser-preview",
        },
        database: {
          path: "preview.db",
          appliedMigrations: ["0001_foundation"],
        },
        surfaces: [
          {
            id: "editor",
            label: "Editor",
            status: "active",
            shortcut: "Enter",
            description: "Compose commands with free cursor placement and PTY-backed execution.",
          },
          {
            id: "feed",
            label: "Result Feed",
            status: "ready",
            shortcut: "Tab",
            description: "Rendered command cards will stack here.",
          },
          {
            id: "history",
            label: "History Search",
            status: "standby",
            shortcut: "Cmd/Ctrl+R",
            description: "SQLite-backed recall with cwd-aware ranking.",
          },
          {
            id: "terminal",
            label: "Terminal Mode",
            status: "standby",
            shortcut: "Ctrl+C",
            description: "Compatibility fallback for full-screen TUIs.",
          },
        ],
        focusMode: {
          defaultSurface: "editor",
          keyboardFirst: true,
        },
        release: {
          stage: "phase-02-execution-ui",
          launchedAt: new Date().toISOString(),
        },
      };
    },
    async runCommand(input: RunCommandRequest) {
      const executionId = `preview-${crypto.randomUUID()}`;
      const startedAt = new Date().toISOString();

      queueMicrotask(() => {
        previewListeners.forEach((listener) => {
          listener({
            type: "started",
            execution: {
              id: executionId,
              commandText: input.commandText,
              cwd: "/workspace",
              shell: "/bin/zsh",
              startedAt,
              finishedAt: null,
              status: "running",
              durationMs: null,
              exitCode: null,
              outputPreview: "",
              output: "",
              outputPath: null,
            },
          });
        });
      });

      window.setTimeout(() => {
        const output = [
          "Browser preview fallback",
          "",
          `Command: ${input.commandText}`,
          "Launch the Electron window for the real PTY-backed path.",
        ].join("\n");

        previewListeners.forEach((listener) => {
          listener({
            type: "completed",
            execution: {
              id: executionId,
              commandText: input.commandText,
              cwd: "/workspace",
              shell: "/bin/zsh",
              startedAt,
              finishedAt: new Date().toISOString(),
              status: "succeeded",
              durationMs: 180,
              exitCode: 0,
              outputPreview: output,
              output,
              outputPath: null,
            },
            shellContext: {
              executable: "/bin/zsh",
              shellName: "zsh",
              cwd: "/workspace",
              displayCwd: "/workspace",
              gitBranch: "preview",
              sessionId: "browser-preview",
            },
          });
        });
      }, 180);

      return { executionId };
    },
    onExecutionEvent(listener) {
      previewListeners.add(listener);

      return () => {
        previewListeners.delete(listener);
      };
    },
  },
  clipboard: {
    async writeText(text) {
      await navigator.clipboard.writeText(text);
    },
  },
};

export function getMishellApi(): MishellApi {
  return window.mishell ?? browserFallback;
}
