import type { MishellApi } from "@shared/api";
import type {
  ExecutionEvent,
  HistoryAutocompleteItem,
  HistoryEntry,
  HistoryRecallItem,
  RunCommandRequest,
} from "@shared/contracts";

const previewListeners = new Set<(event: ExecutionEvent) => void>();
const previewHistory: HistoryEntry[] = [];

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
            status: "ready",
            shortcut: "Cmd/Ctrl+R",
            description: "SQLite-backed recall, autocomplete, and cwd-aware search.",
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
          stage: "phase-03-history-search",
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

        previewHistory.unshift({
          id: previewHistory.length + 1,
          commandText: input.commandText,
          cwd: "/workspace",
          shell: "/bin/zsh",
          sessionId: "browser-preview",
          startedAt,
          durationMs: 180,
          exitCode: 0,
          outputPreview: output,
          outputPath: null,
          cwdMatch: true,
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
  history: {
    async getAutocomplete(input) {
      const normalizedDraft = input.draft.trim().toLocaleLowerCase();

      const uniqueCommands = new Map<string, HistoryAutocompleteItem>();

      for (const entry of previewHistory) {
        const commandKey = entry.commandText.toLocaleLowerCase();

        if (!commandKey.includes(normalizedDraft) || commandKey === normalizedDraft) {
          continue;
        }

        if (uniqueCommands.has(commandKey)) {
          continue;
        }

        uniqueCommands.set(commandKey, {
          commandText: entry.commandText,
          cwd: entry.cwd,
          lastStartedAt: entry.startedAt,
          usageCount: previewHistory.filter(
            (candidate) =>
              candidate.commandText.toLocaleLowerCase() === commandKey,
          ).length,
          lastExitCode: entry.exitCode,
          outputPreview: entry.outputPreview,
          cwdMatch: entry.cwd === input.cwd,
        });
      }

      return {
        items: [...uniqueCommands.values()]
          .sort((left, right) => {
            const leftPrefix = Number(
              left.commandText.toLocaleLowerCase().startsWith(normalizedDraft),
            );
            const rightPrefix = Number(
              right.commandText.toLocaleLowerCase().startsWith(normalizedDraft),
            );

            if (leftPrefix !== rightPrefix) {
              return rightPrefix - leftPrefix;
            }

            if (left.cwdMatch !== right.cwdMatch) {
              return Number(right.cwdMatch) - Number(left.cwdMatch);
            }

            return (
              Date.parse(right.lastStartedAt) - Date.parse(left.lastStartedAt)
            );
          })
          .slice(0, input.limit),
      };
    },
    async search(input) {
      const terms = input.query
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean);

      return {
        items: previewHistory
          .filter((entry) => {
            if (terms.length === 0) {
              return true;
            }

            const haystack = `${entry.commandText}\n${entry.cwd}`.toLocaleLowerCase();

            return terms.every((term) => haystack.includes(term));
          })
          .map((entry) => ({
            ...entry,
            cwdMatch: entry.cwd === input.cwd,
          }))
          .sort((left, right) => {
            if (left.cwdMatch !== right.cwdMatch) {
              return Number(right.cwdMatch) - Number(left.cwdMatch);
            }

            return Date.parse(right.startedAt) - Date.parse(left.startedAt);
          })
          .slice(0, input.limit),
      };
    },
    async getRecall(input) {
      return {
        items: previewHistory
          .filter((entry) => entry.cwd === input.cwd)
          .slice(0, input.limit)
          .map(
            (entry): HistoryRecallItem => ({
              id: entry.id,
              commandText: entry.commandText,
              startedAt: entry.startedAt,
              durationMs: entry.durationMs,
              exitCode: entry.exitCode,
            }),
          ),
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
