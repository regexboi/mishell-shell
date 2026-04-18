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
  theme,
}: {
  executionId: string;
  onInput: (data: string) => void;
  onReady: (controller: TerminalModeSurfaceController | null) => void;
  onResize: (size: { cols: number; rows: number }) => void;
  theme: {
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
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let cleanup = () => {};

    async function mountTerminal() {
      try {
        setLoadError(null);
        hostRef.current?.replaceChildren();

        const ghostty = await import("ghostty-web");

        await ghostty.init();

        if (disposed || !hostRef.current) {
          return;
        }

        const terminal = new ghostty.Terminal({
          allowTransparency: true,
          cursorBlink: true,
          cursorStyle: "block",
          fontFamily:
            '"JetBrains Mono NF", "JetBrainsMono Nerd Font Mono", "JetBrains Mono", monospace',
          fontSize: 14,
          theme,
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
  }, [executionId, onInput, onReady, onResize, theme]);

  return (
    <div className="relative h-full min-h-0 bg-[color:var(--bg)]">
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
