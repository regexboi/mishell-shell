import { describe, expect, it } from "vitest";

import {
  createOutputPreview,
  parseExecutionOutput,
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
