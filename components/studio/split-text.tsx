"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Masked per LINE, not per word — that difference is the whole effect.
 * Lines only exist after layout, so this measures in a hidden pass, groups the
 * words that share an offsetTop, then re-renders them as masked lines.
 *
 * Two traps:
 *  - measuring before document.fonts.ready groups against the fallback face and
 *    regroups wrongly once the webfont lands
 *  - overflow-hidden on the line box shears the descenders off every g, y, p
 *    and j, so the mask is padded below the baseline and pulled back up
 */
export function SplitText({ text = "Four courts, floodlit until midnight, and nobody waiting behind you.", stagger = 90 }: { text?: string; stagger?: number }) {
  const measureRef = useRef<HTMLParagraphElement>(null)
  const [lines, setLines] = useState<string[] | null>(null)
  const [run, setRun] = useState(false)

  const build = useCallback(() => {
    const el = measureRef.current
    if (!el) return
    const words = Array.from(el.querySelectorAll<HTMLElement>("span[data-word]"))
    const grouped: string[] = []
    let top: number | null = null
    words.forEach((word) => {
      const content = word.textContent ?? ""
      if (top === null || word.offsetTop !== top) { top = word.offsetTop; grouped.push(content) }
      else grouped[grouped.length - 1] = `${grouped[grouped.length - 1]} ${content}`
    })
    if (grouped.length) { setLines(grouped); requestAnimationFrame(() => requestAnimationFrame(() => setRun(true))) }
  }, [])

  useEffect(() => {
    if (lines) return
    let cancelled = false
    const start = () => { if (!cancelled) build() }
    if (typeof document !== "undefined" && document.fonts?.ready) void document.fonts.ready.then(start)
    else start()
    return () => { cancelled = true }
  }, [build, lines])

  useEffect(() => {
    let frame = 0
    const onResize = () => { window.clearTimeout(frame); frame = window.setTimeout(() => { setRun(false); setLines(null) }, 160) }
    window.addEventListener("resize", onResize)
    return () => { window.clearTimeout(frame); window.removeEventListener("resize", onResize) }
  }, [])

  const type = "max-w-[20ch] font-[var(--font-display)] text-[clamp(20px,3.4vw,32px)] font-bold leading-[1.16] -tracking-[0.015em] text-[var(--text)]"

  return <div className="flex w-full flex-col items-start gap-5 px-2">
    <p className="m-0 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-dim)]">Why book here</p>
    {lines === null
      ? <p ref={measureRef} aria-hidden="true" className={`${type} invisible`}>{text.split(" ").map((word, index) => <span key={`${word}-${index}`} data-word="">{word}{index < text.split(" ").length - 1 ? " " : ""}</span>)}</p>
      : <p className={type}>{lines.map((line, index) => <span key={line + index} className="block overflow-hidden pb-[0.2em] -mb-[0.2em]"><span className={`block transition-transform duration-[var(--dur-slow)] ease-[var(--ease)] ${run ? "translate-y-0" : "translate-y-[105%]"}`} style={{ transitionDelay: `${index * stagger}ms` }}>{line}</span></span>)}</p>}
    <button type="button" onClick={() => { setRun(false); window.setTimeout(() => setRun(true), 60) }} className="rounded-full border border-[var(--line)] bg-transparent px-3 py-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--text-dim)] hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">Replay</button>
  </div>
}

export const usage = "Use for one short statement whose line structure is part of the entrance; it re-measures on resize because the lines change with the width."
