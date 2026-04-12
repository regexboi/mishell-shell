import { describe, expect, it } from "vitest";

import {
  createOutputPreview,
  getCompletionContext,
  interceptTerminalHostQueries,
  parseExecutionOutput,
  shouldUseTerminalMode,
} from "./execution-service";

describe("parseExecutionOutput", () => {
  it("strips execution markers while keeping command output", () => {
    const marker = "__MISHELL_TEST__";
    const rawOutput = [
      "line 1",
      "line 2",
      `${marker}EXIT_CODE=7`,
      `${marker}CWD=/tmp/project`,
      "",
    ].join("\n");

    expect(parseExecutionOutput(rawOutput, marker)).toEqual({
      exitCode: 7,
      cwd: "/tmp/project",
      output: "line 1\nline 2",
    });
  });
});

describe("createOutputPreview", () => {
  it("returns the full text when the output is already short", () => {
    expect(createOutputPreview("hello\nworld")).toBe("hello\nworld");
  });

  it("truncates long output into a compact preview", () => {
    const output = Array.from({ length: 16 }, (_, index) => `line ${index + 1}`).join(
      "\n",
    );

    expect(createOutputPreview(output)).toBe(
      "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7\nline 8\n…",
    );
  });
});

describe("shouldUseTerminalMode", () => {
  it("routes known interactive tools into terminal mode", () => {
    expect(shouldUseTerminalMode("vim README.md")).toBe(true);
    expect(shouldUseTerminalMode("sudo lazygit")).toBe(true);
    expect(shouldUseTerminalMode("FOO=1 env BAR=2 codex")).toBe(true);
  });

  it("keeps normal commands on the card path", () => {
    expect(shouldUseTerminalMode("pnpm check")).toBe(false);
    expect(shouldUseTerminalMode("git status --short")).toBe(false);
    expect(shouldUseTerminalMode("vim --help")).toBe(false);
  });
});

describe("interceptTerminalHostQueries", () => {
  it("answers Codex startup host queries without forwarding them", () => {
    expect(
      interceptTerminalHostQueries({
        chunk: "\u001b[6n\u001b[chello",
        pendingBuffer: "",
        profile: "codex",
      }),
    ).toEqual({
      forwardChunk: "hello",
      nextPendingBuffer: "",
      responses: ["\u001b[1;1R", "\u001b[?1;2c"],
    });
  });

  it("buffers partial query chunks until the sequence is complete", () => {
    const firstChunk = interceptTerminalHostQueries({
      chunk: "\u001b[",
      pendingBuffer: "",
      profile: "codex",
    });

    expect(firstChunk).toEqual({
      forwardChunk: "",
      nextPendingBuffer: "\u001b[",
      responses: [],
    });

    expect(
      interceptTerminalHostQueries({
        chunk: "6nready",
        pendingBuffer: firstChunk.nextPendingBuffer,
        profile: "codex",
      }),
    ).toEqual({
      forwardChunk: "ready",
      nextPendingBuffer: "",
      responses: ["\u001b[1;1R"],
    });
  });

  it("passes through terminal output for non-codex sessions", () => {
    expect(
      interceptTerminalHostQueries({
        chunk: "\u001b[6nplain output",
        pendingBuffer: "",
        profile: null,
      }),
    ).toEqual({
      forwardChunk: "\u001b[6nplain output",
      nextPendingBuffer: "",
      responses: [],
    });
  });
});

describe("path completion parsing", () => {
  it("parses Windows drive-root tokens with native separators", () => {
    const context = getCompletionContext("cd C:\\Us", "C:\\repo", {
      isDirectory: (candidate) => candidate === "C:\\",
    });

    expect(context).toEqual(
      expect.objectContaining({
        prefix: "Us",
        relativeBase: "C:\\",
        searchDirectory: "C:\\",
        separator: "\\",
      }),
    );
  });

  it("parses Windows relative paths with backslash separators", () => {
    const context = getCompletionContext("type .\\src\\ma", "C:\\repo", {
      isDirectory: (candidate) => candidate === "C:\\repo\\src",
    });

    expect(context).toEqual(
      expect.objectContaining({
        prefix: "ma",
        relativeBase: ".\\src\\",
        searchDirectory: "C:\\repo\\src",
        separator: "\\",
      }),
    );
  });

  it("keeps / as the completion base for filesystem-root lookups", () => {
    const context = getCompletionContext("cd /Us", "/tmp/project");

    expect(context).toEqual(
      expect.objectContaining({
        prefix: "Us",
        relativeBase: "/",
        searchDirectory: "/",
        separator: "/",
      }),
    );
  });
});
