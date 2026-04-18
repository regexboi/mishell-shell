import type {
  CommandCompletionItem,
  HistoryAutocompleteItem,
  PathCompletionItem,
} from "@shared/contracts";

export type InlineSuggestionItem =
  | {
      key: string;
      type: "command";
      value: string;
      item: CommandCompletionItem;
    }
  | {
      key: string;
      type: "path";
      value: string;
      item: PathCompletionItem;
    }
  | {
      key: string;
      type: "history";
      value: string;
      item: HistoryAutocompleteItem;
    };

export function buildInlineSuggestionItems(input: {
  commandCompletionItems: CommandCompletionItem[];
  historyAutocompleteItems: HistoryAutocompleteItem[];
  pathCompletionItems: PathCompletionItem[];
}) {
  const items: InlineSuggestionItem[] = [];
  const structuredValues = new Set<string>();

  input.commandCompletionItems.forEach((item, index) => {
    const value = item.nextValue.trim();
    structuredValues.add(value);
    items.push({
      key: `command:${item.kind}:${item.label}:${item.nextValue}:${item.source}:${index}`,
      type: "command",
      value,
      item,
    });
  });

  input.pathCompletionItems.forEach((item, index) => {
    const value = item.nextValue.trim();
    structuredValues.add(value);
    items.push({
      key: `path:${item.path}:${item.nextValue}:${index}`,
      type: "path",
      value,
      item,
    });
  });

  input.historyAutocompleteItems.forEach((item, index) => {
    const value = item.commandText.trim();

    if (structuredValues.has(value)) {
      return;
    }

    items.push({
      key: `history:${item.commandText}:${item.lastStartedAt}:${index}`,
      type: "history",
      value,
      item,
    });
  });

  return items;
}

export function getInlineSuggestionValue(item: InlineSuggestionItem) {
  return item.value;
}
