"use client"

import { useEffect, useState } from "react"

/**
 * Two traps, both of which make this read as a drop shadow instead of
 * misregistration: the back layers must be tints of --brand (--text-dim and
 * --line are text and hairline tokens; as slabs they come out grey), and the
 * settled offset must stay visible or the last frame throws two layers away.
 */
export function StackedLabel({ label = "Open late" }: { label?: string }) {
  const [settled, setSettled] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), 400)
    return () => window.clearTimeout(timer)
  }, [])
  const base = "absolute whitespace-nowrap rounded-[var(--radius)] px-5 py-[9px] font-[var(--font-display)] text-[26px] font-bold -tracking-[0.01em] transition-transform duration-[var(--dur-slow)] ease-[var(--ease)]"
  return <div className="flex flex-col items-center gap-6"><div className="relative grid h-[74px] w-full place-items-center">
    <span aria-hidden="true" className={`${base} z-[1] bg-[color-mix(in_srgb,var(--brand)_28%,var(--surface))] text-[var(--text)] ${settled ? "translate-x-[31px] translate-y-[21px] rotate-[5deg]" : "-translate-x-[14px] translate-y-10 rotate-[11deg]"}`}>{label}</span>
    <span aria-hidden="true" className={`${base} z-[2] bg-[color-mix(in_srgb,var(--brand)_55%,var(--surface))] text-[var(--brand-ink)] ${settled ? "translate-x-4 translate-y-[11px] rotate-[2.5deg]" : "translate-x-[30px] -translate-y-[18px] rotate-[5deg]"}`}>{label}</span>
    <span className={`${base} z-[3] bg-[var(--brand)] text-[var(--brand-ink)] ${settled ? "translate-x-0 translate-y-0 rotate-0" : "-translate-x-[46px] translate-y-6 -rotate-[7deg]"}`}>{label}</span>
  </div><button type="button" onClick={() => { setSettled(false); window.setTimeout(() => setSettled(true), 60) }} className="rounded-full border border-[var(--line)] bg-transparent px-3 py-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--text-dim)] hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">Replay</button></div>
}

export const usage = "Use for one focal label that arrives with the section; scroll-drive it in production rather than firing it on mount."
