import {
  Fragment,
  startTransition,
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Binary,
  Check,
  Clipboard,
  Command,
  Database,
  FolderTree,
  GitBranch,
  History,
  LayoutPanelTop,
  Search,
  TerminalSquare,
  Timer,
  TriangleAlert,
} from "lucide-react";

import type {
  BootstrapPayload,
  CommandExecution,
  ExecutionEvent,
  HistoryAutocompleteItem,
  HistoryEntry,
  HistoryRecallItem,
  ShellContext,
  ShellSurface,
} from "@shared/contracts";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getMishellApi } from "@/lib/mishell-api";
import { cn } from "@/lib/utils";

const exampleCommands = ["pwd", "git status --short", "pnpm check", "ls -la"];

type RecallSession = {
  cwd: string;
  originalDraft: string;
  items: HistoryRecallItem[];
  index: number;
};

export function ShellScaffold({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const api = getMishellApi();
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const historySearchInputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRequestRef = useRef(0);
  const historySearchRequestRef = useRef(0);
  const historyRecallRequestRef = useRef(0);
  const recallSessionRef = useRef<RecallSession | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [shellContext, setShellContext] = useState<ShellContext>(bootstrap.shell);
  const [draft, setDraft] = useState("pwd");
  const [executions, setExecutions] = useState<CommandExecution[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copyToast, setCopyToast] = useState<string | null>(null);
  const [autocompleteItems, setAutocompleteItems] = useState<
    HistoryAutocompleteItem[]
  >([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyResults, setHistoryResults] = useState<HistoryEntry[]>([]);
  const [historySelectedIndex, setHistorySelectedIndex] = useState(0);
  const [historySearchPending, setHistorySearchPending] = useState(false);
  const [historySearchError, setHistorySearchError] = useState<string | null>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [fullOutputExecutionId, setFullOutputExecutionId] = useState<string | null>(
    null,
  );
  const deferredDraft = useDeferredValue(draft);
  const deferredHistoryQuery = useDeferredValue(historyQuery);
  const isBrowserPreview = bootstrap.platform === "browser-preview";
  const hasRunningExecution = executions.some(
    (execution) => execution.status === "running",
  );
  const latestExecution = executions[0] ?? null;
  const highlightedSurface = bootstrap.surfaces.find(
    (surface) => surface.id === bootstrap.focusMode.defaultSurface,
  );
  const fullOutputExecution = fullOutputExecutionId
    ? executions.find((execution) => execution.id === fullOutputExecutionId) ?? null
    : null;
  const autocompleteVisible =
    autocompleteItems.length > 0 && recallSessionRef.current === null;
  const selectedAutocomplete =
    autocompleteItems[autocompleteIndex] ?? autocompleteItems[0] ?? null;

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

  const setDraftValue = useEffectEvent(
    (nextValue: string, source: "history" | "system" | "user" = "user") => {
      if (source === "user") {
        recallSessionRef.current = null;
      }

      if (source !== "history") {
        setHistoryOpen(false);
      }

      setDraft(nextValue);
    },
  );

  const applyAutocompleteSelection = useEffectEvent((commandText: string) => {
    recallSessionRef.current = null;
    setDraftValue(commandText, "system");
    setAutocompleteIndex(0);
    focusEditorAtEnd();
  });

  const applyHistoryResult = useEffectEvent((commandText: string) => {
    recallSessionRef.current = null;
    setDraftValue(commandText, "history");
    setHistoryOpen(false);
    setAutocompleteItems([]);
    setAutocompleteIndex(0);
    focusEditorAtEnd();
  });

  const handleExecutionEvent = useEffectEvent((event: ExecutionEvent) => {
    if (event.type === "started") {
      setExecutions((current) => [event.execution, ...current]);
      return;
    }

    if (event.type === "output") {
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

  useEffect(() => {
    const unsubscribe = api.app.onExecutionEvent((event) => {
      handleExecutionEvent(event);
    });

    return unsubscribe;
  }, [api, handleExecutionEvent]);

  const handleHistoryShortcut = useEffectEvent((event: KeyboardEvent) => {
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

    editorRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleHistoryShortcut, {
        capture: true,
      });
    };
  }, [handleHistoryShortcut]);

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
    if (!historyOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      historySearchInputRef.current?.focus();
      historySearchInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [historyOpen]);

  useEffect(() => {
    const normalizedDraft = deferredDraft.trim();

    if (!normalizedDraft) {
      setAutocompleteItems([]);
      setAutocompleteIndex(0);
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
          setAutocompleteIndex(0);
        });
      })
      .catch(() => {
        if (autocompleteRequestRef.current !== requestId) {
          return;
        }

        setAutocompleteItems([]);
        setAutocompleteIndex(0);
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

  const submitCommand = useEffectEvent(async () => {
    const commandText = draft.trim();

    if (!commandText || hasRunningExecution || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    recallSessionRef.current = null;
    setAutocompleteItems([]);
    setAutocompleteIndex(0);
    setDraft("");

    try {
      await api.app.runCommand({ commandText });
    } catch (error) {
      const startedAt = new Date().toISOString();

      setExecutions((current) => [
        {
          id: `local-error-${startedAt}`,
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
      editorRef.current?.focus();
    }
  });

  const navigateAutocomplete = useEffectEvent((direction: "next" | "prev") => {
    if (!autocompleteVisible) {
      return false;
    }

    setAutocompleteIndex((current) => {
      const nextIndex =
        direction === "next"
          ? current + 1
          : current <= 0
            ? autocompleteItems.length - 1
            : current - 1;

      return clampIndex(nextIndex, autocompleteItems.length);
    });

    return true;
  });

  const acceptAutocomplete = useEffectEvent(() => {
    if (!selectedAutocomplete) {
      return false;
    }

    applyAutocompleteSelection(selectedAutocomplete.commandText);
    return true;
  });

  const navigateRecallHistory = useEffectEvent(
    async (direction: "back" | "forward") => {
      const applyRecallSelection = (session: RecallSession, index: number) => {
        if (index < 0) {
          recallSessionRef.current = null;
          setDraftValue(session.originalDraft, "system");
          focusEditorAtEnd();
          return;
        }

        const nextIndex = Math.min(index, session.items.length - 1);
        const nextSession = {
          ...session,
          index: nextIndex,
        };

        recallSessionRef.current = nextSession;
        setDraftValue(nextSession.items[nextIndex]!.commandText, "system");
        focusEditorAtEnd();
      };

      const activeSession = recallSessionRef.current;

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

        applyRecallSelection(
          {
            cwd: shellContext.cwd,
            originalDraft: draft,
            items,
            index: 0,
          },
          0,
        );
        return;
      }

      if (direction === "back") {
        applyRecallSelection(activeSession, activeSession.index + 1);
        return;
      }

      applyRecallSelection(activeSession, activeSession.index - 1);
    },
  );

  const handleEditorKeyDown = useEffectEvent(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        event.key === "ArrowDown" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        autocompleteVisible
      ) {
        event.preventDefault();
        navigateAutocomplete("next");
        return true;
      }

      if (
        event.key === "Tab" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        autocompleteVisible
      ) {
        event.preventDefault();
        acceptAutocomplete();
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

      if (
        event.key === "ArrowDown" &&
        !event.shiftKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        recallSessionRef.current !== null
      ) {
        event.preventDefault();
        void navigateRecallHistory("forward");
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

  const executionCountLabel = useMemo(() => {
    if (executions.length === 0) {
      return "No cards yet";
    }

    return `${executions.length} card${executions.length === 1 ? "" : "s"}`;
  }, [executions.length]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[color:var(--bg)] text-[color:var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,123,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(80,20,120,0.32),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1680px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="border border-[color:var(--border-strong)] bg-[color:var(--panel)] px-4 py-4 shadow-[0_0_0_1px_rgba(195,115,255,0.08),0_24px_72px_rgba(0,0,0,0.34)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-[0.34em] text-[color:var(--text-muted)]">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 bg-[color:var(--accent)]" />
                  Phase 03 History Search
                </span>
                <span>{bootstrap.platform}</span>
                {isBrowserPreview ? (
                  <span className="border border-[color:var(--border-strong)] px-2 py-1 text-[color:var(--accent)]">
                    Browser only
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
                <h1 className="font-display text-4xl uppercase tracking-[0.26em] sm:text-5xl">
                  {bootstrap.appName}
                </h1>
                <p className="max-w-3xl text-sm text-[color:var(--text-secondary)] sm:text-base">
                  The default shell surface now reuses persisted command history
                  for autocomplete, cwd-scoped arrow recall, and searchable
                  command recovery without exposing raw terminal scrollback.
                </p>
                {isBrowserPreview ? (
                  <p className="max-w-2xl text-xs uppercase tracking-[0.22em] text-[color:var(--accent)]">
                    Preview fallback active. Launch the Electron window for the
                    actual `node-pty` execution path.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <Metric label="Shell" value={shellContext.shellName} icon={Command} />
              <Metric
                label="Branch"
                value={shellContext.gitBranch ?? "No repo"}
                icon={GitBranch}
              />
              <Metric label="Cards" value={executionCountLabel} icon={LayoutPanelTop} />
              <Metric
                label="Focus"
                value={highlightedSurface?.label ?? "Editor"}
                icon={Database}
              />
            </div>
          </div>
        </header>

        <div className="mt-4 grid flex-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
          <aside className="border border-[color:var(--border)] bg-[color:var(--panel-muted)]">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <p className="font-display text-sm uppercase tracking-[0.28em]">Surfaces</p>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                Default shell remains custom
              </p>
            </div>
            <nav className="flex flex-col">
              {bootstrap.surfaces.map((surface) => (
                <SurfaceRow
                  key={surface.id}
                  surface={surface}
                  active={surface.id === bootstrap.focusMode.defaultSurface}
                />
              ))}
            </nav>
            <Separator />
            <div className="space-y-3 px-4 py-4 text-xs text-[color:var(--text-secondary)]">
              <div className="flex items-center justify-between gap-3">
                <span>DB Path</span>
                <span className="truncate text-right text-[color:var(--text-muted)]">
                  {bootstrap.database.path}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Session</span>
                <span className="text-[color:var(--text-muted)]">
                  {shellContext.sessionId.slice(0, 8)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Launch</span>
                <span className="text-[color:var(--text-muted)]">
                  {new Date(bootstrap.release.launchedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </aside>

          <main className="grid gap-4">
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
              <Panel
                icon={Command}
                title="Shell Editor"
                kicker="Default surface"
                action={
                  <Button
                    variant="accent"
                    disabled={hasRunningExecution || isSubmitting || !draft.trim()}
                    onClick={() => {
                      void submitCommand();
                    }}
                  >
                    {hasRunningExecution || isSubmitting ? "Running" : "Run Enter"}
                  </Button>
                }
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                    <span className="border border-[color:var(--border-strong)] px-2 py-1 text-[color:var(--accent)]">
                      PTY-backed
                    </span>
                    <span>Free cursor placement</span>
                    <span>Autocomplete from SQLite</span>
                    <span>Up arrow = cwd recall</span>
                    <span>Shift+Enter for newline</span>
                  </div>
                  <div className="border border-[color:var(--border-strong)] bg-[linear-gradient(180deg,rgba(18,18,25,0.82),rgba(10,10,16,0.96))]">
                    <ShellHeader shellContext={shellContext} latestExecution={latestExecution} />
                    <ShellEditor
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
                  <AutocompleteRail
                    items={autocompleteItems}
                    selectedIndex={autocompleteIndex}
                    visible={autocompleteVisible}
                    onSelect={applyAutocompleteSelection}
                  />
                  <div className="flex flex-wrap gap-2">
                    {exampleCommands.map((commandText) => (
                      <Button
                        key={commandText}
                        variant="ghost"
                        size="sm"
                        disabled={hasRunningExecution || isSubmitting}
                        onClick={() => {
                          applyAutocompleteSelection(commandText);
                        }}
                      >
                        {commandText}
                      </Button>
                    ))}
                  </div>
                </div>
              </Panel>

              <Panel
                icon={TerminalSquare}
                title="Terminal Compatibility"
                kicker="Phase 4 fallback"
              >
                <div className="flex h-full flex-col justify-between gap-6">
                  <div className="space-y-3 text-sm text-[color:var(--text-secondary)]">
                    <p>
                      Normal execution stays in cards. The raw terminal surface is
                      still reserved for full-screen TUIs and other cases where the
                      custom editor should yield to `ghostty-web`.
                    </p>
                    <p>
                      Phase 4 must respect the current command-card pipeline and only
                      switch modes for interactive sessions that genuinely need it.
                    </p>
                  </div>
                  <div className="border border-[color:var(--border)] bg-black/30 p-4 font-mono text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                    standby / compatibility layer / not primary chrome
                  </div>
                </div>
              </Panel>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
              <Panel
                icon={LayoutPanelTop}
                title="Command Feed"
                kicker="Structured result cards"
              >
                {executions.length === 0 ? (
                  <div className="border border-dashed border-[color:var(--border)] bg-[color:var(--panel-muted)] px-5 py-6 text-sm text-[color:var(--text-secondary)]">
                    Run a command above to create the first card. Try `pwd`,
                    `git status --short`, and a failing command like `false` or
                    `missing-command` to verify success and error flows.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {executions.map((execution) => (
                      <CommandCard
                        key={execution.id}
                        execution={execution}
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
                )}
              </Panel>

              <Panel
                icon={History}
                title="Recall"
                kicker="History online"
                action={
                  <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setHistoryQuery(draft.trim());
                          setHistorySelectedIndex(0);
                        }}
                      >
                        Open Cmd/Ctrl+R
                      </Button>
                    </DialogTrigger>
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
                }
              >
                <div className="space-y-4 text-sm text-[color:var(--text-secondary)]">
                  <p>
                    History recall now runs off the persisted SQLite command store.
                    `Tab` accepts autocomplete, `ArrowUp` walks current-directory
                    history, and `Cmd/Ctrl+R` opens the global search surface.
                  </p>
                  <div className="grid gap-2 text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                    <div className="flex items-center justify-between border border-[color:var(--border)] px-3 py-2">
                      <span>Autocomplete</span>
                      <span>{autocompleteVisible ? `${autocompleteItems.length} live` : "idle"}</span>
                    </div>
                    <div className="flex items-center justify-between border border-[color:var(--border)] px-3 py-2">
                      <span>CWD Recall</span>
                      <span>{shellContext.displayCwd}</span>
                    </div>
                    <div className="flex items-center justify-between border border-[color:var(--border)] px-3 py-2">
                      <span>Global Search</span>
                      <span>{historyResults.length} rows</span>
                    </div>
                  </div>
                </div>
              </Panel>
            </section>
          </main>

          <aside className="grid gap-4">
            <Panel icon={Database} title="Execution" kicker="Typed boundaries">
              <div className="space-y-4 text-sm text-[color:var(--text-secondary)]">
                <ArchitectureItem
                  label="Main"
                  description="Electron owns shell execution, marker parsing, output-file capture, and SQLite writes."
                />
                <ArchitectureItem
                  label="Preload"
                  description="Renderer only gets a minimal bridge: bootstrap fetch, run-command invoke, execution events, and clipboard writes."
                />
                <ArchitectureItem
                  label="Renderer"
                  description="The UI stays card-based with a highlighted editor surface. No wrapped terminal scrollback is shown for normal commands."
                />
              </div>
            </Panel>

            <Panel icon={Binary} title="Current Session" kicker="Starship-lite">
              <div className="space-y-4 font-mono text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                <div className="flex items-center justify-between gap-3 border border-[color:var(--border)] px-3 py-3">
                  <span className="text-[color:var(--text-secondary)]">cwd</span>
                  <span className="truncate text-right">{shellContext.displayCwd}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border border-[color:var(--border)] px-3 py-3">
                  <span className="text-[color:var(--text-secondary)]">branch</span>
                  <span className="truncate text-right">
                    {shellContext.gitBranch ?? "no repo"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 border border-[color:var(--border)] px-3 py-3">
                  <span className="text-[color:var(--text-secondary)]">last exit</span>
                  <span className="text-right">
                    {latestExecution?.exitCode ?? (hasRunningExecution ? "…" : "n/a")}
                  </span>
                </div>
              </div>
            </Panel>
          </aside>
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
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean | void;
  onSubmit: () => void;
};

const ShellEditor = ({
  value,
  disabled,
  onChange,
  onKeyDown,
  onSubmit,
  ref,
}: ShellEditorProps & { ref: React.RefObject<HTMLTextAreaElement | null> }) => {
  const highlightRef = useRef<HTMLPreElement | null>(null);

  return (
    <div className="relative">
      <pre
        ref={highlightRef}
        aria-hidden="true"
        className="pointer-events-none min-h-[220px] overflow-hidden whitespace-pre-wrap break-words px-4 py-5 font-mono text-sm leading-7"
      >
        {value ? (
          renderHighlightedCommand(value)
        ) : (
          <span className="text-[color:var(--text-muted)]">
            Type a shell command. `Enter` runs it. `Tab` accepts history. `Shift+Enter` inserts a new line.
          </span>
        )}
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
          "absolute inset-0 min-h-[220px] w-full resize-none overflow-auto bg-transparent px-4 py-5 font-mono text-sm leading-7 outline-none",
          "text-transparent caret-[color:var(--accent)] selection:bg-[color:var(--accent-dim)]",
          disabled && "cursor-not-allowed opacity-70",
        )}
      />
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
  onCopyCommand,
  onCopyOutput,
  onCopyBoth,
  onOpenFullOutput,
}: {
  execution: CommandExecution;
  onCopyCommand: () => void;
  onCopyOutput: () => void;
  onCopyBoth: () => void;
  onOpenFullOutput: () => void;
}) {
  const displayOutput =
    execution.status === "running"
      ? execution.output || "Waiting for output…"
      : execution.outputPreview || "No output captured.";

  return (
    <article className="border border-[color:var(--border)] bg-[color:var(--panel-muted)] p-4">
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
          </div>
        </div>
        <StatusPill status={execution.status} />
      </div>

      <div className="mt-4 border border-[color:var(--border)] bg-black/20">
        <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap px-4 py-4 font-mono text-sm leading-6 text-[color:var(--text-secondary)]">
          {displayOutput}
        </pre>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onCopyCommand}>
          <Clipboard className="h-3.5 w-3.5" />
          Copy command
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!execution.output}
          onClick={onCopyOutput}
        >
          <Clipboard className="h-3.5 w-3.5" />
          Copy output
        </Button>
        <Button variant="ghost" size="sm" disabled={!execution.output} onClick={onCopyBoth}>
          <Clipboard className="h-3.5 w-3.5" />
          Copy both
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!execution.output}
          onClick={onOpenFullOutput}
        >
          Full output
        </Button>
      </div>
    </article>
  );
}

function AutocompleteRail({
  items,
  selectedIndex,
  visible,
  onSelect,
}: {
  items: HistoryAutocompleteItem[];
  selectedIndex: number;
  visible: boolean;
  onSelect: (commandText: string) => void;
}) {
  if (!visible) {
    return (
      <div className="flex items-center justify-between gap-3 border border-[color:var(--border)] bg-black/20 px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
        <span>Autocomplete idle</span>
        <span>Tab accepts when a history match exists</span>
      </div>
    );
  }

  return (
    <div className="border border-[color:var(--border)] bg-black/20">
      <div className="flex items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
        <span>{items.length} history matches</span>
        <span>tab accept / arrow down cycle / cmd+ctrl+r search</span>
      </div>
      <div className="grid gap-px bg-[color:var(--border)]">
        {items.map((item, index) => (
          <button
            key={`${item.commandText}-${item.lastStartedAt}`}
            className={cn(
              "grid gap-2 bg-[color:var(--panel-muted)] px-4 py-3 text-left transition",
              index === selectedIndex &&
                "bg-[color:color-mix(in_srgb,var(--accent)_8%,var(--panel-muted))]",
            )}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(item.commandText);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm text-[color:var(--text-primary)]">
                {item.commandText}
              </span>
              <span className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                {item.cwdMatch ? "cwd match" : formatRelativeTime(item.lastStartedAt)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--text-secondary)]">
              <span>{item.cwd}</span>
              <span>used {item.usageCount}x</span>
              <span>exit {item.lastExitCode ?? "?"}</span>
            </div>
          </button>
        ))}
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

  return (
    <DialogContent className="w-[min(94vw,1180px)]">
      <DialogHeader>
        <DialogTitle>History Search</DialogTitle>
        <DialogDescription>
          Search persisted command text and cwd metadata, then push the selected
          command back into the editor.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-3">
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
        <div className="space-y-3 border border-[color:var(--border)] bg-black/20 p-4 text-sm text-[color:var(--text-secondary)]">
          <p className="font-display text-sm uppercase tracking-[0.24em] text-[color:var(--text-primary)]">
            Selected Row
          </p>
          {selectedResult ? (
            <>
              <div className="border border-[color:var(--border)] bg-[color:var(--panel-muted)] px-4 py-3">
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
              <div className="border border-[color:var(--border)] bg-[color:var(--panel-muted)] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                  Output Preview
                </p>
                <pre className="m-0 mt-3 whitespace-pre-wrap font-mono text-xs leading-6 text-[color:var(--text-secondary)]">
                  {selectedResult.outputPreview || "No output preview stored."}
                </pre>
              </div>
              <Button
                variant="accent"
                className="w-full"
                onClick={() => {
                  onSelectCommand(selectedResult.commandText);
                }}
              >
                Reuse Command
              </Button>
            </>
          ) : (
            <p>No result selected yet.</p>
          )}
          <div className="border border-[color:var(--border)] bg-[color:var(--panel-muted)] px-4 py-3 text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
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

function Metric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Command;
}) {
  return (
    <div className="border border-[color:var(--border)] bg-[color:var(--panel-muted)] px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
        <Icon className="h-3.5 w-3.5 text-[color:var(--accent)]" />
        {label}
      </div>
      <p className="mt-2 truncate font-mono text-sm text-[color:var(--text-primary)]">
        {value}
      </p>
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  kicker,
  action,
  children,
}: {
  icon: typeof Command;
  title: string;
  kicker: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[color:var(--border)] bg-[color:var(--panel)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
            <Icon className="h-3.5 w-3.5 text-[color:var(--accent)]" />
            {kicker}
          </div>
          <h2 className="mt-2 font-display text-xl uppercase tracking-[0.16em] text-[color:var(--text-primary)]">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function SurfaceRow({
  surface,
  active,
}: {
  surface: ShellSurface;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "border-b border-[color:var(--border)] px-4 py-3 text-sm",
        active && "bg-[color:color-mix(in_srgb,var(--accent)_8%,transparent)]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-display uppercase tracking-[0.18em] text-[color:var(--text-primary)]">
          {surface.label}
        </p>
        <span
          className={cn(
            "border px-2 py-1 text-[10px] uppercase tracking-[0.24em]",
            surface.status === "active" &&
              "border-[color:var(--accent)] text-[color:var(--accent)]",
            surface.status === "ready" &&
              "border-[color:var(--border-strong)] text-[color:var(--text-secondary)]",
            surface.status === "standby" &&
              "border-[color:var(--border)] text-[color:var(--text-muted)]",
            surface.status === "planned" &&
              "border-[color:var(--border)] text-[color:var(--text-muted)]",
          )}
        >
          {surface.status}
        </span>
      </div>
      <p className="mt-2 text-xs text-[color:var(--text-secondary)]">
        {surface.description}
      </p>
      {surface.shortcut ? (
        <p className="mt-2 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
          {surface.shortcut}
        </p>
      ) : null}
    </div>
  );
}

function ArchitectureItem({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <div className="border border-[color:var(--border)] bg-black/20 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--accent)]">
        {label}
      </div>
      <p className="mt-2 leading-6">{description}</p>
    </div>
  );
}

function StatusPill({ status }: { status: CommandExecution["status"] }) {
  if (status === "running") {
    return (
      <span className="inline-flex items-center gap-2 border border-[color:var(--border-strong)] px-2 py-1 text-[11px] uppercase tracking-[0.24em] text-[color:var(--accent)]">
        <span className="h-2 w-2 animate-pulse bg-[color:var(--accent)]" />
        running
      </span>
    );
  }

  if (status === "succeeded") {
    return (
      <span className="inline-flex items-center gap-2 border border-emerald-400/40 px-2 py-1 text-[11px] uppercase tracking-[0.24em] text-emerald-200">
        <Check className="h-3.5 w-3.5" />
        success
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 border border-amber-400/40 px-2 py-1 text-[11px] uppercase tracking-[0.24em] text-amber-200">
      <TriangleAlert className="h-3.5 w-3.5" />
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
