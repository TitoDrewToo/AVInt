"use client"

import { useEffect, useRef, useState } from "react"

export function Dropdown({ label = "Choose a court", options = ["Court 1 — indoor", "Court 2 — indoor", "Court 3 — covered", "Court 4 — covered"] }: { label?: string; options?: string[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function close(event: MouseEvent) { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") setOpen(false) }
    document.addEventListener("click", close); document.addEventListener("keydown", escape)
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", escape) }
  }, [])
  return <div ref={ref} data-open={open} className="relative"><button type="button" aria-expanded={open} aria-haspopup="listbox" onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-[18px] py-[11px] font-[var(--font-body)] text-sm text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">{label}<span aria-hidden="true" className={`transition-transform duration-[var(--dur)] ease-[var(--ease)] ${open ? "rotate-180" : ""}`}>⌄</span></button><ul role="listbox" aria-hidden={!open} className={`absolute left-0 top-[calc(100%+8px)] z-10 m-0 min-w-[190px] list-none rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-1.5 opacity-0 transition-[opacity,transform] duration-[var(--dur-fast)] ease-[var(--ease)] ${open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1"}`}>{options.map((option, index) => <li key={option} className={`transition-[opacity,transform] duration-[var(--dur)] ease-[var(--ease)] ${open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`} style={{ transitionDelay: open ? `${index * 45}ms` : "0ms" }}><button type="button" role="option" onClick={() => setOpen(false)} className="w-full rounded-[calc(var(--radius)*.7)] border-0 bg-transparent px-3 py-2 text-left font-[var(--font-body)] text-sm text-[var(--text-dim)] transition-[background,color] duration-[var(--dur-fast)] hover:bg-[var(--surface)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--brand)]">{option}</button></li>)}</ul></div>
}

export const usage = "Use for a short attached menu; items cascade in on open and the list closes as one piece on Escape or outside click."
