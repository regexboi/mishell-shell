import { useEffect, useState } from "react";
import {
  Command,
  Database,
  FolderTree,
  History,
  LayoutPanelTop,
  TerminalSquare,
} from "lucide-react";

import type { BootstrapPayload, ShellSurface } from "@shared/contracts";

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
import { cn } from "@/lib/utils";

const commandCardPlaceholders = [
  {
    command: "pnpm dev",
    tone: "warmup",
    output:
      "Renderer and Electron dev loops will stream into structured cards in Phase 2.",
  },
  {
    command: "git status --short",
    tone: "status",
    output: "PTY-backed execution, duration capture, and exit codes land next.",
  },
];

const historyPreview = [
  { command: "pnpm build", cwd: "~/mishell-shell", duration: "1.8s", code: 0 },
  {
    command: "git status --short",
    cwd: "~/mishell-shell",
    duration: "0.1s",
    code: 0,
  },
  { command: "lazygit", cwd: "~/mishell-shell", duration: "interactive", code: 130 },
];

export function ShellScaffold({ bootstrap }: { bootstrap: BootstrapPayload }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const highlightedSurface = bootstrap.surfaces.find(
    (surface) => surface.id === bootstrap.focusMode.defaultSurface,
  );
  const isBrowserPreview = bootstrap.platform === "browser-preview";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
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
      setHistoryOpen(true);
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[color:var(--bg)] text-[color:var(--text-primary)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(201,123,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(80,20,120,0.32),transparent_34%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative mx-auto flex min-h-screen max-w-[1680px] flex-col px-4 py-4 sm:px-6 lg:px-8">
        <header className="border border-[color:var(--border-strong)] bg-[color:var(--panel)] px-4 py-4 shadow-[0_0_0_1px_rgba(195,115,255,0.08),0_24px_72px_rgba(0,0,0,0.34)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.34em] text-[color:var(--text-muted)]">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 bg-[color:var(--accent)]" />
                  Phase 01 Foundation
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
                <p className="max-w-2xl text-sm text-[color:var(--text-secondary)] sm:text-base">
                  Custom shell chrome first, raw terminal second. This foundation
                  keeps execution, history, and TUI fallback isolated behind typed
                  Electron boundaries.
                </p>
                {isBrowserPreview ? (
                  <p className="max-w-2xl text-xs uppercase tracking-[0.22em] text-[color:var(--accent)]">
                    Preview fallback active. The real Electron window should show a
                    platform like darwin/arm64 here.
                  </p>
                ) : null}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Shell" value={bootstrap.shell.executable} icon={Command} />
              <Metric
                label="SQLite"
                value={bootstrap.database.appliedMigrations.join(", ")}
                icon={Database}
              />
              <Metric
                label="Focus"
                value={highlightedSurface?.label ?? "Editor"}
                icon={LayoutPanelTop}
              />
            </div>
          </div>
        </header>

        <div className="mt-4 grid flex-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
          <aside className="border border-[color:var(--border)] bg-[color:var(--panel-muted)]">
            <div className="border-b border-[color:var(--border)] px-4 py-3">
              <p className="font-display text-sm uppercase tracking-[0.28em]">Surfaces</p>
              <p className="mt-1 text-xs text-[color:var(--text-muted)]">
                Keyboard-first scaffolding
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
                action={<Button variant="accent">Capture Enter</Button>}
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                    <span className="border border-[color:var(--border-strong)] px-2 py-1 text-[color:var(--accent)]">
                      Free cursor placement
                    </span>
                    <span>Syntax highlighting</span>
                    <span>CWD-aware recall</span>
                  </div>
                  <div className="border border-[color:var(--border-strong)] bg-[linear-gradient(180deg,rgba(18,18,25,0.82),rgba(10,10,16,0.96))]">
                    <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3 text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                      <span className="flex items-center gap-2">
                        <FolderTree className="h-3.5 w-3.5 text-[color:var(--accent)]" />
                        {bootstrap.shell.cwd}
                      </span>
                      <span>Git branch and shell context arrive here</span>
                    </div>
                    <div className="space-y-4 px-4 py-5 font-mono text-sm leading-7 text-[color:var(--text-secondary)]">
                      <div className="flex gap-3">
                        <span className="text-[color:var(--accent)]">01</span>
                        <span className="text-[color:var(--text-primary)]">run</span>
                        <span>a command without dropping into raw terminal scrollback</span>
                      </div>
                      <div className="flex gap-3">
                        <span className="text-[color:var(--accent)]">02</span>
                        <span>
                          inline history completion and editor semantics land in
                          the next phases
                        </span>
                      </div>
                      <div className="flex items-center gap-3 border-t border-[color:var(--border)] pt-4">
                        <span className="text-[color:var(--accent)]">mishell</span>
                        <span className="text-[color:var(--text-primary)]">
                          git status --short
                        </span>
                        <span className="h-5 w-2 animate-pulse bg-[color:var(--accent)]" />
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>

              <Panel
                icon={TerminalSquare}
                title="Terminal Compatibility"
                kicker="Fallback surface"
              >
                <div className="flex h-full flex-col justify-between gap-6">
                  <div className="space-y-3 text-sm text-[color:var(--text-secondary)]">
                    <p>
                      `ghostty-web` is reserved for full-screen TUIs. The default
                      shell stays custom and card-based.
                    </p>
                    <p>
                      Phase 4 wires TUI detection, terminal surface mounting, and
                      escape back to the editor workflow.
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
                kicker="Card canvas"
              >
                <div className="grid gap-3">
                  {commandCardPlaceholders.map((item, index) => (
                    <article
                      key={item.command}
                      className="border border-[color:var(--border)] bg-[color:var(--panel-muted)] p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-mono text-sm text-[color:var(--text-primary)]">
                            {item.command}
                          </p>
                          <p className="mt-2 text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                            Placeholder card {index + 1}
                          </p>
                        </div>
                        <span className="border border-[color:var(--border-strong)] px-2 py-1 text-[11px] uppercase tracking-[0.28em] text-[color:var(--accent)]">
                          {item.tone}
                        </span>
                      </div>
                      <p className="mt-4 text-sm leading-6 text-[color:var(--text-secondary)]">
                        {item.output}
                      </p>
                    </article>
                  ))}
                </div>
              </Panel>

              <Panel
                icon={History}
                title="Recall"
                kicker="Phase 3 foundation"
                action={
                  <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                    <DialogTrigger asChild>
                      <Button variant="ghost" size="sm">
                        Open Cmd/Ctrl+R
                      </Button>
                    </DialogTrigger>
                    <HistorySearchDialog />
                  </Dialog>
                }
              >
                <div className="space-y-4 text-sm text-[color:var(--text-secondary)]">
                  <p>
                    SQLite is initialized in Electron main. Query and ranking UI are
                    still placeholders, but the storage boundary and migration path
                    are ready.
                  </p>
                  <div className="grid gap-2 text-xs uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
                    <div className="flex items-center justify-between border border-[color:var(--border)] px-3 py-2">
                      <span>History Search</span>
                      <span>planned</span>
                    </div>
                    <div className="flex items-center justify-between border border-[color:var(--border)] px-3 py-2">
                      <span>Autocomplete</span>
                      <span>planned</span>
                    </div>
                    <div className="flex items-center justify-between border border-[color:var(--border)] px-3 py-2">
                      <span>TUI Fallback</span>
                      <span>standby</span>
                    </div>
                  </div>
                </div>
              </Panel>
            </section>
          </main>

          <aside className="grid gap-4">
            <Panel icon={Database} title="Architecture" kicker="Typed boundaries">
              <div className="space-y-4 text-sm text-[color:var(--text-secondary)]">
                <ArchitectureItem
                  label="Main"
                  description="Window lifecycle, SQLite bootstrap, and future PTY ownership live in Electron main."
                />
                <ArchitectureItem
                  label="Preload"
                  description="A narrow window.mishell bridge exposes only validated bootstrap data to the renderer."
                />
                <ArchitectureItem
                  label="Renderer"
                  description="TanStack Router and Query own the UI shell so later phases can add async execution and recall cleanly."
                />
              </div>
            </Panel>

            <Panel icon={History} title="Manual Test Markers" kicker="Visible now">
              <ul className="space-y-3 text-sm text-[color:var(--text-secondary)]">
                <li>Launch the app and verify the editor scaffold occupies the primary viewport.</li>
                <li>Open the history dialog and confirm placeholder metadata rows render.</li>
                <li>Check the shell, database, and focus metrics in the header.</li>
              </ul>
            </Panel>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title,
  kicker,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  kicker: string;
  icon: typeof Command;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-[color:var(--border)] bg-[color:var(--panel)]">
      <header className="flex items-start justify-between gap-4 border-b border-[color:var(--border)] px-4 py-4">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--text-muted)]">
            {kicker}
          </p>
          <div className="flex items-center gap-3">
            <Icon className="h-4 w-4 text-[color:var(--accent)]" />
            <h2 className="font-display text-lg uppercase tracking-[0.18em]">{title}</h2>
          </div>
        </div>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
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
      <p className="mt-2 font-mono text-sm text-[color:var(--text-primary)]">{value}</p>
    </div>
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
        "border-b border-[color:var(--border)] px-4 py-4 transition",
        active && "bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-sm uppercase tracking-[0.22em] text-[color:var(--text-primary)]">
            {surface.label}
          </p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--text-secondary)]">
            {surface.description}
          </p>
        </div>
        <span className="border border-[color:var(--border-strong)] px-2 py-1 text-[10px] uppercase tracking-[0.24em] text-[color:var(--accent)]">
          {surface.status}
        </span>
      </div>
      {surface.shortcut ? (
        <p className="mt-3 text-[11px] uppercase tracking-[0.28em] text-[color:var(--text-muted)]">
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
    <div className="border border-[color:var(--border)] p-3">
      <p className="font-display text-sm uppercase tracking-[0.22em] text-[color:var(--text-primary)]">
        {label}
      </p>
      <p className="mt-2 leading-6">{description}</p>
    </div>
  );
}

function HistorySearchDialog() {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>History Search</DialogTitle>
        <DialogDescription>
          Placeholder modal for the Phase 3 global recall flow. The renderer shape
          is visible now so richer SQLite-backed search can land without UI churn.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-6 grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-4 border border-[color:var(--border)] bg-[color:var(--panel-muted)] p-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--text-muted)]">
              Filters
            </p>
            <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
              cwd, duration, exit code, shell session, semantic ranking
            </p>
          </div>
          <div className="border border-[color:var(--border)] px-3 py-2 font-mono text-sm text-[color:var(--text-primary)]">
            &gt; git st
          </div>
          <p className="text-xs uppercase tracking-[0.28em] text-[color:var(--accent)]">
            Cmd/Ctrl+R reserved
          </p>
        </div>
        <ScrollArea className="h-[360px] border border-[color:var(--border)] bg-[color:var(--panel-muted)]">
          <div className="divide-y divide-[color:var(--border)]">
            {historyPreview.map((entry) => (
              <div key={`${entry.command}-${entry.cwd}`} className="grid gap-2 p-4">
                <p className="font-mono text-sm text-[color:var(--text-primary)]">
                  {entry.command}
                </p>
                <div className="flex flex-wrap gap-3 text-[11px] uppercase tracking-[0.24em] text-[color:var(--text-muted)]">
                  <span>{entry.cwd}</span>
                  <span>{entry.duration}</span>
                  <span>exit {entry.code}</span>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>
    </DialogContent>
  );
}
