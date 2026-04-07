import type { MishellApi } from "@shared/api";

const browserFallback: MishellApi = {
  app: {
    async getBootstrap() {
      return {
        appName: "Mishell",
        platform: "browser-preview",
        shell: {
          executable: "/bin/zsh",
          cwd: "/workspace",
        },
        database: {
          path: "preview.db",
          appliedMigrations: ["0001_foundation"],
        },
        surfaces: [
          {
            id: "editor",
            label: "Editor",
            status: "ready",
            shortcut: "Enter",
            description: "Compose commands with free cursor placement.",
          },
          {
            id: "feed",
            label: "Result Feed",
            status: "planned",
            shortcut: "Tab",
            description: "Rendered command cards will stack here.",
          },
          {
            id: "history",
            label: "History Search",
            status: "planned",
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
          stage: "phase-01-foundation",
          launchedAt: new Date().toISOString(),
        },
      };
    },
  },
};

export function getMishellApi(): MishellApi {
  return window.mishell ?? browserFallback;
}
