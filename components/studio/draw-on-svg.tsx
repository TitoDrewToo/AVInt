"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Path lengths are measured at runtime, so any client mark can be dropped in
 * without hand-tuned dash values. Stroke colour is set per shape rather than
 * with a descendant variant — a `[&_path]:stroke-…` rule outranks a utility on
 * the element itself, so the accent stroke would lose.
 */
const SHAPE = "fill-none [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.4] animate-[studio-draw_1600ms_var(--ease-io)_both]"

export function DrawOnSvg() {
  const ref = useRef<SVGSVGElement>(null)
  const [run, setRun] = useState(0)
  const measure = useCallback(() => {
    ref.current?.querySelectorAll<SVGGeometryElement>("path, circle").forEach((shape) => {
      const length = Math.ceil(shape.getTotalLength())
      shape.style.strokeDasharray = String(length)
      shape.style.setProperty("--len", String(length))
    })
  }, [])
  useEffect(() => { measure() }, [measure, run])
  return <div className="flex flex-col items-center gap-6">
    <svg key={run} ref={ref} width="190" height="96" viewBox="0 0 190 96" role="img" aria-label="Client mark drawing itself in">
      <circle cx="48" cy="48" r="32" className={`${SHAPE} stroke-[var(--text)]`} />
      <path d="M30 60 L48 28 L66 60" className={`${SHAPE} stroke-[var(--text)] [animation-delay:320ms]`} />
      <path d="M94 48 L170 48" className={`${SHAPE} stroke-[var(--brand)] [animation-delay:640ms]`} />
    </svg>
    <button type="button" onClick={() => setRun((value) => value + 1)} className="rounded-full border border-[var(--line)] bg-transparent px-3 py-1.5 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[var(--text-dim)] hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">Replay</button>
  </div>
}

export const usage = "Use for a client-supplied mark during an entrance; replace the placeholder paths with theirs and nothing else changes."
