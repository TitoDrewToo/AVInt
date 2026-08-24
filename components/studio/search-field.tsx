"use client"

import { useState } from "react"

export function SearchField({ placeholder = "Search the collection" }: { placeholder?: string }) {
  const [value, setValue] = useState("")
  return <label className="flex min-h-12 w-full max-w-md items-center gap-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-4 text-[var(--text-dim)] transition-[border-color] duration-[var(--dur-fast)] focus-within:border-[var(--brand)]"><span aria-hidden="true" className="font-[var(--font-mono)] text-xs">⌕</span><input type="search" value={value} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent font-[var(--font-body)] text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-dim)]" />{value ? <button type="button" aria-label="Clear search" onClick={() => setValue("")} className="text-xs text-[var(--text-dim)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">Clear</button> : null}</label>
}

export const usage = "Use when filtering needs a visible input, a clear affordance, and no extra chrome around the field."
