import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveCommandCompletions,
  resolveCommandCompletionsWithRegistry,
} from "./command-completions";

const specs = {
  docker: {
    description: "Manage Docker containers and images",
    name: "docker",
    options: [
      {
        description: "Show version information",
        name: ["-v", "--version"],
      },
    ],
    subcommands: [
      {
        description: "Build an image from a Dockerfile",
        name: "build",
        options: [
          {
            args: {
              generators: {
                template: "folders",
              },
            },
            description: "Set the build context",
            name: "--file-context",
          },
          {
            args: {
              template: ["filepaths"],
            },
            description: "Write the build result to a file",
            name: ["-o", "--output"],
          },
        ],
      },
      {
        description: "Define and run multi-container applications",
        loadSpec: "docker-compose",
        name: "compose",
      },
      {
        description: "Create and run a new container",
        name: "run",
        options: [
          {
            args: {
              description: "Live containers",
              generators: {
                custom: async (
                  _tokens: string[],
                  execute: (input: {
                    args?: string[];
                    command: string;
                    cwd?: string;
                  }) => Promise<{
                    exitCode: number | null;
                    stderr: string;
                    stdout: string;
                  }>,
                ) => {
                  const result = await execute({
                    args: ["ps"],
                    command: "docker",
                  });

                  return result.stdout
                    .split("\n")
                    .filter(Boolean)
                    .map((name) => ({ name }));
                },
              },
            },
            description: "Attach to a running container",
            name: "--attach",
          },
        ],
      },
    ],
  },
  uv: {
    description: "An extremely fast Python package manager",
    name: "uv",
    options: [
      {
        description: "Do not print any output",
        name: ["-q", "--quiet"],
      },
      {
        description: "Use verbose output",
        name: ["-v", "--verbose"],
      },
      {
        description: "Disable network access",
        name: "--offline",
      },
      {
        description: "Run within the given project directory",
        name: "--project",
      },
      {
        description: "Display the concise help for this command",
        name: ["-h", "--help"],
      },
    ],
    subcommands: [
      {
        description: "Add dependencies to the project",
        name: "add",
      },
      {
        description: "Create a new project",
        name: "init",
      },
      {
        description: "Run a command or script",
        name: "run",
      },
      {
        description: "Update the project's environment",
        name: "sync",
      },
    ],
  },
  "docker-compose": {
    description: "Compose workflows",
    name: "docker-compose",
    subcommands: [
      {
        description: "Create and start containers",
        name: "up",
      },
    ],
  },
  localcmd: {
    description: "Project-local command spec",
    name: "localcmd",
    subcommands: [
      {
        description: "Run the project task",
        name: "task",
      },
    ],
  },
  pnpm: {
    description: "Fast, disk space efficient package manager",
    generateSpec: async (
      _tokens: string[],
      execute: (input: {
        args?: string[];
        command: string;
        cwd?: string;
      }) => Promise<{
        exitCode: number | null;
        stderr: string;
        stdout: string;
      }>,
    ) => {
      const result = await execute({
        args: ["run"],
        command: "pnpm",
      });

      return {
        name: "pnpm",
        subcommands: result.stdout
          .split("\n")
          .filter(Boolean)
          .map((name) => ({ description: "Workspace script", name })),
      };
    },
    name: "pnpm",
    subcommands: [
      {
        description: "Install dependencies",
        name: "install",
      },
    ],
  },
  vite: {
    description: "Native ESM-powered web dev build tool",
    name: "vite",
    options: [
      {
        args: {
          template: "filepaths",
        },
        description: "Use the specified config file",
        name: ["-c", "--config"],
      },
      {
        args: {
          description: "Log verbosity",
          suggestions: ["info", "warn", "error"],
        },
        description: "Set the log level",
        name: ["-l", "--logLevel"],
      },
    ],
  },
  git: {
    description: "Distributed version control",
    name: "git",
    subcommands: [
      {
        description: "Show the working tree status",
        name: "status",
      },
    ],
  },
  ls: {
    description: "List directory contents",
    name: "ls",
    options: [
      {
        description: "Use a long listing format",
        name: "-l",
      },
    ],
  },
  psql: {
    description: "PostgreSQL interactive terminal",
    name: "psql",
    options: [
      {
        description: "Echo hidden queries",
        name: "--echo-hidden",
      },
    ],
  },
};

const registry = {
  async executeCommand(input: { args?: string[]; command: string }) {
    if (input.command === "docker" && input.args?.join(" ") === "ps") {
      return {
        exitCode: 0,
        stderr: "",
        stdout: "web\napi\n",
      };
    }

    if (input.command === "pnpm" && input.args?.join(" ") === "run") {
      return {
        exitCode: 0,
        stderr: "",
        stdout: "dev\nbuild\n",
      };
    }

    return {
      exitCode: 1,
      stderr: "unexpected command",
      stdout: "",
    };
  },
  async listCommands() {
    return [
      { name: "docker", source: "fig-public" as const },
      { name: "git", source: "fig-public" as const },
      { name: "ls", source: "fig-public" as const },
      { name: "vite", source: "fig-public" as const },
      { name: "pnpm", source: "fig-public" as const },
      { name: "psql", source: "fig-public" as const },
      { name: "uv", source: "fig-public" as const },
      { name: "localcmd", source: "fig-local" as const },
    ];
  },
  async loadSpec(name: string) {
    const spec = specs[name as keyof typeof specs];

    if (!spec) {
      return null;
    }

    return {
      source: name === "localcmd" ? ("fig-local" as const) : ("fig-public" as const),
      spec,
    };
  },
};

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }

  vi.restoreAllMocks();
});

describe("resolveCommandCompletionsWithRegistry", () => {
  it("suggests root commands from merged local and public sources", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "loc",
        offset: 0,
        limit: 8,
      },
      registry,
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        description: "Project-local command spec",
        detail: "Local spec",
        kind: "command",
        label: "localcmd",
        nextValue: "localcmd ",
        source: "fig-local",
      }),
    ]);
    expect(response.resolvedCommand).toBe(false);
    expect(response.yieldToPath).toBe(false);
  });

  it("suggests subcommands and options after resolving the root spec", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "docker ",
        offset: 0,
        limit: 12,
      },
      registry,
    );

    expect(response.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "subcommand",
          label: "build",
        }),
        expect.objectContaining({
          kind: "subcommand",
          label: "compose",
        }),
        expect.objectContaining({
          kind: "option",
          label: "--version",
        }),
      ]),
    );
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(false);
  });

  it("prioritizes subcommands over global options when the query is blank", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "uv ",
        offset: 0,
        limit: 4,
      },
      registry,
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        kind: "subcommand",
        label: "add",
      }),
      expect.objectContaining({
        kind: "subcommand",
        label: "init",
      }),
      expect.objectContaining({
        kind: "subcommand",
        label: "run",
      }),
      expect.objectContaining({
        kind: "subcommand",
        label: "sync",
      }),
    ]);
    expect(response.hasMore).toBe(true);
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(false);
  });

  it("pages command completions as the caller advances the offset", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "uv ",
        offset: 2,
        limit: 2,
      },
      registry,
    );

    expect(response.items).toEqual([
      expect.objectContaining({
        kind: "subcommand",
        label: "run",
      }),
      expect.objectContaining({
        kind: "subcommand",
        label: "sync",
      }),
    ]);
    expect(response.hasMore).toBe(true);
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(false);
  });

  it("follows loadSpec for deeper command trees", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "docker compose ",
        offset: 0,
        limit: 12,
      },
      registry,
    );

    expect(response.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "subcommand",
          label: "up",
          nextValue: "docker compose up ",
        }),
      ]),
    );
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(false);
  });

  it("surfaces static option value suggestions", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "vite --logLevel ",
        offset: 0,
        limit: 12,
      },
      registry,
    );

    expect(response.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "value",
          label: "info",
          nextValue: "vite --logLevel info ",
        }),
        expect.objectContaining({
          kind: "value",
          label: "warn",
        }),
      ]),
    );
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(false);
  });

  it("yields to path completion when the active argument expects a filepath", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "vite --config ",
        offset: 0,
        limit: 12,
      },
      registry,
    );

    expect(response.items).toEqual([]);
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(true);
  });

  it("yields to path completion for template arrays imported from specs", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "docker build --output ",
        offset: 0,
        limit: 12,
      },
      registry,
    );

    expect(response.items).toEqual([]);
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(true);
  });

  it("yields to path completion for generator templates imported from specs", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "docker build --file-context ",
        offset: 0,
        limit: 12,
      },
      registry,
    );

    expect(response.items).toEqual([]);
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(true);
  });

  it("runs constrained dynamic generators for live values", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "docker run --attach ",
        offset: 0,
        limit: 12,
      },
      registry,
    );

    expect(response.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "value",
          label: "web",
          nextValue: "docker run --attach web ",
        }),
        expect.objectContaining({
          kind: "value",
          label: "api",
        }),
      ]),
    );
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(false);
  });

  it("supports generateSpec for dynamic subcommands", async () => {
    const response = await resolveCommandCompletionsWithRegistry(
      {
        cwd: "/tmp/project",
        draft: "pnpm ",
        offset: 0,
        limit: 12,
      },
      registry,
    );

    expect(response.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "subcommand",
          label: "dev",
        }),
        expect.objectContaining({
          kind: "subcommand",
          label: "build",
        }),
        expect.objectContaining({
          kind: "subcommand",
          label: "install",
        }),
      ]),
    );
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(false);
  });

  it("consumes wrapper option arguments before resolving the wrapped command", async () => {
    const cases = [
      {
        draft: "sudo -u postgres psql ",
        expectedLabel: "--echo-hidden",
      },
      {
        draft: "env -C /tmp git ",
        expectedLabel: "status",
      },
      {
        draft: "time -p ls ",
        expectedLabel: "-l",
      },
    ];

    for (const testCase of cases) {
      const response = await resolveCommandCompletionsWithRegistry(
        {
          cwd: "/tmp/project",
          draft: testCase.draft,
          offset: 0,
          limit: 12,
        },
        registry,
      );

      expect(response.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: testCase.expectedLabel,
          }),
        ]),
      );
      expect(response.resolvedCommand).toBe(true);
      expect(response.yieldToPath).toBe(false);
    }
  });
});

describe("resolveCommandCompletions", () => {
  it("loads local inert JSON specs from the current project tree", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mishell-local-spec-"));
    tempDirectories.push(directory);
    const buildDirectory = path.join(directory, ".fig", "autocomplete", "build");
    fs.mkdirSync(buildDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(buildDirectory, "localcmd.json"),
      JSON.stringify({ name: "localcmd", description: "Project-local command spec" }),
      "utf8",
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await resolveCommandCompletions({
      cwd: directory,
      draft: "loc",
      offset: 0,
      limit: 8,
    });

    expect(response.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "localcmd",
          source: "fig-local",
        }),
      ]),
    );
    expect(response.resolvedCommand).toBe(false);
    expect(response.yieldToPath).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ignores legacy executable local specs", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mishell-local-spec-"));
    tempDirectories.push(directory);
    const buildDirectory = path.join(directory, ".fig", "autocomplete", "build");
    fs.mkdirSync(buildDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(buildDirectory, "localcmd.js"),
      'export default { name: "localcmd", description: "Legacy local command spec" };',
      "utf8",
    );

    const response = await resolveCommandCompletions({
      cwd: directory,
      draft: "localc",
      offset: 0,
      limit: 8,
    });

    expect(response.items).toEqual([]);
    expect(response.resolvedCommand).toBe(false);
    expect(response.yieldToPath).toBe(false);
  });

  it("keeps default-registry dynamic generators constrained", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mishell-local-spec-"));
    tempDirectories.push(directory);
    const buildDirectory = path.join(directory, ".fig", "autocomplete", "build");
    fs.mkdirSync(buildDirectory, { recursive: true });
    fs.writeFileSync(
      path.join(buildDirectory, "localcmd.json"),
      JSON.stringify({
        name: "localcmd",
        options: [
          {
            args: {
              generators: {
                script: ["node", "-e", "process.stdout.write('unsafe\\n')"],
              },
            },
            name: "--danger",
          },
        ],
      }),
      "utf8",
    );

    const response = await resolveCommandCompletions({
      cwd: directory,
      draft: "localcmd --danger u",
      offset: 0,
      limit: 8,
    });

    expect(response.items).toEqual([]);
    expect(response.resolvedCommand).toBe(true);
    expect(response.yieldToPath).toBe(false);
  });
});
