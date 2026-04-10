import { useEffect, useRef, useState } from "react";

export type TerminalModeSurfaceController = {
  clear: () => void;
  focus: () => void;
  write: (chunk: string) => void;
};

export function TerminalModeSurface({
  executionId,
  onInput,
  onReady,
  onResize,
}: {
  executionId: string;
  onInput: (data: string) => void;
  onReady: (controller: TerminalModeSurfaceController | null) => void;
  onResize: (size: { cols: number; rows: number }) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    async function mountTerminal() {
      try {
        const ghostty = await import("ghostty-web");

        await ghostty.init();

        if (disposed || !hostRef.current) {
          return;
        }

        const terminal = new ghostty.Terminal({
          allowTransparency: true,
          cursorBlink: true,
          cursorStyle: "block",
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 14,
          theme: {
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
        });
        const fitAddon = new ghostty.FitAddon();
        const resizeDisposable = terminal.onResize(({ cols, rows }) => {
          onResize({ cols, rows });
        });
        const inputDisposable = terminal.onData((data) => {
          onInput(data);
        });

        terminal.loadAddon(fitAddon);
        terminal.open(hostRef.current);
        fitAddon.fit();
        fitAddon.observeResize();
        terminal.focus();

        onReady({
          clear: () => terminal.clear(),
          focus: () => terminal.focus(),
          write: (chunk) => terminal.write(chunk),
        });
        onResize({ cols: terminal.cols, rows: terminal.rows });

        cleanup = () => {
          inputDisposable.dispose();
          resizeDisposable.dispose();
          fitAddon.dispose();
          terminal.dispose();
          onReady(null);
          hostRef.current?.replaceChildren();
        };
      } catch (error) {
        if (disposed) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : "Mishell could not initialize terminal mode.",
        );
        onReady(null);
      }
    }

    void mountTerminal();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [executionId, onInput, onReady, onResize]);

  return (
    <div className="relative h-full min-h-[420px] border border-[color:var(--border-strong)] bg-[#05050a]">
      <div ref={hostRef} className="h-full w-full overflow-hidden" />
      {loadError ? (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-amber-100">
          <div className="border border-amber-400/40 bg-amber-400/10 px-4 py-3">
            Terminal mode failed to initialize: {loadError}
          </div>
        </div>
      ) : null}
    </div>
  );
}
