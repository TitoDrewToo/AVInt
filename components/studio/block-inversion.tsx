"use client"

import { useState, type ReactNode } from "react"

export function BlockInversion({ children, inverted = false }: { children?: ReactNode; inverted?: boolean }) {
  const [isInverted, setIsInverted] = useState(inverted)
  return <div className="space-y-4"><div data-block={isInverted ? "invert" : "normal"} className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface)] p-6 text-[var(--text)] transition-[background,color] duration-[var(--dur)] ease-[var(--ease)]"><div className="text-[var(--text-dim)]">{children ?? "The same component can sit inside either block without knowing the palette changed."}</div></div><button type="button" onClick={() => setIsInverted((value) => !value)} className="rounded-full border border-[var(--line)] bg-transparent px-3 py-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--text-dim)] hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">Flip block</button></div>
}

export const usage = "Use as a section wrapper when alternating ground and ink is part of the composition; this is one token set, not a second theme."
