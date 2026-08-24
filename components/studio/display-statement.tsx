"use client"

import { useEffect, useRef, useState } from "react"

/**
 * Eyebrow plus one oversized statement, revealed word by word when it enters
 * the viewport rather than on mount — a statement that has already animated
 * before you scroll to it has not animated at all.
 */
export function DisplayStatement({ eyebrow = "Why AVIntelligence", statement = "The grammar transfers. The brand stays yours.", stagger = 60 }: { eyebrow?: string; statement?: string; stagger?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === "undefined") { setShown(true); return }
    const observer = new IntersectionObserver((entries) => { entries.forEach((entry) => { if (entry.isIntersecting) { setShown(true); observer.disconnect() } }) }, { threshold: 0.35 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const words = statement.split(" ")
  return <div ref={ref} className="flex w-full flex-col items-start gap-4 px-2">
    <p className="m-0 font-[var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-[var(--brand)]">{eyebrow}</p>
    <p className="m-0 max-w-[18ch] font-[var(--font-display)] text-[clamp(26px,5vw,52px)] font-bold leading-[1.04] -tracking-[0.02em] text-[var(--text)]">{words.map((word, index) => <span key={`${word}-${index}`} className="inline-block overflow-hidden pb-[0.12em] -mb-[0.12em] align-bottom"><span className={`inline-block transition-transform duration-[var(--dur-slow)] ease-[var(--ease)] ${shown ? "translate-y-0" : "translate-y-full"}`} style={{ transitionDelay: `${index * stagger}ms` }}>{word}</span>{index < words.length - 1 ? <span>&nbsp;</span> : null}</span>)}</p>
  </div>
}

export const usage = "Use for one focal statement per page, not for every heading; it fires when scrolled into view, not on mount."
