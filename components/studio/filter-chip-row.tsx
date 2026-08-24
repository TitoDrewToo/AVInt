"use client"

import { useState } from "react"

export function FilterChipRow({ options = ["All", "Featured", "New"] }: { options?: string[] }) {
  const [selected, setSelected] = useState(options[0] ?? "")
  return <div role="group" aria-label="Filters" className="flex flex-wrap gap-2">{options.map((option) => <button key={option} type="button" aria-pressed={selected === option} onClick={() => setSelected(option)} className="rounded-full border border-[var(--line)] bg-transparent px-4 py-2 font-[var(--font-body)] text-sm text-[var(--text-dim)] transition-[background,color,border,transform] duration-[var(--dur-fast)] ease-[var(--ease)] hover:-translate-y-px hover:border-[var(--brand)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand)] aria-pressed:text-[var(--brand-ink)]">{option}</button>)}</div>
}

export const usage = "Use for a short set of peer filters; the selected chip is state, not decoration."
