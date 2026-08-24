"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

export const studioPalettes = [
  { id: "ember", label: "Ember" },
  { id: "venue", label: "Venue" },
  { id: "gallery", label: "Gallery" },
  { id: "clinic", label: "Clinic" },
] as const

type PaletteId = typeof studioPalettes[number]["id"]
type StudioThemeContextValue = { palette: PaletteId; motion: boolean; setPalette: (palette: PaletteId) => void; setMotion: (motion: boolean) => void }
const StudioThemeContext = createContext<StudioThemeContextValue | null>(null)

export function StudioThemeProvider({ children, initialPalette = "ember" }: { children: ReactNode; initialPalette?: PaletteId }) {
  const [palette, setPalette] = useState<PaletteId>(initialPalette)
  const [motion, setMotion] = useState(true)
  return <StudioThemeContext.Provider value={{ palette, motion, setPalette, setMotion }}><div data-pal={palette} data-motion={motion ? "on" : "off"} className="studio min-h-full bg-[var(--surface)] font-[var(--font-body)] text-[var(--text)]">{children}</div></StudioThemeContext.Provider>
}

export function useStudioTheme() {
  const context = useContext(StudioThemeContext)
  if (!context) throw new Error("useStudioTheme must be used inside StudioThemeProvider")
  return context
}

export function StudioPaletteSwitcher() {
  const { palette, setPalette } = useStudioTheme()
  return <div aria-label="Palette" className="flex flex-wrap items-center gap-2">
    <span className="font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--text-dim)]">Palette</span>
    {studioPalettes.map((item) => <button key={item.id} type="button" aria-pressed={palette === item.id} onClick={() => setPalette(item.id)} className="rounded-[var(--radius)] border border-[var(--line)] bg-transparent px-3 py-1.5 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--text-dim)] transition-[color,border,transform] duration-[var(--dur-fast)] ease-[var(--ease)] hover:-translate-y-px hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] aria-pressed:border-[var(--text)] aria-pressed:text-[var(--text)]">{item.label}</button>)}
  </div>
}

export function StudioMotionToggle() {
  const { motion, setMotion } = useStudioTheme()
  return <button type="button" aria-pressed={!motion} onClick={() => setMotion(!motion)} className="rounded-[var(--radius)] border border-[var(--line)] bg-transparent px-3 py-1.5 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.08em] text-[var(--text-dim)] transition-[color,border,transform] duration-[var(--dur-fast)] ease-[var(--ease)] hover:-translate-y-px hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] aria-pressed:border-[var(--brand)] aria-pressed:text-[var(--brand)]">{motion ? "Pause motion" : "Resume motion"}</button>
}
