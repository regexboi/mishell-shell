import { describe, expect, it } from "vitest";

import { shouldRequestPathCompletions } from "./path-completion";

describe("shouldRequestPathCompletions", () => {
  it("requests completions after whitespace to start a new path token", () => {
    expect(shouldRequestPathCompletions("cd ")).toBe(true);
  });

  it("detects POSIX-style path tokens", () => {
    expect(shouldRequestPathCompletions("cat ./src/ma")).toBe(true);
    expect(shouldRequestPathCompletions("ls ~/Doc")).toBe(true);
  });

  it("detects Windows-style path tokens", () => {
    expect(shouldRequestPathCompletions("type .\\src\\ma")).toBe(true);
    expect(shouldRequestPathCompletions("cd C:\\Us")).toBe(true);
  });

  it("stays on history completion for plain command text", () => {
    expect(shouldRequestPathCompletions("git sta")).toBe(false);
  });
});
