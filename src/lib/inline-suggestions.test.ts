import { describe, expect, it } from "vitest";

import type {
  CommandCompletionItem,
  HistoryAutocompleteItem,
  PathCompletionItem,
} from "@shared/contracts";

import {
  buildInlineSuggestionItems,
  getInlineSuggestionValue,
} from "./inline-suggestions";

describe("buildInlineSuggestionItems", () => {
  it("orders structured suggestions ahead of history suggestions", () => {
    const commandCompletionItems: CommandCompletionItem[] = [
      {
        nextValue: "git status ",
        label: "status",
        description: "Show the working tree status",
        detail: "Fig",
        kind: "subcommand",
        source: "fig-public",
      },
    ];
    const pathCompletionItems: PathCompletionItem[] = [
      {
        nextValue: "git ./src ",
        label: "./src",
        path: "/repo/src",
        isDirectory: true,
      },
    ];
    const historyAutocompleteItems: HistoryAutocompleteItem[] = [
      {
        commandText: "git stash",
        cwd: "/repo",
        lastStartedAt: "2026-04-18T00:00:00.000Z",
        usageCount: 3,
        lastExitCode: 0,
        outputPreview: "",
        cwdMatch: true,
      },
    ];

    const items = buildInlineSuggestionItems({
      commandCompletionItems,
      historyAutocompleteItems,
      pathCompletionItems,
    });

    expect(items.map((item) => item.type)).toEqual(["command", "path", "history"]);
    expect(items.map(getInlineSuggestionValue)).toEqual([
      "git status",
      "git ./src",
      "git stash",
    ]);
  });

  it("suppresses history entries that duplicate a structured suggestion", () => {
    const items = buildInlineSuggestionItems({
      commandCompletionItems: [
        {
          nextValue: "pnpm install ",
          label: "install",
          description: "Install dependencies",
          detail: "Fig",
          kind: "subcommand",
          source: "fig-public",
        },
      ],
      historyAutocompleteItems: [
        {
          commandText: "pnpm install",
          cwd: "/repo",
          lastStartedAt: "2026-04-18T00:00:00.000Z",
          usageCount: 8,
          lastExitCode: 0,
          outputPreview: "",
          cwdMatch: true,
        },
      ],
      pathCompletionItems: [],
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.type).toBe("command");
    expect(getInlineSuggestionValue(items[0]!)).toBe("pnpm install");
  });
});
