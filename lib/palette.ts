// HSL-based palette derivation for the Smart Dashboard.
//
// One accent hex → 5 named role slots (primary/secondary/tertiary/quaternary/
// quinary) via hue rotation. extendPalette(accent, n) continues the rotation
// for categorical charts (pie, stacked-bar) that need more than 5 colors
// without repeats.

export type ThemeMode = "light" | "dark"

export interface WidgetColor {
  primary: string
  secondary: string
  tertiary: string
  quaternary: string
  quinary: string
}

// Curated accents — surfaced as swatches in the picker. Kept intentionally
// small: users get these + a hex input, not a preset library.
export const CURATED_ACCENTS: string[] = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
]

export const DEFAULT_ACCENT = "#6366f1"

// Hue offsets applied to the accent hue, in order of role slot. Chosen to
// produce visually distinct but harmonious companion colors.
const ROLE_HUE_OFFSETS = [0, 160, 40, -60, 100] as const

// Lightness clamp per theme. Accents outside this band become unreadable
// against the dashboard background, so we pull them in rather than reject.
const LIGHTNESS_CLAMP: Record<ThemeMode, { min: number; max: number }> = {
  light: { min: 28, max: 60 },
  dark:  { min: 45, max: 75 },
}

// ── Hex ↔ HSL ────────────────────────────────────────────────────────────────

interface HSL { h: number; s: number; l: number }

function hexToHsl(hex: string): HSL {
  const cleaned = hex.replace("#", "")
  const r = parseInt(cleaned.slice(0, 2), 16) / 255
  const g = parseInt(cleaned.slice(2, 4), 16) / 255
  const b = parseInt(cleaned.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break
      case g: h = ((b - r) / d + 2); break
      case b: h = ((r - g) / d + 4); break
    }
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslToHex({ h, s, l }: HSL): string {
  const sNorm = s / 100
  const lNorm = l / 100
  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm
  const hp = ((h % 360) + 360) % 360 / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0, g = 0, b = 0
  if      (hp < 1) { r = c; g = x }
  else if (hp < 2) { r = x; g = c }
  else if (hp < 3) {         g = c; b = x }
  else if (hp < 4) {         g = x; b = c }
  else if (hp < 5) { r = x;         b = c }
  else             { r = c;         b = x }
  const m = lNorm - c / 2
  const toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

// ── Clamp ────────────────────────────────────────────────────────────────────

export function clampAccentForTheme(hex: string, theme: ThemeMode): string {
  const hsl = hexToHsl(hex)
  const { min, max } = LIGHTNESS_CLAMP[theme]
  if (hsl.l < min) hsl.l = min
  if (hsl.l > max) hsl.l = max
  return hslToHex(hsl)
}

// ── Derive ──────────────────────────────────────────────────────────────────
//
// Accent → 5 role colors. The accent's own hue and saturation seed the palette;
// each role slot rotates the hue by a fixed offset, and the derived slots use
// a slightly softened saturation so the primary stays visually dominant.

export function derivePalette(accent: string, theme: ThemeMode = "light"): WidgetColor {
  const clamped = clampAccentForTheme(accent, theme)
  const base = hexToHsl(clamped)
  const softSat = Math.max(35, base.s * 0.82)
  const [p, s, t, q, qn] = ROLE_HUE_OFFSETS.map((offset, i) =>
    hslToHex({
      h: base.h + offset,
      s: i === 0 ? base.s : softSat,
      l: base.l,
    }),
  )
  return { primary: p, secondary: s, tertiary: t, quaternary: q, quinary: qn }
}

// ── Extend ──────────────────────────────────────────────────────────────────
//
// For categorical charts where N > 5. Continues hue rotation with a step that
// avoids collision with the 5 role offsets. Every 12 steps we nudge lightness
// so deep category counts don't wrap into visually identical colors.

export function extendPalette(accent: string, count: number, theme: ThemeMode = "light"): string[] {
  const out: string[] = []
  const base = hexToHsl(clampAccentForTheme(accent, theme))
  const STEP = 47 // coprime-ish with 360 — avoids short cycles
  const softSat = Math.max(35, base.s * 0.82)
  for (let i = 0; i < count; i++) {
    const hueOffset = i < ROLE_HUE_OFFSETS.length
      ? ROLE_HUE_OFFSETS[i]
      : ROLE_HUE_OFFSETS[ROLE_HUE_OFFSETS.length - 1] + STEP * (i - ROLE_HUE_OFFSETS.length + 1)
    const lightnessDrift = Math.floor(i / 12) * (theme === "light" ? -6 : 6)
    out.push(hslToHex({
      h: base.h + hueOffset,
      s: i === 0 ? base.s : softSat,
      l: Math.max(LIGHTNESS_CLAMP[theme].min, Math.min(LIGHTNESS_CLAMP[theme].max, base.l + lightnessDrift)),
    }))
  }
  return out
}

export const DEFAULT_WIDGET_COLORS: WidgetColor = derivePalette(DEFAULT_ACCENT, "light")
