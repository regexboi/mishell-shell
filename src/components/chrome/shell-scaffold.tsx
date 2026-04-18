import {
  Fragment,
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CSSProperties } from "react";
import {
  Check,
  Clipboard,
  Command,
  FolderTree,
  GitBranch,
  Search,
  Square,
  Timer,
  TriangleAlert,
} from "lucide-react";

import type {
  BootstrapPayload,
  CommandCompletionItem,
  CommandExecution,
  ExecutionEvent,
  HistoryAutocompleteItem,
  HistoryEntry,
  HistoryRecallItem,
  PathCompletionItem,
  ShellContext,
} from "@shared/contracts";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getMishellApi } from "@/lib/mishell-api";
import {
  PRESET_UI_VARS,
  UI_THEME_VAR_KEYS,
  colorsLooselyEqual,
  cssColorToHex8,
  loadThemeCustomization,
  type MishellSurfaceId,
  type MishellThemeId,
  type MishellUiColorVar,
  saveThemeCustomization,
} from "@/lib/mishell-ui-theme";
import {
  buildInlineSuggestionItems,
  getInlineSuggestionValue,
  type InlineSuggestionItem,
} from "@/lib/inline-suggestions";
import { shouldRequestPathCompletions } from "@/lib/path-completion";
import { cn } from "@/lib/utils";

import {
  TerminalModeSurface,
  type TerminalModeSurfaceController,
} from "./terminal-mode-surface";
import { ThemeSettingsDialog } from "./theme-settings-dialog";

type ThemeOption = {
  id: MishellThemeId;
  label: string;
  terminalTheme: {
    background: string;
    black: string;
    blue: string;
    brightBlack: string;
    brightBlue: string;
    brightCyan: string;
    brightGreen: string;
    brightMagenta: string;
    brightRed: string;
    brightWhite: string;
    brightYellow: string;
    cursor: string;
    cyan: string;
    foreground: string;
    green: string;
    magenta: string;
    red: string;
    selectionBackground: string;
    white: string;
    yellow: string;
  };
};

const themeStorageKey = "mishell-theme";
const COMMAND_COMPLETION_PAGE_SIZE = 24;
const themeOptions: ThemeOption[] = [
  {
    id: "ultraviolet",
    label: "Ultraviolet",
    terminalTheme: {
      background: "#05050a",
      black: "#0d0d12",
      blue: "#6aa9ff",
      brightBlack: "#6b6780",
      brightBlue: "#98c4ff",
      brightCyan: "#91f3f9",
      brightGreen: "#b4f2bc",
      brightMagenta: "#dfadff",
      brightRed: "#ff9cab",
      brightWhite: "#ffffff",
      brightYellow: "#ffe49a",
      cursor: "#c97bff",
      cyan: "#5be7ef",
      foreground: "#f1e7ff",
      green: "#8ae996",
      magenta: "#c97bff",
      red: "#ff7d8f",
      selectionBackground: "#4e255f",
      white: "#d8d3e8",
      yellow: "#ffd166",
    },
  },
  {
    id: "phosphor",
    label: "Phosphor",
    terminalTheme: {
      background: "#040807",
      black: "#0c1411",
      blue: "#71c7ff",
      brightBlack: "#5d6a65",
      brightBlue: "#a6dcff",
      brightCyan: "#9ef8ef",
      brightGreen: "#b7ffcc",
      brightMagenta: "#c2fbb4",
      brightRed: "#ffab9a",
      brightWhite: "#effff7",
      brightYellow: "#ffe28a",
      cursor: "#6bff96",
      cyan: "#66e5d8",
      foreground: "#e5fff2",
      green: "#6bff96",
      magenta: "#8de79b",
      red: "#ff8c7d",
      selectionBackground: "#1f5137",
      white: "#d7e8dd",
      yellow: "#f6d36a",
    },
  },
  {
    id: "amber",
    label: "Amber Grid",
    terminalTheme: {
      background: "#090603",
      black: "#18110a",
      blue: "#7db0ff",
      brightBlack: "#7f6c58",
      brightBlue: "#add0ff",
      brightCyan: "#98f0ff",
      brightGreen: "#c7f1aa",
      brightMagenta: "#ffc18a",
      brightRed: "#ffb18f",
      brightWhite: "#fff8e9",
      brightYellow: "#ffe19f",
      cursor: "#ffb347",
      cyan: "#78dbe8",
      foreground: "#fff1dc",
      green: "#b5df8f",
      magenta: "#ffb347",
      red: "#ff8d73",
      selectionBackground: "#5c3511",
      white: "#e7d7bf",
      yellow: "#ffd166",
    },
  },
  {
    id: "dark-knight",
    label: "Dark Knight",
    terminalTheme: {
      background: "#000000",
      black: "#030508",
      blue: "#5b8cff",
      brightBlack: "#3d4a5c",
      brightBlue: "#8cb4ff",
      brightCyan: "#7ed8f0",
      brightGreen: "#7aab8a",
      brightMagenta: "#9aa0d8",
      brightRed: "#c87878",
      brightWhite: "#e4eaf5",
      brightYellow: "#c4b878",
      cursor: "#6eb0ff",
      cyan: "#4a9ec4",
      foreground: "#c5cee0",
      green: "#5a9070",
      magenta: "#7a82b8",
      red: "#a85858",
      selectionBackground: "#152a48",
      white: "#a8b4c8",
      yellow: "#a89868",
    },
  },
];

const defaultTheme = themeOptions[0];
const CARD_OUTPUT_FONT_FAMILY =
  '"JetBrains Mono NF", "JetBrainsMono Nerd Font Mono", "JetBrains Mono", monospace';
const CARD_OUTPUT_FONT_SIZE_PX = 14;
const CARD_OUTPUT_LINE_HEIGHT_PX = 24;
const CARD_OUTPUT_HORIZONTAL_CHROME_PX = 40;
const CARD_OUTPUT_VERTICAL_CHROME_PX = 32;

type RecallSession = {
  cwd: string;
  originalDraft: string;
  items: HistoryRecallItem[];
  index: number;
};

function findNearestScrollParent(node: HTMLElement | null): HTMLElement | null {
  let current = node?.parentElement ?? null;

  while (current) {
    const { overflowY } = window.getComputedStyle(current);

    if (overflowY === "auto" || overflowY === "scroll") {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

function clampToRange(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function measureCardExecutionSize(
  container: HTMLElement | null,
): { cols: number; rows: number } | null {
  if (!container) {
    return null;
  }

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const charSample = "0".repeat(64);

  if (!context) {
    return null;
  }

  context.font = `${CARD_OUTPUT_FONT_SIZE_PX}px ${CARD_OUTPUT_FONT_FAMILY}`;

  const measuredWidth = context.measureText(charSample).width / charSample.length;
  const charWidth = measuredWidth > 0 ? measuredWidth : 8;
  const usableWidth = Math.max(
    container.clientWidth - CARD_OUTPUT_HORIZONTAL_CHROME_PX,
    charWidth * 40,
  );
  const usableHeight = Math.max(
    container.clientHeight - CARD_OUTPUT_VERTICAL_CHROME_PX,
    CARD_OUTPUT_LINE_HEIGHT_PX * 4,
  );

  return {
    cols: clampToRange(Math.floor(usableWidth / charWidth), 40, 500),
    rows: clampToRange(
      Math.floor(usableHeight / CARD_OUTPUT_LINE_HEIGHT_PX),
      4,
      300,
    ),
  };
}

export function ShellScaffold({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const api = getMishellApi();
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const historySearchInputRef = useRef<HTMLInputElement | null>(null);
  const feedScrollRef = useRef<HTMLDivElement | null>(null);
  const commandCompletionRequestRef = useRef(0);
  const autocompleteRequestRef = useRef(0);
  const pathCompletionRequestRef = useRef(0);
  const historySearchRequestRef = useRef(0);
  const historyRecallRequestRef = useRef(0);
  const terminalControllerRef = useRef<TerminalModeSurfaceController | null>(null);
  const terminalOutputBacklogRef = useRef(new Map<string, string[]>());
  const shouldStickFeedToBottomRef = useRef(true);
  const lastExecutionResizeRef = useRef<{
    cols: number;
    executionId: string;
    rows: number;
  } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shellContext, setShellContext] = useState<ShellContext>(bootstrap.shell);
  const [draft, setDraft] = useState("");
  const [executions, setExecutions] = useState<CommandExecution[]>([]);
  const [activeTerminalExecutionId, setActiveTerminalExecutionId] = useState<
    string | null
  >(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [commandCompletionItems, setCommandCompletionItems] = useState<
    CommandCompletionItem[]
  >([]);
  const [commandCompletionHasMore, setCommandCompletionHasMore] = useState(false);
  const [commandCompletionLoadingMore, setCommandCompletionLoadingMore] =
    useState(false);
  const [autocompleteItems, setAutocompleteItems] = useState<
    HistoryAutocompleteItem[]
  >([]);
  const [pathCompletionItems, setPathCompletionItems] = useState<PathCompletionItem[]>(
    [],
  );
  const [autocompleteIndex, setAutocompleteIndex] = useState<number | null>(null);
  const [recallSession, setRecallSession] = useState<RecallSession | null>(null);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyResults, setHistoryResults] = useState<HistoryEntry[]>([]);
  const [historySelectedIndex, setHistorySelectedIndex] = useState(0);
  const [historySearchPending, setHistorySearchPending] = useState(false);
  const [historySearchError, setHistorySearchError] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [fullOutputExecutionId, setFullOutputExecutionId] = useState<string | null>(
    null,
  );
  const [themeId, setThemeId] = useState<MishellThemeId>(() => {
    if (typeof window === "undefined") {
      return defaultTheme.id;
    }

    try {
      const storedTheme = window.localStorage.getItem(themeStorageKey);
      return themeOptions.some((theme) => theme.id === storedTheme)
        ? (storedTheme as MishellThemeId)
        : defaultTheme.id;
    } catch {
      return defaultTheme.id;
    }
  });
  const [surfaceId, setSurfaceId] = useState<MishellSurfaceId>(() => {
    return loadThemeCustomization().surface;
  });
  const [colorOverrides, setColorOverrides] = useState<
    Partial<Record<MishellUiColorVar, string>>
  >(() => loadThemeCustomization().colors);
  const deferredDraft = useDeferredValue(draft);
  const deferredHistoryQuery = useDeferredValue(historyQuery);
  const isBrowserPreview = bootstrap.platform === "browser-preview";
  const isMacTrafficLightInset =
    !isBrowserPreview && bootstrap.platform.startsWith("darwin");
  const runningExecution =
    executions.find((execution) => execution.status === "running") ?? null;
  const hasRunningExecution = runningExecution !== null;
  const latestExecution = executions[0] ?? null;
  const feedExecutions = [...executions].reverse();
  const fullOutputExecution = fullOutputExecutionId
    ? executions.find((execution) => execution.id === fullOutputExecutionId) ?? null
    : null;
  const recallVisible = recallSession !== null && recallSession.items.length > 0;
  const inlineSuggestionItems = useMemo(
    () =>
      buildInlineSuggestionItems({
        commandCompletionItems,
        historyAutocompleteItems: autocompleteItems,
        pathCompletionItems,
      }),
    [autocompleteItems, commandCompletionItems, pathCompletionItems],
  );
  const inlineSuggestionsVisible =
    inlineSuggestionItems.length > 0 && recallSession === null;
  const hasStructuredInlineSuggestions =
    commandCompletionItems.length > 0 || pathCompletionItems.length > 0;
  const hasHistoryInlineSuggestions = autocompleteItems.length > 0;
  const selectedInlineSuggestion =
    autocompleteIndex === null ? null : inlineSuggestionItems[autocompleteIndex] ?? null;
  const selectedRecallItem =
    recallSession === null ? null : recallSession.items[recallSession.index] ?? null;
  const activeTheme =
    themeOptions.find((theme) => theme.id === themeId) ?? defaultTheme;

  const mergedUiVars = useMemo(
    () => ({ ...PRESET_UI_VARS[themeId], ...colorOverrides }),
    [themeId, colorOverrides],
  );

  const activeTerminalTheme = useMemo(() => {
    const base = activeTheme.terminalTheme;
    if (Object.keys(colorOverrides).length === 0) {
      return base;
    }

    return {
      ...base,
      background: cssColorToHex8(mergedUiVars.bg),
      foreground: cssColorToHex8(mergedUiVars["text-primary"]),
      cursor: cssColorToHex8(mergedUiVars.accent),
      selectionBackground: cssColorToHex8(mergedUiVars["accent-dim"]),
    };
  }, [activeTheme, colorOverrides, mergedUiVars]);

  useLayoutEffect(() => {
    document.documentElement.dataset.mishellSurface = surfaceId;
  }, [surfaceId]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const key of UI_THEME_VAR_KEYS) {
      root.style.removeProperty(`--${key}`);
    }

    for (const [rawKey, value] of Object.entries(colorOverrides)) {
      const key = rawKey as MishellUiColorVar;
      if (value && (UI_THEME_VAR_KEYS as readonly string[]).includes(key)) {
        root.style.setProperty(`--${key}`, value);
      }
    }
  }, [colorOverrides, themeId]);

  useEffect(() => {
    saveThemeCustomization({ colors: colorOverrides, surface: surfaceId });
  }, [colorOverrides, surfaceId]);

  useEffect(() => {
    document.documentElement.dataset.mishellTheme = themeId;

    try {
      window.localStorage.setItem(themeStorageKey, themeId);
    } catch {
      return;
    }
  }, [themeId]);

  const focusEditorAtEnd = useEffectEvent(() => {
    requestAnimationFrame(() => {
      if (!editorRef.current) {
        return;
      }

      editorRef.current.focus();
      const cursor = editorRef.current.value.length;
      editorRef.current.setSelectionRange(cursor, cursor);
    });
  });

  const clearCommandCompletionState = useEffectEvent(() => {
    setCommandCompletionItems([]);
    setCommandCompletionHasMore(false);
    setCommandCompletionLoadingMore(false);
  });

  const invalidateInlineSuggestionRequests = useEffectEvent(() => {
    commandCompletionRequestRef.current += 1;
    autocompleteRequestRef.current += 1;
    pathCompletionRequestRef.current += 1;
    historyRecallRequestRef.current += 1;
  });

  const setDraftValue = useEffectEvent(
    (nextValue: string, source: "history" | "system" | "user" = "user") => {
      if (source === "user") {
        invalidateInlineSuggestionRequests();
        setRecallSession(null);
        clearCommandCompletionState();
        setPathCompletionItems([]);
        setAutocompleteIndex(null);
      }

      if (source !== "history") {
        setHistoryOpen(false);
      }

      setDraft(nextValue);
    },
  );

  const applyAutocompleteSelection = useEffectEvent((commandText: string) => {
    const normalizedCommand = commandText.trim().toLocaleLowerCase();
    const continuationItems = autocompleteItems.filter((item) => {
      const normalizedItem = item.commandText.trim().toLocaleLowerCase();
      return (
        normalizedItem !== normalizedCommand &&
        normalizedItem.startsWith(normalizedCommand)
      );
    });

    setRecallSession(null);
    clearCommandCompletionState();
    setDraftValue(commandText, "system");
    setAutocompleteItems(continuationItems);
    setPathCompletionItems([]);
    setAutocompleteIndex(null);
    focusEditorAtEnd();
  });

  const applyCommandCompletionSelection = useEffectEvent(
    (item: CommandCompletionItem) => {
      setRecallSession(null);
      clearCommandCompletionState();
      setPathCompletionItems([]);
      setAutocompleteItems([]);
      setAutocompleteIndex(null);
      setDraftValue(item.nextValue, "system");
      focusEditorAtEnd();
    },
  );

  const applyPathCompletionSelection = useEffectEvent((item: PathCompletionItem) => {
    setRecallSession(null);
    clearCommandCompletionState();
    setPathCompletionItems([]);
    setAutocompleteItems([]);
    setAutocompleteIndex(null);
    setDraftValue(item.nextValue, "system");
    focusEditorAtEnd();
  });

  const applyHistoryResult = useEffectEvent((commandText: string) => {
    setRecallSession(null);
    setDraftValue(commandText, "history");
    setHistoryOpen(false);
    clearCommandCompletionState();
    setAutocompleteItems([]);
    setPathCompletionItems([]);
    setAutocompleteIndex(null);
    focusEditorAtEnd();
  });

  const flushTerminalBacklog = useEffectEvent((executionId: string) => {
    const controller = terminalControllerRef.current;
    const backlog = terminalOutputBacklogRef.current.get(executionId);

    if (!controller || !backlog || backlog.length === 0) {
      return;
    }

    controller.clear();

    for (const chunk of backlog) {
      controller.write(chunk);
    }

    terminalOutputBacklogRef.current.delete(executionId);
    controller.focus();
  });

  const handleTerminalReady = useEffectEvent(
    (controller: TerminalModeSurfaceController | null) => {
      terminalControllerRef.current = controller;

      if (controller && activeTerminalExecutionId) {
        flushTerminalBacklog(activeTerminalExecutionId);
      }
    },
  );

  const handleTerminalInput = useEffectEvent((data: string) => {
    if (!activeTerminalExecutionId) {
      return;
    }

    void api.app.writeTerminalInput({
      executionId: activeTerminalExecutionId,
      data,
    });
  });

  const handleTerminalResize = useEffectEvent(
    ({ cols, rows }: { cols: number; rows: number }) => {
      if (!activeTerminalExecutionId) {
        return;
      }

      void api.app.resizeExecution({
        executionId: activeTerminalExecutionId,
        cols,
        rows,
      });
    },
  );

  const handleExecutionEvent = useEffectEvent((event: ExecutionEvent) => {
    if (event.type === "started") {
      if (event.execution.presentation === "terminal") {
        terminalOutputBacklogRef.current.set(event.execution.id, [
          TERMINAL_SESSION_RESET,
        ]);
      }

      setExecutions((current) => [event.execution, ...current]);
      return;
    }

    if (event.type === "presentation-changed") {
      if (event.presentation === "terminal") {
        terminalOutputBacklogRef.current.set(event.executionId, [
          TERMINAL_SESSION_RESET,
        ]);
        setActiveTerminalExecutionId(event.executionId);
      }

      setExecutions((current) =>
        current.map((execution) =>
          execution.id === event.executionId
            ? {
                ...execution,
                presentation: event.presentation,
                output:
                  event.presentation === "terminal"
                    ? "Terminal mode attached. Focus the compatibility surface and use Ctrl+C when the active program accepts it."
                    : execution.output,
                outputPreview:
                  event.presentation === "terminal" ? "" : execution.outputPreview,
              }
            : execution,
        ),
      );
      return;
    }

    if (event.type === "output") {
      if (event.target === "terminal") {
        if (
          activeTerminalExecutionId === event.executionId &&
          terminalControllerRef.current
        ) {
          terminalControllerRef.current.write(event.chunk);
        } else {
          const backlog = terminalOutputBacklogRef.current.get(event.executionId) ?? [
            TERMINAL_SESSION_RESET,
          ];
          backlog.push(event.chunk);
          terminalOutputBacklogRef.current.set(event.executionId, backlog);
        }

        return;
      }

      setExecutions((current) =>
        current.map((execution) =>
          execution.id === event.executionId
            ? {
                ...execution,
                output: normalizeOutput(`${execution.output}${event.chunk}`),
                outputPreview: buildPreview(
                  normalizeOutput(`${execution.output}${event.chunk}`),
                ),
              }
            : execution,
        ),
      );
      return;
    }

    if (event.execution.presentation === "terminal") {
      terminalOutputBacklogRef.current.delete(event.execution.id);

      if (activeTerminalExecutionId === event.execution.id) {
        setActiveTerminalExecutionId(null);
        focusEditorAtEnd();
      }
    }

    setShellContext(event.shellContext);
    setHistoryRefreshKey((current) => current + 1);
    setExecutions((current) => {
      const didReplace = current.some(
        (execution) => execution.id === event.execution.id,
      );

      if (!didReplace) {
        return [event.execution, ...current];
      }

      return current.map((execution) =>
        execution.id === event.execution.id ? event.execution : execution,
      );
    });
  });

  const interruptExecution = useEffectEvent(async (executionId: string) => {
    try {
      await api.app.interruptExecution({ executionId });
    } catch {
      setCopyToast("Interrupt failed");
    }
  });

  useEffect(() => {
    const unsubscribe = api.app.onExecutionEvent((event) => {
      handleExecutionEvent(event);
    });

    return unsubscribe;
  }, [api, handleExecutionEvent]);

  useEffect(() => {
    if (!activeTerminalExecutionId) {
      return;
    }

    flushTerminalBacklog(activeTerminalExecutionId);
  }, [activeTerminalExecutionId, flushTerminalBacklog]);

  const handleHistoryShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (activeTerminalExecutionId) {
      return;
    }

    const isHistoryShortcut =
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "r" &&
      !event.shiftKey &&
      !event.altKey;

    if (!isHistoryShortcut) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    setHistoryQuery(draft.trim());
    setHistorySelectedIndex(0);
    setHistoryOpen(true);
  });

  useEffect(() => {
    window.addEventListener("keydown", handleHistoryShortcut, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleHistoryShortcut, {
        capture: true,
      });
    };
  }, [handleHistoryShortcut]);

  const handleInterruptShortcut = useEffectEvent((event: KeyboardEvent) => {
    const isInterruptShortcut =
      event.ctrlKey &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key.toLowerCase() === "c";

    if (!isInterruptShortcut || activeTerminalExecutionId || !runningExecution) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void interruptExecution(runningExecution.id);
  });

  useEffect(() => {
    window.addEventListener("keydown", handleInterruptShortcut, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleInterruptShortcut, {
        capture: true,
      });
    };
  }, [handleInterruptShortcut]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      if (
        historyOpen ||
        activeTerminalExecutionId ||
        hasRunningExecution ||
        isSubmitting ||
        !editorRef.current
      ) {
        return;
      }

      editorRef.current.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [activeTerminalExecutionId, hasRunningExecution, historyOpen, isSubmitting]);

  useEffect(() => {
    if (!copyToast) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setCopyToast(null);
    }, 1400);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [copyToast]);

  useEffect(() => {
    const normalizedDraft = deferredDraft.trim();

    if (!normalizedDraft) {
      setAutocompleteItems([]);
      setAutocompleteIndex(null);
      return;
    }

    const requestId = autocompleteRequestRef.current + 1;
    autocompleteRequestRef.current = requestId;

    void api.history
      .getAutocomplete({
        draft: normalizedDraft,
        cwd: shellContext.cwd,
        limit: 6,
      })
      .then((response) => {
        if (autocompleteRequestRef.current !== requestId) {
          return;
        }

        startTransition(() => {
          setAutocompleteItems(response.items);
          setAutocompleteIndex(null);
        });
      })
      .catch(() => {
        if (autocompleteRequestRef.current !== requestId) {
          return;
        }

        setAutocompleteItems([]);
        setAutocompleteIndex(null);
      });
  }, [api, deferredDraft, historyRefreshKey, shellContext.cwd]);

  useEffect(() => {
    if (!historyOpen) {
      return;
    }

    const requestId = historySearchRequestRef.current + 1;
    historySearchRequestRef.current = requestId;
    setHistorySearchPending(true);
    setHistorySearchError(null);

    void api.history
      .search({
        query: deferredHistoryQuery,
        cwd: shellContext.cwd,
        limit: 40,
      })
      .then((response) => {
        if (historySearchRequestRef.current !== requestId) {
          return;
        }

        startTransition(() => {
          setHistoryResults(response.items);
          setHistorySelectedIndex((current) =>
            clampIndex(current, response.items.length),
          );
        });
      })
      .catch(() => {
        if (historySearchRequestRef.current !== requestId) {
          return;
        }

        setHistoryResults([]);
        setHistorySelectedIndex(0);
        setHistorySearchError("History search failed. Try again.");
      })
      .finally(() => {
        if (historySearchRequestRef.current !== requestId) {
          return;
        }

        setHistorySearchPending(false);
      });
  }, [
    api,
    deferredHistoryQuery,
    historyOpen,
    historyRefreshKey,
    shellContext.cwd,
  ]);

  useLayoutEffect(() => {
    if (!historyOpen) {
      return;
    }

    const input = historySearchInputRef.current;

    if (!input) {
      return;
    }

    if (document.activeElement !== input) {
      input.focus({ preventScroll: true });
    }

    const cursor = input.value.length;

    if (input.selectionStart !== cursor || input.selectionEnd !== cursor) {
      input.setSelectionRange(cursor, cursor);
    }
  }, [historyOpen, historyQuery]);

  useLayoutEffect(() => {
    const feed = feedScrollRef.current;

    if (!feed || !shouldStickFeedToBottomRef.current) {
      return;
    }

    feed.scrollTop = feed.scrollHeight;
  }, [executions]);

  useEffect(() => {
    if (
      !runningExecution ||
      runningExecution.presentation !== "card" ||
      activeTerminalExecutionId
    ) {
      lastExecutionResizeRef.current = null;
      return;
    }

    const feed = feedScrollRef.current;

    if (!feed) {
      return;
    }

    let frame = 0;
    const sendResize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const size = measureCardExecutionSize(feedScrollRef.current);

        if (!size) {
          return;
        }

        const lastResize = lastExecutionResizeRef.current;

        if (
          lastResize &&
          lastResize.executionId === runningExecution.id &&
          lastResize.cols === size.cols &&
          lastResize.rows === size.rows
        ) {
          return;
        }

        lastExecutionResizeRef.current = {
          executionId: runningExecution.id,
          ...size,
        };

        void api.app.resizeExecution({
          executionId: runningExecution.id,
          cols: size.cols,
          rows: size.rows,
        });
      });
    };

    const resizeObserver = new ResizeObserver(() => {
      sendResize();
    });

    resizeObserver.observe(feed);
    sendResize();
    window.addEventListener("resize", sendResize);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", sendResize);
      resizeObserver.disconnect();
    };
  }, [
    api,
    activeTerminalExecutionId,
    runningExecution?.id,
    runningExecution?.presentation,
  ]);

  const submitCommand = useEffectEvent(async () => {
    const commandText = draft.trim();

    if (!commandText || hasRunningExecution || isSubmitting || activeTerminalExecutionId) {
      return;
    }

    setIsSubmitting(true);
    setRecallSession(null);
    clearCommandCompletionState();
    setAutocompleteItems([]);
    setPathCompletionItems([]);
    setAutocompleteIndex(null);
    setHistoryOpen(false);
    setDraft("");
    let responseMode: "card" | "terminal" | null = null;

    try {
      const cardExecutionSize = measureCardExecutionSize(feedScrollRef.current);
      const response = await api.app.runCommand({
        commandText,
        ...cardExecutionSize,
      });
      responseMode = response.mode;

      if (response.mode === "terminal") {
        setActiveTerminalExecutionId(response.executionId);
      }
    } catch (error) {
      const startedAt = new Date().toISOString();

      setExecutions((current) => [
        {
          id: `local-error-${startedAt}`,
          presentation: "card",
          commandText,
          cwd: shellContext.cwd,
          shell: shellContext.executable,
          startedAt,
          finishedAt: startedAt,
          status: "failed",
          durationMs: 0,
          exitCode: 1,
          outputPreview:
            error instanceof Error ? error.message : "Mishell failed to run the command.",
          output:
            error instanceof Error ? error.message : "Mishell failed to run the command.",
          outputPath: null,
        },
        ...current,
      ]);
      setDraft(commandText);
    } finally {
      setIsSubmitting(false);

      if (responseMode !== "terminal") {
        editorRef.current?.focus();
      }
    }
  });

  const navigateInlineSuggestions = useEffectEvent((direction: "next" | "prev") => {
    if (!inlineSuggestionsVisible) {
      return false;
    }

    setAutocompleteIndex((current) => {
      if (inlineSuggestionItems.length === 0) {
        return null;
      }

      if (current === null) {
        return direction === "next" ? 0 : inlineSuggestionItems.length - 1;
      }

      if (direction === "prev") {
        return current <= 0 ? null : current - 1;
      }

      const nextIndex = current + 1;
      return clampIndex(nextIndex, inlineSuggestionItems.length);
    });

    return true;
  });

  const requestAutocomplete = useEffectEvent(async () => {
    const normalizedDraft = draft.trim();

    if (!normalizedDraft) {
      setAutocompleteItems([]);
      setAutocompleteIndex(null);
      return false;
    }

    const requestId = autocompleteRequestRef.current + 1;
    autocompleteRequestRef.current = requestId;

    try {
      const response = await api.history.getAutocomplete({
        draft: normalizedDraft,
        cwd: shellContext.cwd,
        limit: 6,
      });

      if (autocompleteRequestRef.current !== requestId) {
        return false;
      }

      startTransition(() => {
        setAutocompleteItems(response.items);
        setAutocompleteIndex(null);
      });

      return response.items.length > 0;
    } catch {
      if (autocompleteRequestRef.current !== requestId) {
        return false;
      }

      setAutocompleteItems([]);
      setAutocompleteIndex(null);
      return false;
    }
  });

  const requestCommandCompletions = useEffectEvent(async () => {
    const requestId = commandCompletionRequestRef.current + 1;
    commandCompletionRequestRef.current = requestId;
    setCommandCompletionLoadingMore(false);

    try {
      const response = await api.app.getCommandCompletions({
        draft,
        cwd: shellContext.cwd,
        limit: COMMAND_COMPLETION_PAGE_SIZE,
        offset: 0,
      });

      if (commandCompletionRequestRef.current !== requestId) {
        return {
          found: false,
          resolvedCommand: false,
          yieldToPath: false,
        };
      }

      startTransition(() => {
        setCommandCompletionItems(response.items);
        setCommandCompletionHasMore(response.hasMore);
        setPathCompletionItems([]);
        setAutocompleteIndex(null);
      });

      return {
        found: response.items.length > 0,
        resolvedCommand: response.resolvedCommand,
        yieldToPath: response.yieldToPath,
      };
    } catch {
      if (commandCompletionRequestRef.current !== requestId) {
        return {
          found: false,
          resolvedCommand: false,
          yieldToPath: false,
        };
      }

      clearCommandCompletionState();
      setAutocompleteIndex(null);
      return {
        found: false,
        resolvedCommand: false,
        yieldToPath: false,
      };
    }
  });

  const requestMoreCommandCompletions = useEffectEvent(async () => {
    if (
      commandCompletionLoadingMore ||
      !commandCompletionHasMore ||
      commandCompletionItems.length === 0
    ) {
      return;
    }

    const requestId = commandCompletionRequestRef.current;
    setCommandCompletionLoadingMore(true);

    try {
      const response = await api.app.getCommandCompletions({
        draft,
        cwd: shellContext.cwd,
        limit: COMMAND_COMPLETION_PAGE_SIZE,
        offset: commandCompletionItems.length,
      });

      if (commandCompletionRequestRef.current !== requestId) {
        return;
      }

      setCommandCompletionItems((currentItems) =>
        mergeCommandCompletionItems(currentItems, response.items),
      );
      setCommandCompletionHasMore(response.hasMore);
      setCommandCompletionLoadingMore(false);
    } catch {
      if (commandCompletionRequestRef.current !== requestId) {
        return;
      }

      setCommandCompletionLoadingMore(false);
    }
  });

  const requestPathCompletions = useEffectEvent(
    async ({ mergeIntoCommandCompletions = false } = {}) => {
      const requestId = pathCompletionRequestRef.current + 1;
      pathCompletionRequestRef.current = requestId;

      const response = await api.app.getPathCompletions({
        draft,
        cwd: shellContext.cwd,
        limit: 24,
      });

      if (pathCompletionRequestRef.current !== requestId) {
        return false;
      }

      startTransition(() => {
        if (mergeIntoCommandCompletions) {
          setPathCompletionItems(response.items);
        } else {
          clearCommandCompletionState();
          setPathCompletionItems(response.items);
        }
        setAutocompleteIndex(null);
      });

      return response.items.length > 0;
    },
  );

  const clearEditorDraft = useEffectEvent(() => {
    setRecallSession(null);
    clearCommandCompletionState();
    setAutocompleteItems([]);
    setPathCompletionItems([]);
    setAutocompleteIndex(null);
    setDraftValue("", "system");
    focusEditorAtEnd();
  });

  const closeInlineSuggestions = useEffectEvent(() => {
    invalidateInlineSuggestionRequests();
    setRecallSession(null);
    clearCommandCompletionState();
    setAutocompleteItems([]);
    setPathCompletionItems([]);
    setAutocompleteIndex(null);
  });

  const acceptInlineSuggestion = useEffectEvent(() => {
    if (!selectedInlineSuggestion) {
      return false;
    }

    if (selectedInlineSuggestion.type === "command") {
      applyCommandCompletionSelection(selectedInlineSuggestion.item);
      return true;
    }

    if (selectedInlineSuggestion.type === "path") {
      applyPathCompletionSelection(selectedInlineSuggestion.item);
      return true;
    }

    applyAutocompleteSelection(selectedInlineSuggestion.item.commandText);
    return true;
  });

  const cycleInlineSuggestions = useEffectEvent(() => {
    if (!inlineSuggestionsVisible) {
      return false;
    }

    if (autocompleteIndex === null) {
      navigateInlineSuggestions("next");
      return true;
    }

    if (
      selectedInlineSuggestion &&
      getInlineSuggestionValue(selectedInlineSuggestion) === draft.trim() &&
      inlineSuggestionItems.length > 1
    ) {
      navigateInlineSuggestions("next");
      return true;
    }

    return acceptInlineSuggestion();
  });

  const requestInlineSuggestions = useEffectEvent(async () => {
    const [commandCompletionResult, didFindHistory] = await Promise.all([
      requestCommandCompletions(),
      requestAutocomplete(),
    ]);

    let didFindPath = false;

    if (commandCompletionResult.yieldToPath) {
      didFindPath = await requestPathCompletions({
        mergeIntoCommandCompletions: commandCompletionResult.found,
      });
    } else if (!commandCompletionResult.found && !commandCompletionResult.resolvedCommand) {
      const pathPreferred =
        shouldRequestPathCompletions(draft) || !didFindHistory;

      if (pathPreferred) {
        didFindPath = await requestPathCompletions();
      }
    }

    return {
      found:
        commandCompletionResult.found || didFindHistory || didFindPath,
      hasStructured:
        commandCompletionResult.found || didFindPath,
    };
  });

  const acceptRecallSelection = useEffectEvent(() => {
    if (!selectedRecallItem) {
      return false;
    }

    setRecallSession(null);
    clearCommandCompletionState();
    setPathCompletionItems([]);
    setAutocompleteItems([]);
    setAutocompleteIndex(null);
    setDraftValue(selectedRecallItem.commandText, "system");
    focusEditorAtEnd();
    return true;
  });

  const applyRecallResult = useEffectEvent((commandText: string) => {
    setRecallSession(null);
    clearCommandCompletionState();
    setPathCompletionItems([]);
    setAutocompleteItems([]);
    setAutocompleteIndex(null);
    setDraftValue(commandText, "system");
    focusEditorAtEnd();
  });

  const navigateRecallHistory = useEffectEvent(
    async (direction: "back" | "forward") => {
      const activeSession = recallSession;

      if (!activeSession || activeSession.cwd !== shellContext.cwd) {
        if (direction === "forward") {
          return;
        }

        const requestId = historyRecallRequestRef.current + 1;
        historyRecallRequestRef.current = requestId;

        const response = await api.history.getRecall({
          cwd: shellContext.cwd,
          limit: 60,
        });

        if (historyRecallRequestRef.current !== requestId) {
          return;
        }

        const items = response.items.filter(
          (item) => item.commandText !== draft.trim(),
        );

        if (items.length === 0) {
          return;
        }

        setRecallSession({
          cwd: shellContext.cwd,
          originalDraft: draft,
          items: [...items].reverse(),
          index: items.length - 1,
        });
        return;
      }

      if (direction === "back") {
        setRecallSession({
          ...activeSession,
          index: Math.max(activeSession.index - 1, 0),
        });
        return;
      }

      if (activeSession.index >= activeSession.items.length - 1) {
        setRecallSession(null);
        setDraftValue(activeSession.originalDraft, "system");
        focusEditorAtEnd();
        return;
      }

      setRecallSession({
        ...activeSession,
        index: activeSession.index + 1,
      });
    },
  );

  const hoverRecallHistory = useEffectEvent((index: number) => {
    if (!recallSession) {
      return;
    }

    setRecallSession({
      ...recallSession,
      index,
    });
  });

  const handleEditorKeyDown = useEffectEvent(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key.toLowerCase() === "c" &&
        event.ctrlKey &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (runningExecution) {
          void interruptExecution(runningExecution.id);
          return true;
        }

        clearEditorDraft();
        return true;
      }

      if (
        event.key === "Escape" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        (recallVisible || inlineSuggestionsVisible)
      ) {
        event.preventDefault();
        closeInlineSuggestions();
        return true;
      }

      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        recallVisible &&
        selectedRecallItem !== null
      ) {
        event.preventDefault();
        acceptRecallSelection();
        return true;
      }

      if (
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        inlineSuggestionsVisible &&
        autocompleteIndex !== null
      ) {
        event.preventDefault();
        acceptInlineSuggestion();
        return true;
      }

      if (
        event.key === "ArrowDown" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        recallVisible
      ) {
        event.preventDefault();
        void navigateRecallHistory("forward");
        return true;
      }

      if (
        event.key === "ArrowDown" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        inlineSuggestionsVisible
      ) {
        event.preventDefault();
        navigateInlineSuggestions("next");
        return true;
      }

      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault();
        if (inlineSuggestionsVisible) {
          if (!hasStructuredInlineSuggestions && hasHistoryInlineSuggestions) {
            void requestInlineSuggestions().then((result) => {
              if (result.hasStructured) {
                return;
              }

              cycleInlineSuggestions();
            });
            return true;
          }

          cycleInlineSuggestions();
          return true;
        }

        void requestInlineSuggestions();
        return true;
      }

      if (
        event.key === "ArrowUp" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        inlineSuggestionsVisible &&
        autocompleteIndex !== null
      ) {
        event.preventDefault();
        navigateInlineSuggestions("prev");
        return true;
      }

      if (
        event.key === "ArrowUp" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        isCursorOnFirstLine(event.currentTarget)
      ) {
        event.preventDefault();
        void navigateRecallHistory("back");
        return true;
      }

      return false;
    },
  );

  const copyText = useEffectEvent(async (text: string, label: string) => {
    try {
      await api.clipboard.writeText(text);
      setCopyToast(`${label} copied`);
    } catch {
      setCopyToast(`Copy failed for ${label.toLowerCase()}`);
    }
  });

  const titleBarStyle = {
    WebkitAppRegion: "drag",
  } as CSSProperties;
  const titleBarControlStyle = {
    WebkitAppRegion: "no-drag",
  } as CSSProperties;

  const showAmbientGlow =
    surfaceId === "studio" || surfaceId === "aurora" || surfaceId === "depth";
  const showTechGrid =
    surfaceId === "studio" || surfaceId === "lattice" || surfaceId === "depth";

  return (
    <div className="relative flex h-dvh max-h-dvh flex-col overflow-hidden bg-[color:var(--bg)] text-[color:var(--text-primary)]">
      {showAmbientGlow ? (
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,var(--glow-primary),transparent_30%),radial-gradient(circle_at_bottom_right,var(--glow-secondary),transparent_34%)]" />
      ) : null}
      {showTechGrid ? (
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(var(--grid-line)_1px,transparent_1px),linear-gradient(90deg,var(--grid-line)_1px,transparent_1px)] [background-size:32px_32px]" />
      ) : null}
      <div className="relative flex min-h-0 w-full flex-1 flex-col">
        <div
          className={cn(
            "flex h-9 shrink-0 items-center gap-1 border-b border-[color:var(--border)] bg-[color:var(--panel)]/75 backdrop-blur-[2px]",
            isMacTrafficLightInset ? "pl-[76px]" : "pl-2",
          )}
          style={titleBarStyle}
        >
          <ThemeSettingsDialog
            themeId={themeId}
            themeOptions={themeOptions}
            surfaceId={surfaceId}
            colorOverrides={colorOverrides}
            triggerStyle={titleBarControlStyle}
            onSelectPreset={(nextId) => {
              setThemeId(nextId);
              setColorOverrides({});
            }}
            onSurfaceChange={(nextSurface) => {
              setSurfaceId(nextSurface);
            }}
            onColorChange={(token, value) => {
              setColorOverrides((previous) => {
                const next = { ...previous };
                const presetValue = PRESET_UI_VARS[themeId][token];
                if (colorsLooselyEqual(value, presetValue)) {
                  delete next[token];
                } else {
                  next[token] = value;
                }
                return next;
              });
            }}
            onResetColors={() => {
              setColorOverrides({});
            }}
          />
          <div className="min-h-0 min-w-0 flex-1" aria-hidden />
        </div>

        <div
          className={cn(
            "flex min-h-0 w-full flex-1 flex-col overflow-hidden",
            activeTerminalExecutionId
              ? "gap-0 px-0 py-0"
              : "mx-auto max-w-[1920px] gap-4 px-3 py-3 sm:px-4 lg:px-5",
          )}
        >
          <main
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              activeTerminalExecutionId ? "gap-0" : "gap-4",
            )}
          >
            {activeTerminalExecutionId ? (
              <section className="min-h-0 flex-1 overflow-hidden">
                <TerminalModeSurface
                  key={activeTerminalExecutionId}
                  executionId={activeTerminalExecutionId}
                  onInput={handleTerminalInput}
                  onReady={handleTerminalReady}
                  onResize={handleTerminalResize}
                  theme={activeTerminalTheme}
                />
              </section>
            ) : (
              <>
                <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div
                    ref={feedScrollRef}
                    className="mishell-overlay-scroll min-h-0 flex-1 overflow-y-auto"
                    onScroll={(event) => {
                      const node = event.currentTarget;
                      const distanceFromBottom =
                        node.scrollHeight - node.clientHeight - node.scrollTop;
                      shouldStickFeedToBottomRef.current = distanceFromBottom <= 48;
                    }}
                  >
                    <div className="flex min-h-full min-w-0 flex-col justify-end">
                      <div className="flex min-w-0 flex-col divide-y divide-[color:var(--border)]">
                        {feedExecutions.map((execution) => (
                          <CommandCard
                            key={execution.id}
                            execution={execution}
                            onInterrupt={
                              execution.status === "running"
                                ? () => {
                                    void interruptExecution(execution.id);
                                  }
                                : undefined
                            }
                            onCopyCommand={() => {
                              void copyText(execution.commandText, "Command");
                            }}
                            onCopyOutput={() => {
                              void copyText(execution.output, "Output");
                            }}
                            onCopyBoth={() => {
                              void copyText(
                                `cmd: ${execution.commandText}\nout: ${execution.output}`,
                                "Command + output",
                              );
                            }}
                            onOpenFullOutput={() => {
                              setFullOutputExecutionId(execution.id);
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="shrink-0">
                  <div className="border border-[color:var(--border-strong)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--panel-strong)_72%,var(--bg)),color-mix(in_srgb,var(--panel-muted)_85%,var(--bg)))]">
                    <ShellHeader
                      shellContext={shellContext}
                      latestExecution={latestExecution}
                    />
                    <ShellEditor
                      commandSuggestionCount={commandCompletionItems.length}
                      commandHasMore={commandCompletionHasMore}
                      commandLoadingMore={commandCompletionLoadingMore}
                      historySuggestionCount={autocompleteItems.length}
                      inlineSuggestionItems={inlineSuggestionItems}
                      onHighlightIndex={setAutocompleteIndex}
                      onHighlightRecallIndex={hoverRecallHistory}
                      onLoadMoreCommandCompletions={() => {
                        void requestMoreCommandCompletions();
                      }}
                      onSelectRecallCommand={applyRecallResult}
                      recallItems={recallSession?.items ?? []}
                      recallVisible={recallVisible}
                      selectedRecallItem={selectedRecallItem}
                      onSelectCommandCompletion={applyCommandCompletionSelection}
                      onSelectAutocomplete={applyAutocompleteSelection}
                      onSelectPathCompletion={applyPathCompletionSelection}
                      pathSuggestionCount={pathCompletionItems.length}
                      selectedIndex={autocompleteIndex}
                      ref={editorRef}
                      value={draft}
                      disabled={hasRunningExecution || isSubmitting}
                      onChange={(nextValue) => {
                        setDraftValue(nextValue, "user");
                      }}
                      onKeyDown={handleEditorKeyDown}
                      onSubmit={() => {
                        void submitCommand();
                      }}
                    />
                  </div>
                </section>
              </>
            )}

            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
              <HistorySearchDialog
                inputRef={historySearchInputRef}
                pending={historySearchPending}
                query={historyQuery}
                results={historyResults}
                selectedIndex={historySelectedIndex}
                error={historySearchError}
                currentCwd={shellContext.cwd}
                onChangeQuery={(nextValue) => {
                  setHistoryQuery(nextValue);
                  setHistorySelectedIndex(0);
                }}
                onChangeSelectedIndex={setHistorySelectedIndex}
                onSelectCommand={applyHistoryResult}
              />
            </Dialog>
          </main>
        </div>
      </div>

      <Dialog
        open={Boolean(fullOutputExecution)}
        onOpenChange={(open) => {
          if (!open) {
            setFullOutputExecutionId(null);
          }
        }}
      >
        <DialogContent className="w-[min(94vw,1100px)]">
          <DialogHeader>
            <DialogTitle>Full Output</DialogTitle>
            <DialogDescription>
              {fullOutputExecution?.commandText ?? "Execution output"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={!fullOutputExecution}
                onClick={() => {
                  if (!fullOutputExecution) {
                    return;
                  }

                  void copyText(fullOutputExecution.commandText, "Command");
                }}
              >
                Copy command
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={!fullOutputExecution}
                onClick={() => {
                  if (!fullOutputExecution) {
                    return;
                  }

                  void copyText(fullOutputExecution.output, "Output");
                }}
              >
                Copy output
              </Button>
            </div>
            <ScrollArea className="h-[min(62vh,720px)] border border-[color:var(--border)] bg-black/30">
              <pre className="m-0 whitespace-pre-wrap px-4 py-4 font-mono text-sm leading-6 text-[color:var(--text-secondary)]">
                {fullOutputExecution?.output || "No output captured for this command."}
              </pre>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {copyToast ? (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 border border-[color:var(--border-strong)] bg-[color:var(--panel-strong)] px-4 py-3 text-[11px] uppercase tracking-[0.28em] text-[color:var(--accent)] shadow-[0_0_0_1px_rgba(195,115,255,0.12),0_20px_40px_rgba(0,0,0,0.4)]">
          {copyToast}
        </div>
      ) : null}
    </div>
  );
}

type ShellEditorProps = {
  commandSuggestionCount: number;
  commandHasMore: boolean;
  commandLoadingMore: boolean;
  historySuggestionCount: number;
  inlineSuggestionItems: InlineSuggestionItem[];
  onHighlightIndex: (index: number | null) => void;
  onHighlightRecallIndex: (index: number) => void;
  onLoadMoreCommandCompletions: () => void;
  recallItems: HistoryRecallItem[];
  recallVisible: boolean;
  onSelectRecallCommand: (commandText: string) => void;
  selectedRecallItem: HistoryRecallItem | null;
  value: string;
  onSelectCommandCompletion: (item: CommandCompletionItem) => void;
  onSelectAutocomplete: (commandText: string) => void;
  onSelectPathCompletion: (item: PathCompletionItem) => void;
  disabled: boolean;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean | void;
  pathSuggestionCount: number;
  selectedIndex: number | null;
  onSubmit: () => void;
};

type FloatingSuggestionAnchor = {
  bottom: number;
  left: number;
  width: number;
};

/** `text-sm` + `leading-7` → 1.25rem × 1.75 line-height = 28px per line; `py-5` → 20px × 2 vertical padding */
const EDITOR_LINE_HEIGHT_PX = 28;
const EDITOR_VERTICAL_PAD_PX = 40;
const EDITOR_MIN_LINES = 2;
const EDITOR_MAX_LINES = 30;
const EDITOR_MIN_HEIGHT =
  EDITOR_MIN_LINES * EDITOR_LINE_HEIGHT_PX + EDITOR_VERTICAL_PAD_PX;
const EDITOR_MAX_HEIGHT =
  EDITOR_MAX_LINES * EDITOR_LINE_HEIGHT_PX + EDITOR_VERTICAL_PAD_PX;
const TERMINAL_SESSION_RESET = "\u001bc\u001b[3J\u001b[2J\u001b[H";

const ShellEditor = ({
  commandSuggestionCount,
  commandHasMore,
  commandLoadingMore,
  historySuggestionCount,
  inlineSuggestionItems,
  onHighlightIndex,
  onHighlightRecallIndex,
  onLoadMoreCommandCompletions,
  onSelectRecallCommand,
  recallItems,
  recallVisible,
  selectedRecallItem,
  value,
  onSelectCommandCompletion,
  onSelectAutocomplete,
  onSelectPathCompletion,
  disabled,
  onChange,
  onKeyDown,
  pathSuggestionCount,
  selectedIndex,
  onSubmit,
  ref,
}: ShellEditorProps & { ref: React.RefObject<HTMLTextAreaElement | null> }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const [editorHeight, setEditorHeight] = useState(EDITOR_MIN_HEIGHT);
  const [floatingAnchor, setFloatingAnchor] =
    useState<FloatingSuggestionAnchor | null>(null);

  useLayoutEffect(() => {
    const ta = ref.current;
    if (!ta) {
      return;
    }

    ta.style.height = "0px";
    const natural = ta.scrollHeight;
    const next = Math.min(
      EDITOR_MAX_HEIGHT,
      Math.max(EDITOR_MIN_HEIGHT, natural),
    );
    setEditorHeight(next);
    ta.style.height = "";
  }, [value, disabled, ref]);

  const scrollEditor = editorHeight >= EDITOR_MAX_HEIGHT;
  const suggestionVisible =
    inlineSuggestionItems.length > 0 || recallVisible;

  useLayoutEffect(() => {
    const textarea = ref.current;
    const container = containerRef.current;

    if (!suggestionVisible || !textarea || !container) {
      setFloatingAnchor(null);
      return;
    }

    setFloatingAnchor(getFloatingSuggestionAnchor(textarea, container));
  }, [
    editorHeight,
    inlineSuggestionItems.length,
    recallVisible,
    ref,
    selectedIndex,
    selectedRecallItem,
    suggestionVisible,
    value,
  ]);

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: editorHeight, minHeight: EDITOR_MIN_HEIGHT }}
    >
      <pre
        ref={highlightRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 box-border overflow-hidden whitespace-pre-wrap break-words px-4 py-5 font-mono text-sm leading-7"
      >
        {value ? renderHighlightedCommand(value) : "\u00A0"}
      </pre>
      <textarea
        ref={ref}
        value={value}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onScroll={(event) => {
          if (highlightRef.current) {
            highlightRef.current.scrollTop = event.currentTarget.scrollTop;
            highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }

          if (containerRef.current) {
            setFloatingAnchor(
              getFloatingSuggestionAnchor(event.currentTarget, containerRef.current),
            );
          }
        }}
        onSelect={(event) => {
          if (containerRef.current) {
            setFloatingAnchor(
              getFloatingSuggestionAnchor(event.currentTarget, containerRef.current),
            );
          }
        }}
        onKeyDown={(event) => {
          if (onKeyDown?.(event)) {
            return;
          }

          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.metaKey &&
            !event.ctrlKey &&
            !event.altKey
          ) {
            event.preventDefault();
            onSubmit();
            return;
          }

          if (event.key === "Tab") {
            event.preventDefault();
            const textarea = event.currentTarget;
            const nextValue =
              value.slice(0, textarea.selectionStart) +
              "  " +
              value.slice(textarea.selectionEnd);
            const nextCursor = textarea.selectionStart + 2;

            onChange(nextValue);

            requestAnimationFrame(() => {
              textarea.selectionStart = nextCursor;
              textarea.selectionEnd = nextCursor;
            });
          }
        }}
        className={cn(
          "mishell-overlay-scroll absolute inset-0 box-border w-full resize-none bg-transparent px-4 py-5 font-mono text-sm leading-7 outline-none",
          scrollEditor ? "overflow-y-auto" : "overflow-y-hidden",
          "text-transparent caret-[color:var(--accent)] selection:bg-[color:var(--accent-dim)]",
          disabled && "cursor-not-allowed opacity-70",
        )}
      />
      {suggestionVisible && floatingAnchor ? (
        <FloatingSuggestionDropdown
          anchor={floatingAnchor}
          commandSuggestionCount={commandSuggestionCount}
          commandHasMore={commandHasMore}
          commandLoadingMore={commandLoadingMore}
          historySuggestionCount={historySuggestionCount}
          inlineSuggestionItems={inlineSuggestionItems}
          onHighlightIndex={onHighlightIndex}
          onHighlightRecallIndex={onHighlightRecallIndex}
          onLoadMoreCommandCompletions={onLoadMoreCommandCompletions}
          onSelectRecallCommand={onSelectRecallCommand}
          onSelectCommandCompletion={onSelectCommandCompletion}
          onSelectAutocomplete={onSelectAutocomplete}
          onSelectPathCompletion={onSelectPathCompletion}
          pathSuggestionCount={pathSuggestionCount}
          recallItems={recallItems}
          recallVisible={recallVisible}
          selectedIndex={selectedIndex}
          selectedRecallItem={selectedRecallItem}
        />
      ) : null}
    </div>
  );
};

function ShellHeader({
  shellContext,
  latestExecution,
}: {
  shellContext: ShellContext;
  latestExecution: CommandExecution | null;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3 text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
      <span className="flex items-center gap-2">
        <FolderTree className="h-3.5 w-3.5 text-[color:var(--accent)]" />
        {shellContext.displayCwd}
      </span>
      <span className="flex items-center gap-2">
        <Command className="h-3.5 w-3.5 text-[color:var(--accent)]" />
        {shellContext.shellName}
      </span>
      <span className="flex items-center gap-2">
        <GitBranch className="h-3.5 w-3.5 text-[color:var(--accent)]" />
        {shellContext.gitBranch ?? "no git context"}
      </span>
      <span className="flex items-center gap-2">
        <Timer className="h-3.5 w-3.5 text-[color:var(--accent)]" />
        {latestExecution
          ? `${formatDuration(latestExecution.durationMs)} / exit ${latestExecution.exitCode ?? "…"}`
          : "idle / ready"}
      </span>
    </div>
  );
}

function CommandCard({
  execution,
  onInterrupt,
  onCopyCommand,
  onCopyOutput,
  onCopyBoth,
  onOpenFullOutput,
}: {
  execution: CommandExecution;
  onInterrupt?: () => void;
  onCopyCommand: () => void;
  onCopyOutput: () => void;
  onCopyBoth: () => void;
  onOpenFullOutput: () => void;
}) {
  const isTerminalPresentation = execution.presentation === "terminal";
  const displayOutput =
    execution.status === "running"
      ? execution.output ||
        (isTerminalPresentation
          ? "Terminal mode is active in the compatibility surface."
          : "Waiting for output…")
      : execution.output;
  const hasVisibleOutput =
    execution.status === "running"
      ? Boolean(execution.output.trim())
      : Boolean(execution.output.trim());
  const outputViewportRef = useRef<HTMLDivElement | null>(null);
  const outputScrollerRef = useRef<HTMLDivElement | null>(null);
  const shouldStickOutputToBottomRef = useRef(true);
  const [outputMaxHeight, setOutputMaxHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const viewport = outputViewportRef.current;

    if (!viewport) {
      return;
    }

    const scrollParent = findNearestScrollParent(viewport);
    let frame = 0;

    const updateOutputMaxHeight = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!outputViewportRef.current) {
          return;
        }

        const rect = outputViewportRef.current.getBoundingClientRect();
        const viewportBottom = window.innerHeight - 16;
        const scrollParentBottom = scrollParent
          ? scrollParent.getBoundingClientRect().bottom - 16
          : viewportBottom;
        const nextMaxHeight = Math.max(
          160,
          Math.floor(Math.min(viewportBottom, scrollParentBottom) - rect.top),
        );

        setOutputMaxHeight((current) =>
          current === nextMaxHeight ? current : nextMaxHeight,
        );
      });
    };

    updateOutputMaxHeight();
    window.addEventListener("resize", updateOutputMaxHeight);
    scrollParent?.addEventListener("scroll", updateOutputMaxHeight, {
      passive: true,
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateOutputMaxHeight);
      scrollParent?.removeEventListener("scroll", updateOutputMaxHeight);
    };
  }, [execution.id]);

  useLayoutEffect(() => {
    const scroller = outputScrollerRef.current;

    if (!scroller || !shouldStickOutputToBottomRef.current) {
      return;
    }

    scroller.scrollTop = scroller.scrollHeight;
  }, [displayOutput, outputMaxHeight]);

  return (
    <article className="w-full min-w-0 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm text-[color:var(--text-primary)]">
            {execution.commandText}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
            <span>{execution.cwd}</span>
            <span>{new Date(execution.startedAt).toLocaleTimeString()}</span>
            <span>exit {execution.exitCode ?? "…"}</span>
            <span>{formatDuration(execution.durationMs)}</span>
            {isTerminalPresentation ? <span>terminal mode</span> : null}
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCopyCommand}>
              <Clipboard className="h-3.5 w-3.5" />
              Copy command
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!execution.output || isTerminalPresentation}
              onClick={onCopyOutput}
            >
              <Clipboard className="h-3.5 w-3.5" />
              Copy output
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!execution.output || isTerminalPresentation}
              onClick={onCopyBoth}
            >
              <Clipboard className="h-3.5 w-3.5" />
              Copy both
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={!execution.output || isTerminalPresentation}
              onClick={onOpenFullOutput}
            >
              Full output
            </Button>
          </div>
          {execution.status === "running" && onInterrupt ? (
            <Button
              variant="ghost"
              size="sm"
              className="border-[color:var(--border-strong)] text-[color:var(--accent)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
              onClick={onInterrupt}
            >
              <Square className="h-3 w-3" fill="currentColor" strokeWidth={1.75} />
              Stop
            </Button>
          ) : null}
          <StatusPill status={execution.status} />
        </div>
      </div>

      {hasVisibleOutput ? (
        <div
          ref={outputViewportRef}
          className="mt-4 border border-[color:var(--border)] bg-black/20"
        >
          <div
            ref={outputScrollerRef}
            className="mishell-overlay-scroll overflow-auto"
            style={outputMaxHeight ? { maxHeight: `${outputMaxHeight}px` } : undefined}
            onScroll={(event) => {
              const node = event.currentTarget;
              const distanceFromBottom =
                node.scrollHeight - node.clientHeight - node.scrollTop;

              shouldStickOutputToBottomRef.current = distanceFromBottom <= 32;
            }}
          >
            <pre className="m-0 min-w-max whitespace-pre px-4 py-4 font-mono text-sm leading-6 text-[color:var(--text-secondary)]">
              {displayOutput}
            </pre>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function FloatingSuggestionDropdown({
  anchor,
  commandSuggestionCount,
  commandHasMore,
  commandLoadingMore,
  historySuggestionCount,
  inlineSuggestionItems,
  onHighlightIndex,
  onHighlightRecallIndex,
  onLoadMoreCommandCompletions,
  onSelectCommandCompletion,
  onSelectRecallCommand,
  onSelectAutocomplete,
  onSelectPathCompletion,
  pathSuggestionCount,
  recallItems,
  recallVisible,
  selectedIndex,
  selectedRecallItem,
}: {
  anchor: FloatingSuggestionAnchor;
  commandSuggestionCount: number;
  commandHasMore: boolean;
  commandLoadingMore: boolean;
  historySuggestionCount: number;
  inlineSuggestionItems: InlineSuggestionItem[];
  onHighlightIndex: (index: number | null) => void;
  onHighlightRecallIndex: (index: number) => void;
  onLoadMoreCommandCompletions: () => void;
  onSelectCommandCompletion: (item: CommandCompletionItem) => void;
  onSelectRecallCommand: (commandText: string) => void;
  onSelectAutocomplete: (commandText: string) => void;
  onSelectPathCompletion: (item: PathCompletionItem) => void;
  pathSuggestionCount: number;
  recallItems: HistoryRecallItem[];
  recallVisible: boolean;
  selectedIndex: number | null;
  selectedRecallItem: HistoryRecallItem | null;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedItemRef = useRef<HTMLButtonElement | null>(null);
  const visibleItemCount = recallVisible
    ? recallItems.length
    : inlineSuggestionItems.length;
  const suggestionSummary = [
    commandSuggestionCount > 0
      ? `${commandSuggestionCount}${commandHasMore ? "+" : ""} cmd`
      : null,
    pathSuggestionCount > 0 ? `${pathSuggestionCount} path` : null,
    historySuggestionCount > 0 ? `${historySuggestionCount} hist` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  useLayoutEffect(() => {
    if (!listRef.current || !selectedItemRef.current) {
      return;
    }

    selectedItemRef.current.scrollIntoView({
      block: "nearest",
    });
  }, [
    inlineSuggestionItems.length,
    recallVisible,
    selectedIndex,
    selectedRecallItem?.id,
  ]);

  if (visibleItemCount === 0) {
    return null;
  }

  return (
    <div
      className="absolute z-20 overflow-hidden border border-[color:var(--border-strong)] bg-[color:color-mix(in_srgb,var(--panel-strong)_92%,black)] shadow-[0_0_0_1px_rgba(195,115,255,0.12),0_18px_50px_rgba(0,0,0,0.5)] backdrop-blur-md"
      style={{
        bottom: anchor.bottom,
        left: anchor.left,
        width: anchor.width,
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
        <span>{recallVisible ? "Recall" : "Suggestions"}</span>
        <span>
          {recallVisible
            ? visibleItemCount
            : suggestionSummary || visibleItemCount.toString()}
          {!recallVisible && commandLoadingMore ? " · loading" : ""}
        </span>
      </div>
      <div
        ref={listRef}
        className="mishell-overlay-scroll max-h-56 overflow-y-auto"
        onScroll={(event) => {
          if (
            recallVisible ||
            commandSuggestionCount === 0 ||
            !commandHasMore ||
            commandLoadingMore
          ) {
            return;
          }

          const node = event.currentTarget;
          const distanceFromBottom = node.scrollHeight - node.clientHeight - node.scrollTop;

          if (distanceFromBottom <= 32) {
            onLoadMoreCommandCompletions();
          }
        }}
      >
        {recallVisible
          ? recallItems.map((item, index) => (
              <button
                key={`${item.id}-${item.startedAt}`}
                ref={selectedRecallItem?.id === item.id ? selectedItemRef : null}
                type="button"
                className={cn(
                  "flex w-full items-start justify-between gap-3 border-b border-[color:var(--border)] px-3 py-2.5 text-left transition last:border-b-0",
                  selectedRecallItem?.id === item.id
                    ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]"
                    : "hover:bg-white/4",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onHighlightRecallIndex(index);
                }}
                onClick={() => {
                  onSelectRecallCommand(item.commandText);
                }}
                onMouseEnter={() => {
                  onHighlightRecallIndex(index);
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-sm text-[color:var(--text-primary)]">
                    {item.commandText}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--text-secondary)]">
                    <span>last used {formatRelativeTime(item.startedAt)}</span>
                    <span>{formatAbsoluteTimestamp(item.startedAt)}</span>
                  </div>
                </div>
                <span className="shrink-0 pt-0.5 text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                  exit {item.exitCode ?? "?"}
                </span>
              </button>
            ))
          : inlineSuggestionItems.map((suggestion, index) => {
              const isSelected = selectedIndex === index;

              if (suggestion.type === "command") {
                const item = suggestion.item;

                return (
                  <button
                    key={suggestion.key}
                    ref={isSelected ? selectedItemRef : null}
                    type="button"
                    className={cn(
                      "flex w-full items-start justify-between gap-3 border-b border-[color:var(--border)] px-3 py-2.5 text-left transition last:border-b-0",
                      isSelected
                        ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]"
                        : "hover:bg-white/4",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelectCommandCompletion(item);
                    }}
                    onMouseEnter={() => {
                      onHighlightIndex(index);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm text-[color:var(--text-primary)]">
                        {item.label}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--text-secondary)]">
                        {item.description ? <span>{item.description}</span> : null}
                        {item.detail ? <span>{item.detail}</span> : null}
                      </div>
                    </div>
                    <span className="shrink-0 pt-0.5 text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                      {item.kind}
                    </span>
                  </button>
                );
              }

              if (suggestion.type === "path") {
                const item = suggestion.item;

                return (
                  <button
                    key={suggestion.key}
                    ref={isSelected ? selectedItemRef : null}
                    type="button"
                    className={cn(
                      "flex w-full items-start justify-between gap-3 border-b border-[color:var(--border)] px-3 py-2.5 text-left transition last:border-b-0",
                      isSelected
                        ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]"
                        : "hover:bg-white/4",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onSelectPathCompletion(item);
                    }}
                    onMouseEnter={() => {
                      onHighlightIndex(index);
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm text-[color:var(--text-primary)]">
                        {item.label}
                      </div>
                      <div className="mt-1 truncate text-[11px] text-[color:var(--text-secondary)]">
                        {item.path}
                      </div>
                    </div>
                    <span className="shrink-0 pt-0.5 text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                      {item.isDirectory ? "dir" : "file"}
                    </span>
                  </button>
                );
              }

              const item = suggestion.item;

              return (
                <button
                  key={suggestion.key}
                  ref={isSelected ? selectedItemRef : null}
                  type="button"
                  className={cn(
                    "flex w-full items-start justify-between gap-3 border-b border-[color:var(--border)] px-3 py-2.5 text-left transition last:border-b-0",
                    isSelected
                      ? "bg-[color:color-mix(in_srgb,var(--accent)_14%,transparent)]"
                      : "hover:bg-white/4",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelectAutocomplete(item.commandText);
                  }}
                  onMouseEnter={() => {
                    onHighlightIndex(index);
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-sm text-[color:var(--text-primary)]">
                      {item.commandText}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[color:var(--text-secondary)]">
                      <span className="truncate">{item.cwd}</span>
                      <span>{item.usageCount}x</span>
                      <span>last used {formatRelativeTime(item.lastStartedAt)}</span>
                    </div>
                  </div>
                  <div className="shrink-0 pt-0.5 text-right text-[10px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                    <div>{item.cwdMatch ? "cwd match" : "history"}</div>
                    <div className="mt-1">{formatAbsoluteTimestamp(item.lastStartedAt)}</div>
                  </div>
                </button>
              );
            })}
        {!recallVisible && commandLoadingMore ? (
          <div className="border-t border-[color:var(--border)] px-3 py-2 text-[11px] text-[color:var(--text-secondary)]">
            Loading more…
          </div>
        ) : null}
      </div>
    </div>
  );
}

function HistorySearchDialog({
  inputRef,
  pending,
  query,
  results,
  selectedIndex,
  error,
  currentCwd,
  onChangeQuery,
  onChangeSelectedIndex,
  onSelectCommand,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  pending: boolean;
  query: string;
  results: HistoryEntry[];
  selectedIndex: number;
  error: string | null;
  currentCwd: string;
  onChangeQuery: (value: string) => void;
  onChangeSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  onSelectCommand: (commandText: string) => void;
}) {
  const selectedResult = results[selectedIndex] ?? results[0] ?? null;
  const selectedResultRef = useRef<HTMLButtonElement | null>(null);

  useLayoutEffect(() => {
    if (!selectedResultRef.current) {
      return;
    }

    selectedResultRef.current.scrollIntoView({
      block: "nearest",
    });
  }, [results.length, selectedIndex]);

  return (
    <DialogContent
      className="top-[6vh] max-h-[88vh] w-[min(94vw,1180px)] -translate-y-0 overflow-hidden"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
      }}
    >
      <DialogHeader>
        <DialogTitle>History Search</DialogTitle>
        <DialogDescription>
          Search persisted command text and cwd metadata, then push the selected
          command back into the editor.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-5 grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-h-0 space-y-3">
          <div className="flex items-center gap-3 border border-[color:var(--border)] bg-black/20 px-4 py-3">
            <Search className="h-4 w-4 text-[color:var(--accent)]" />
            <input
              ref={inputRef}
              value={query}
              spellCheck={false}
              placeholder="Search command text or cwd"
              onChange={(event) => {
                onChangeQuery(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  onChangeSelectedIndex((current) =>
                    clampIndex(current + 1, results.length),
                  );
                }

                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  onChangeSelectedIndex((current) =>
                    clampIndex(current - 1, results.length),
                  );
                }

                if (event.key === "Enter" && selectedResult) {
                  event.preventDefault();
                  onSelectCommand(selectedResult.commandText);
                }
              }}
              className="w-full border-none bg-transparent font-mono text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
            />
            {pending ? (
              <span className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--accent)]">
                searching
              </span>
            ) : null}
          </div>
          {error ? (
            <div className="border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {error}
            </div>
          ) : null}
          {results.length === 0 ? (
            <div className="border border-dashed border-[color:var(--border)] bg-[color:var(--panel-muted)] px-4 py-6 text-sm text-[color:var(--text-secondary)]">
              {query.trim()
                ? "No history rows matched that query."
                : "No history rows yet. Run commands to seed recall."}
            </div>
          ) : (
            <ScrollArea className="h-[min(58vh,720px)] border border-[color:var(--border)] bg-black/20">
              <div className="grid gap-px bg-[color:var(--border)]">
                {results.map((item, index) => (
                  <button
                    key={item.id}
                    ref={index === selectedIndex ? selectedResultRef : null}
                    className={cn(
                      "grid gap-3 bg-[color:var(--panel-muted)] px-4 py-4 text-left transition",
                      index === selectedIndex &&
                        "bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--panel-muted))]",
                    )}
                    onMouseEnter={() => {
                      onChangeSelectedIndex(index);
                    }}
                    onClick={() => {
                      onSelectCommand(item.commandText);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm text-[color:var(--text-primary)]">
                          {item.commandText}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                          <span>{item.cwd}</span>
                          <span>{formatAbsoluteTimestamp(item.startedAt)}</span>
                          <span>{formatDuration(item.durationMs)}</span>
                          <span>exit {item.exitCode ?? "?"}</span>
                        </div>
                      </div>
                      {item.cwdMatch ? (
                        <span className="border border-[color:var(--accent)] px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-[color:var(--accent)]">
                          cwd
                        </span>
                      ) : null}
                    </div>
                    {item.outputPreview ? (
                      <pre className="m-0 whitespace-pre-wrap font-mono text-xs leading-6 text-[color:var(--text-secondary)]">
                        {item.outputPreview}
                      </pre>
                    ) : null}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        <div className="flex min-h-0 flex-col gap-3 border border-[color:var(--border)] bg-black/20 p-4 text-sm text-[color:var(--text-secondary)] lg:h-[min(58vh,720px)]">
          <p className="font-display text-sm uppercase tracking-[0.24em] text-[color:var(--text-primary)]">
            Selected Row
          </p>
          {selectedResult ? (
            <>
              <div className="shrink-0 border border-[color:var(--border)] bg-[color:var(--panel-muted)] px-4 py-3">
                <p className="font-mono text-sm text-[color:var(--text-primary)]">
                  {selectedResult.commandText}
                </p>
                <div className="mt-3 grid gap-2 text-xs text-[color:var(--text-secondary)]">
                  <span>cwd: {selectedResult.cwd}</span>
                  <span>ran: {formatAbsoluteTimestamp(selectedResult.startedAt)}</span>
                  <span>duration: {formatDuration(selectedResult.durationMs)}</span>
                  <span>exit: {selectedResult.exitCode ?? "?"}</span>
                  <span>shell: {selectedResult.shell}</span>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col border border-[color:var(--border)] bg-[color:var(--panel-muted)]">
                <div className="shrink-0 border-b border-[color:var(--border)] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    Output Preview
                  </p>
                </div>
                <ScrollArea className="min-h-0 flex-1">
                  <pre className="m-0 whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-6 text-[color:var(--text-secondary)]">
                    {selectedResult.outputPreview || "No output preview stored."}
                  </pre>
                </ScrollArea>
              </div>
              <Button
                variant="accent"
                className="w-full shrink-0"
                onClick={() => {
                  onSelectCommand(selectedResult.commandText);
                }}
              >
                Reuse Command
              </Button>
            </>
          ) : (
            <div className="flex min-h-0 flex-1 items-center border border-[color:var(--border)] bg-[color:var(--panel-muted)] px-4 py-3">
              <p>No result selected yet.</p>
            </div>
          )}
          <div className="shrink-0 border border-[color:var(--border)] bg-[color:var(--panel-muted)] px-4 py-3 text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
            <div className="flex items-center justify-between gap-3">
              <span>Current cwd</span>
              <span className="truncate text-right">{currentCwd}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span>Keyboard</span>
              <span className="text-right">up/down + enter</span>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

function StatusPill({ status }: { status: CommandExecution["status"] }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-[color:var(--border-strong)] px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[color:var(--accent)]">
        <span className="h-1.5 w-1.5 animate-pulse bg-[color:var(--accent)]" />
        running
      </span>
    );
  }

  if (status === "succeeded") {
    return (
      <span className="inline-flex items-center gap-1.5 border border-emerald-400/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-emerald-200">
        <Check className="h-3 w-3" />
        success
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 border border-amber-400/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.18em] text-amber-200">
      <TriangleAlert className="h-3 w-3" />
      failed
    </span>
  );
}

function renderHighlightedCommand(value: string) {
  return value.split("\n").map((line, lineIndex) => (
    <Fragment key={`line-${lineIndex}`}>
      {tokenizeLine(line).map((token, tokenIndex) => (
        <span
          key={`token-${lineIndex}-${tokenIndex}`}
          className={token.className}
        >
          {token.value}
        </span>
      ))}
      {lineIndex < value.split("\n").length - 1 ? "\n" : null}
    </Fragment>
  ));
}

function tokenizeLine(line: string) {
  const tokens = line.match(
    /(\s+|&&|\|\||[|;<>]+|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*|#[^\n]*|[^\s|;&<>]+)/g,
  ) ?? [line];

  let commandAssigned = false;

  return tokens.map((token) => {
    if (/^\s+$/.test(token)) {
      return { value: token, className: "" };
    }

    if (token.startsWith("#")) {
      return { value: token, className: "text-[color:var(--text-muted)]" };
    }

    if (/^(?:&&|\|\||[|;<>]+)$/.test(token)) {
      commandAssigned = false;
      return { value: token, className: "text-fuchsia-200" };
    }

    if (/^['"]/.test(token)) {
      return { value: token, className: "text-emerald-200" };
    }

    if (token.startsWith("$")) {
      return { value: token, className: "text-cyan-200" };
    }

    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token) && !commandAssigned) {
      return { value: token, className: "text-amber-200" };
    }

    if (/^-{1,2}[A-Za-z0-9-]+/.test(token)) {
      return { value: token, className: "text-sky-200" };
    }

    if (!commandAssigned) {
      commandAssigned = true;
      return { value: token, className: "text-[color:var(--text-primary)]" };
    }

    return { value: token, className: "text-[color:var(--text-secondary)]" };
  });
}

function clampIndex(index: number, length: number) {
  if (length <= 0) {
    return 0;
  }

  if (index < 0) {
    return 0;
  }

  if (index >= length) {
    return length - 1;
  }

  return index;
}

function getFloatingSuggestionAnchor(
  textarea: HTMLTextAreaElement,
  container: HTMLDivElement,
): FloatingSuggestionAnchor | null {
  const caret = measureTextareaCaret(textarea);

  if (!caret) {
    return null;
  }

  const gutter = 12;
  const width = Math.min(380, Math.max(220, container.clientWidth - gutter * 2));
  const left = clampNumber(
    caret.left + 10,
    gutter,
    Math.max(gutter, container.clientWidth - width - gutter),
  );

  return {
    bottom: Math.max(18, container.clientHeight - caret.top + 10),
    left,
    width,
  };
}

function measureTextareaCaret(textarea: HTMLTextAreaElement) {
  if (typeof window === "undefined") {
    return null;
  }

  const style = window.getComputedStyle(textarea);
  const mirror = document.createElement("div");
  const marker = document.createElement("span");
  const before = textarea.value.slice(0, textarea.selectionStart);

  mirror.style.position = "absolute";
  mirror.style.top = "0";
  mirror.style.left = "-9999px";
  mirror.style.visibility = "hidden";
  mirror.style.pointerEvents = "none";
  mirror.style.whiteSpace = "pre-wrap";
  mirror.style.overflowWrap = "break-word";
  mirror.style.wordBreak = "break-word";
  mirror.style.boxSizing = style.boxSizing;
  mirror.style.width = `${textarea.clientWidth}px`;
  mirror.style.padding = style.padding;
  mirror.style.border = style.border;
  mirror.style.font = style.font;
  mirror.style.fontKerning = style.fontKerning;
  mirror.style.letterSpacing = style.letterSpacing;
  mirror.style.lineHeight = style.lineHeight;
  mirror.style.tabSize = style.tabSize;
  mirror.style.textTransform = style.textTransform;
  mirror.style.textIndent = style.textIndent;

  mirror.textContent = before.endsWith("\n") ? `${before}\u200b` : before;
  marker.textContent =
    textarea.value.slice(textarea.selectionStart, textarea.selectionStart + 1) ||
    "\u200b";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);

  const mirrorRect = mirror.getBoundingClientRect();
  const markerRect = marker.getBoundingClientRect();

  mirror.remove();

  return {
    left: markerRect.left - mirrorRect.left - textarea.scrollLeft,
    top: markerRect.top - mirrorRect.top - textarea.scrollTop,
  };
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function mergeCommandCompletionItems(
  currentItems: CommandCompletionItem[],
  nextItems: CommandCompletionItem[],
): CommandCompletionItem[] {
  const merged = new Map<string, CommandCompletionItem>();

  for (const item of currentItems) {
    merged.set(`${item.kind}:${item.label}:${item.nextValue}:${item.source}`, item);
  }

  for (const item of nextItems) {
    merged.set(`${item.kind}:${item.label}:${item.nextValue}:${item.source}`, item);
  }

  return [...merged.values()];
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) {
    return "running";
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(durationMs < 10_000 ? 2 : 1)}s`;
}

function formatAbsoluteTimestamp(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelativeTime(value: string) {
  const elapsed = Date.now() - Date.parse(value);

  if (elapsed < 60_000) {
    return "just now";
  }

  if (elapsed < 3_600_000) {
    return `${Math.round(elapsed / 60_000)}m ago`;
  }

  if (elapsed < 86_400_000) {
    return `${Math.round(elapsed / 3_600_000)}h ago`;
  }

  return formatAbsoluteTimestamp(value);
}

function isCursorOnFirstLine(textarea: HTMLTextAreaElement) {
  const cursor = Math.min(textarea.selectionStart, textarea.selectionEnd);
  return !textarea.value.slice(0, cursor).includes("\n");
}

function normalizeOutput(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function buildPreview(output: string) {
  const normalized = output.trim();

  if (!normalized) {
    return "";
  }

  const lines = normalized.split("\n").slice(0, 8);
  const preview = lines.join("\n");

  if (normalized.length <= 640 && lines.length === normalized.split("\n").length) {
    return preview;
  }

  return `${preview.slice(0, 640).trimEnd()}\n…`;
}
