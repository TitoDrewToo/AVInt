"use client"

import { createContext, useContext, useMemo, useState, type ReactNode } from "react"

export const studioPalettes = [
  { id: "paper", label: "Paper / Ink", values: { brand: "oklch(0.55 0.18 25)", brandInk: "oklch(0.99 0 0)", surface: "oklch(0.98 0.01 90)", surface2: "oklch(0.93 0.02 90)", line: "oklch(0.78 0.03 90)", text: "oklch(0.2 0.02 60)", textDim: "oklch(0.46 0.02 60)", radius: "0.75rem", ease: "cubic-bezier(0.22, 1, 0.36, 1)", dur: "220ms" } },
  { id: "night", label: "Night / Signal", values: { brand: "oklch(0.76 0.16 190)", brandInk: "oklch(0.16 0.02 250)", surface: "oklch(0.19 0.02 250)", surface2: "oklch(0.24 0.03 250)", line: "oklch(0.38 0.04 250)", text: "oklch(0.94 0.02 220)", textDim: "oklch(0.67 0.04 220)", radius: "1.1rem", ease: "cubic-bezier(0.22, 1, 0.36, 1)", dur: "280ms" } },
  { id: "clay", label: "Clay / Moss", values: { brand: "oklch(0.56 0.13 145)", brandInk: "oklch(0.98 0.02 100)", surface: "oklch(0.91 0.04 80)", surface2: "oklch(0.84 0.06 90)", line: "oklch(0.62 0.06 100)", text: "oklch(0.25 0.04 100)", textDim: "oklch(0.47 0.04 100)", radius: "0.35rem", ease: "cubic-bezier(0.16, 1, 0.3, 1)", dur: "180ms" } },
  { id: "cobalt", label: "Cobalt / Sand", values: { brand: "oklch(0.55 0.19 260)", brandInk: "oklch(0.98 0.01 90)", surface: "oklch(0.96 0.03 95)", surface2: "oklch(0.89 0.05 95)", line: "oklch(0.7 0.08 95)", text: "oklch(0.24 0.05 260)", textDim: "oklch(0.48 0.05 260)", radius: "1.5rem", ease: "cubic-bezier(0.33, 1, 0.68, 1)", dur: "320ms" } },
] as const

type PaletteId = typeof studioPalettes[number]["id"]
type StudioThemeContextValue = { palette: PaletteId; setPalette: (palette: PaletteId) => void }
const StudioThemeContext = createContext<StudioThemeContextValue | null>(null)

export function StudioThemeProvider({ children, initialPalette = "paper" }: { children: ReactNode; initialPalette?: PaletteId }) {
  const [palette, setPalette] = useState<PaletteId>(initialPalette)
  const values = useMemo(() => studioPalettes.find((item) => item.id === palette)?.values ?? studioPalettes[0].values, [palette])
  const style = Object.fromEntries(Object.entries(values).map(([key, value]) => [`--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, value])) as React.CSSProperties
  return <StudioThemeContext.Provider value={{ palette, setPalette }}><div data-studio-palette={palette} style={style} className="min-h-full bg-[var(--surface)] text-[var(--text)]">{children}</div></StudioThemeContext.Provider>
}

export function useStudioTheme() {
  const context = useContext(StudioThemeContext)
  if (!context) throw new Error("useStudioTheme must be used inside StudioThemeProvider")
  return context
}

export function StudioPaletteSwitcher() {
  const { palette, setPalette } = useStudioTheme()
  return <div aria-label="Theme palette" className="flex flex-wrap gap-2">
    {studioPalettes.map((item) => <button key={item.id} type="button" aria-pressed={palette === item.id} onClick={() => setPalette(item.id)} className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-dim)] transition-[background,color,border,transform] duration-[var(--dur)] ease-[var(--ease)] hover:-translate-y-px hover:border-[var(--brand)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand)] aria-pressed:text-[var(--brand-ink)]">{item.label}</button>)}
  </div>
}
