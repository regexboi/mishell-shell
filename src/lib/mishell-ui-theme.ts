export type MishellThemeId = "ultraviolet" | "phosphor" | "amber" | "dark-knight";

export const UI_THEME_VAR_KEYS = [
  "bg",
  "panel",
  "panel-muted",
  "panel-strong",
  "border",
  "border-strong",
  "accent",
  "accent-dim",
  "text-primary",
  "text-secondary",
  "text-muted",
  "glow-primary",
  "glow-secondary",
  "grid-line",
] as const;

export type MishellUiColorVar = (typeof UI_THEME_VAR_KEYS)[number];

export type MishellSurfaceId =
  | "studio"
  | "plain"
  | "wash"
  | "aurora"
  | "lattice"
  | "depth";

export const SURFACE_OPTIONS: { id: MishellSurfaceId; label: string }[] = [
  { id: "studio", label: "Studio" },
  { id: "plain", label: "Plain" },
  { id: "wash", label: "Wash" },
  { id: "aurora", label: "Aurora" },
  { id: "lattice", label: "Lattice" },
  { id: "depth", label: "Depth" },
];

/** Short labels for the settings grid — matches index.css presets. */
export const UI_VAR_LABELS: Record<MishellUiColorVar, string> = {
  bg: "Background",
  panel: "Panel",
  "panel-muted": "Panel muted",
  "panel-strong": "Panel strong",
  border: "Border",
  "border-strong": "Border strong",
  accent: "Accent",
  "accent-dim": "Accent dim",
  "text-primary": "Text",
  "text-secondary": "Text secondary",
  "text-muted": "Text muted",
  "glow-primary": "Glow A",
  "glow-secondary": "Glow B",
  "grid-line": "Grid",
};

export const PRESET_UI_VARS: Record<MishellThemeId, Record<MishellUiColorVar, string>> = {
  ultraviolet: {
    bg: "#06060a",
    panel: "rgba(13, 13, 18, 0.86)",
    "panel-muted": "rgba(10, 10, 16, 0.8)",
    "panel-strong": "rgba(18, 18, 24, 0.96)",
    border: "rgba(148, 148, 184, 0.16)",
    "border-strong": "rgba(204, 153, 255, 0.38)",
    accent: "#d17bff",
    "accent-dim": "rgba(209, 123, 255, 0.42)",
    "text-primary": "#f4ebff",
    "text-secondary": "rgba(221, 214, 255, 0.78)",
    "text-muted": "rgba(179, 170, 209, 0.56)",
    "glow-primary": "rgba(201, 123, 255, 0.18)",
    "glow-secondary": "rgba(80, 20, 120, 0.32)",
    "grid-line": "rgba(255, 255, 255, 0.03)",
  },
  phosphor: {
    bg: "#050906",
    panel: "rgba(11, 20, 16, 0.88)",
    "panel-muted": "rgba(8, 16, 12, 0.84)",
    "panel-strong": "rgba(12, 24, 18, 0.96)",
    border: "rgba(130, 194, 157, 0.18)",
    "border-strong": "rgba(107, 255, 150, 0.38)",
    accent: "#6bff96",
    "accent-dim": "rgba(107, 255, 150, 0.22)",
    "text-primary": "#ebfff4",
    "text-secondary": "rgba(215, 248, 227, 0.82)",
    "text-muted": "rgba(162, 206, 178, 0.56)",
    "glow-primary": "rgba(107, 255, 150, 0.14)",
    "glow-secondary": "rgba(19, 92, 56, 0.3)",
    "grid-line": "rgba(183, 255, 204, 0.035)",
  },
  amber: {
    bg: "#090603",
    panel: "rgba(23, 16, 11, 0.88)",
    "panel-muted": "rgba(18, 12, 8, 0.84)",
    "panel-strong": "rgba(28, 18, 12, 0.96)",
    border: "rgba(255, 188, 120, 0.16)",
    "border-strong": "rgba(255, 179, 71, 0.4)",
    accent: "#ffb347",
    "accent-dim": "rgba(255, 179, 71, 0.22)",
    "text-primary": "#fff2dd",
    "text-secondary": "rgba(245, 222, 190, 0.8)",
    "text-muted": "rgba(198, 165, 125, 0.58)",
    "glow-primary": "rgba(255, 179, 71, 0.16)",
    "glow-secondary": "rgba(122, 68, 20, 0.3)",
    "grid-line": "rgba(255, 210, 140, 0.032)",
  },
  "dark-knight": {
    bg: "#000000",
    panel: "rgba(2, 4, 8, 0.94)",
    "panel-muted": "rgba(0, 2, 6, 0.92)",
    "panel-strong": "rgba(6, 10, 18, 0.97)",
    border: "rgba(56, 96, 168, 0.22)",
    "border-strong": "rgba(72, 120, 200, 0.38)",
    accent: "#4a7ec4",
    "accent-dim": "rgba(58, 110, 190, 0.28)",
    "text-primary": "#e4e8f0",
    "text-secondary": "rgba(180, 195, 220, 0.72)",
    "text-muted": "rgba(110, 130, 165, 0.48)",
    "glow-primary": "rgba(30, 70, 140, 0.06)",
    "glow-secondary": "rgba(12, 28, 64, 0.1)",
    "grid-line": "rgba(48, 88, 160, 0.045)",
  },
};

export const themeCustomizationStorageKey = "mishell-theme-custom";
export const defaultSurfaceId: MishellSurfaceId = "studio";

export type ThemeCustomization = {
  colors: Partial<Record<MishellUiColorVar, string>>;
  surface: MishellSurfaceId;
};

export function loadThemeCustomization(): ThemeCustomization {
  if (typeof window === "undefined") {
    return { colors: {}, surface: defaultSurfaceId };
  }
  try {
    const raw = window.localStorage.getItem(themeCustomizationStorageKey);
    if (!raw) {
      return { colors: {}, surface: defaultSurfaceId };
    }
    const parsed = JSON.parse(raw) as Partial<ThemeCustomization>;
    const colors =
      parsed.colors && typeof parsed.colors === "object" ? parsed.colors : {};
    const surface =
      parsed.surface &&
      SURFACE_OPTIONS.some((option) => option.id === parsed.surface)
        ? parsed.surface
        : defaultSurfaceId;
    return { colors, surface };
  } catch {
    return { colors: {}, surface: defaultSurfaceId };
  }
}

export function saveThemeCustomization(next: ThemeCustomization) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(themeCustomizationStorageKey, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

const RGBA_RE =
  /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i;
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function parseCssColor(value: string): {
  r: number;
  g: number;
  b: number;
  a: number;
} | null {
  const trimmed = value.trim();
  const rgba = trimmed.match(RGBA_RE);
  if (rgba) {
    const r = Math.min(255, Math.max(0, Number(rgba[1])));
    const g = Math.min(255, Math.max(0, Number(rgba[2])));
    const b = Math.min(255, Math.max(0, Number(rgba[3])));
    const a =
      rgba[4] === undefined ? 1 : Math.min(1, Math.max(0, Number(rgba[4])));
    return { r, g, b, a };
  }
  const hex = trimmed.match(HEX_RE);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const n = Number.parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
  }
  return null;
}

export function formatCssColor(
  r: number,
  g: number,
  b: number,
  a: number,
): string {
  const rr = Math.round(Math.min(255, Math.max(0, r)));
  const gg = Math.round(Math.min(255, Math.max(0, g)));
  const bb = Math.round(Math.min(255, Math.max(0, b)));
  const aa = Math.min(1, Math.max(0, a));
  if (aa >= 0.999) {
    return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;
  }
  return `rgba(${rr}, ${gg}, ${bb}, ${aa.toFixed(3).replace(/\.?0+$/, "") || "0"})`;
}

/** Best-effort solid hex for terminal / color input when value uses alpha. */
export function cssColorToHex8(value: string): string {
  const parsed = parseCssColor(value);
  if (!parsed) {
    return "#000000";
  }
  return formatCssColor(parsed.r, parsed.g, parsed.b, 1).slice(0, 7);
}

export function colorsLooselyEqual(a: string, b: string): boolean {
  const pa = parseCssColor(a);
  const pb = parseCssColor(b);
  if (pa && pb) {
    return (
      Math.round(pa.r) === Math.round(pb.r) &&
      Math.round(pa.g) === Math.round(pb.g) &&
      Math.round(pa.b) === Math.round(pb.b) &&
      Math.abs(pa.a - pb.a) < 0.02
    );
  }
  return a.trim() === b.trim();
}
