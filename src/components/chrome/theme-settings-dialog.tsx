import type { CSSProperties } from "react";
import { Settings } from "lucide-react";

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
import {
  type MishellSurfaceId,
  type MishellThemeId,
  type MishellUiColorVar,
  PRESET_UI_VARS,
  SURFACE_OPTIONS,
  UI_THEME_VAR_KEYS,
  UI_VAR_LABELS,
  formatCssColor,
  parseCssColor,
} from "@/lib/mishell-ui-theme";
import { cn } from "@/lib/utils";

type ThemeOption = {
  id: MishellThemeId;
  label: string;
  terminalTheme: Record<string, string>;
};

function ThemeColorRow({
  token,
  value,
  onChange,
}: {
  token: MishellUiColorVar;
  value: string;
  onChange: (next: string) => void;
}) {
  const parsed = parseCssColor(value);
  const hex =
    parsed !== null
      ? formatCssColor(parsed.r, parsed.g, parsed.b, 1).slice(0, 7)
      : "#000000";
  const alphaPct = parsed !== null ? Math.round(parsed.a * 100) : 100;

  const label = UI_VAR_LABELS[token];

  const commitRgb = (nextHex: string) => {
    const rgb = parseCssColor(nextHex);
    if (!rgb) {
      return;
    }
    onChange(formatCssColor(rgb.r, rgb.g, rgb.b, parsed?.a ?? 1));
  };

  const commitAlpha = (pct: number) => {
    const rgb = parsed ?? { r: 0, g: 0, b: 0, a: 1 };
    onChange(formatCssColor(rgb.r, rgb.g, rgb.b, pct / 100));
  };

  return (
    <div className="min-w-0">
      <span className="mb-1 block truncate font-mono text-[10px] uppercase leading-snug tracking-[0.12em] text-[color:var(--text-muted)]">
        {label}
      </span>
      <input
        type="color"
        value={hex}
        onInput={(event) => {
          commitRgb(event.currentTarget.value);
        }}
        onChange={(event) => {
          commitRgb(event.currentTarget.value);
        }}
        className="h-8 w-full min-w-0 cursor-pointer overflow-hidden rounded-none border border-[color:var(--border-strong)] bg-[color:var(--panel-muted)] p-0 [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-0"
        aria-label={`${label} color`}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={alphaPct}
        onInput={(event) => {
          commitAlpha(Number(event.currentTarget.value));
        }}
        onChange={(event) => {
          commitAlpha(Number(event.currentTarget.value));
        }}
        className="mishell-theme-alpha-range mt-1.5 w-full cursor-pointer accent-[color:var(--accent)]"
        aria-label={`${label} opacity`}
      />
    </div>
  );
}

export function ThemeSettingsDialog({
  themeId,
  themeOptions,
  surfaceId,
  colorOverrides,
  triggerStyle,
  onSelectPreset,
  onSurfaceChange,
  onColorChange,
  onResetColors,
}: {
  themeId: MishellThemeId;
  themeOptions: ThemeOption[];
  surfaceId: MishellSurfaceId;
  colorOverrides: Partial<Record<MishellUiColorVar, string>>;
  triggerStyle?: CSSProperties;
  onSelectPreset: (id: MishellThemeId) => void;
  onSurfaceChange: (id: MishellSurfaceId) => void;
  onColorChange: (token: MishellUiColorVar, value: string) => void;
  onResetColors: () => void;
}) {
  const presetVars = PRESET_UI_VARS[themeId];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 shrink-0 px-0 text-[color:var(--text-muted)] hover:text-[color:var(--accent)]"
          style={triggerStyle}
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" strokeWidth={1.75} />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(94dvh,980px)] w-[min(98vw,800px)] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-[color:var(--border)] px-6 pb-4 pt-5">
          <DialogTitle className="font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-[color:var(--text-muted)]">
            Theme
          </DialogTitle>
          <DialogDescription className="sr-only">
            Theme presets, surface, and color tokens for Mishell.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 px-6 py-5">
            <div>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                Presets
              </p>
              <div className="flex flex-col gap-2">
                {themeOptions.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      onSelectPreset(theme.id);
                    }}
                    className={cn(
                      "flex items-center gap-3 border px-4 py-3.5 text-left transition-colors",
                      theme.id === themeId
                        ? "border-[color:var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)]"
                        : "border-[color:var(--border)] bg-transparent hover:border-[color:var(--border-strong)]",
                    )}
                  >
                    <span
                      className="h-4 w-4 shrink-0 border border-[color:var(--border-strong)]"
                      style={{ background: theme.terminalTheme.magenta }}
                      aria-hidden
                    />
                    <span className="font-mono text-[13px] uppercase tracking-[0.14em] text-[color:var(--text-primary)]">
                      {theme.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                Surface
              </p>
              <div className="flex flex-wrap gap-2">
                {SURFACE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onSurfaceChange(option.id);
                    }}
                    className={cn(
                      "border px-3.5 py-2 font-mono text-[11px] uppercase tracking-[0.14em] transition-colors",
                      surfaceId === option.id
                        ? "border-[color:var(--accent)] text-[color:var(--accent)]"
                        : "border-[color:var(--border)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-strong)]",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--text-muted)]">
                  Colors
                </p>
                {Object.keys(colorOverrides).length > 0 ? (
                  <button
                    type="button"
                    onClick={onResetColors}
                    className="font-mono text-[11px] uppercase tracking-[0.16em] text-[color:var(--accent)] underline-offset-2 hover:underline"
                  >
                    Reset
                  </button>
                ) : null}
              </div>
              <div className="border border-[color:var(--border)] p-3 sm:p-4">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {UI_THEME_VAR_KEYS.map((key) => (
                    <ThemeColorRow
                      key={key}
                      token={key}
                      value={colorOverrides[key] ?? presetVars[key]}
                      onChange={(next) => {
                        onColorChange(key, next);
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
