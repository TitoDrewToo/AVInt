"use client"

import { useEffect, useRef, useState } from "react"

/**
 * The Santioni pattern: navigation takes the whole viewport and the items
 * arrive in sequence. Focus is trapped, the page behind is scroll-locked, and
 * focus returns to the trigger on close.
 */
export function FullScreenMenu({ items = ["Rooms", "Events", "Visit", "Journal", "Contact"], stagger = 70 }: { items?: string[]; stagger?: number }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const triggerNode = trigger.current
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    close.current?.focus()
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); return }
      if (event.key !== "Tab" || !panel.current) return
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("button, [href]"))
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener("keydown", key)
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", key); triggerNode?.focus() }
  }, [open])

  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-transparent px-[18px] py-2.5 font-[var(--font-mono)] text-[11px] uppercase tracking-[0.12em] text-[var(--text-dim)] transition-colors duration-[var(--dur)] ease-[var(--ease)] hover:border-[var(--text)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"><span aria-hidden="true" className="flex flex-col gap-1"><span className="block h-px w-4 bg-current" /><span className="block h-px w-4 bg-current" /></span>Menu</button>
    {open ? <div ref={panel} role="dialog" aria-modal="true" aria-label="Site navigation" className="fixed inset-0 z-50 flex flex-col justify-center gap-2 bg-[var(--surface)] px-[8vw] py-16">
      <button ref={close} type="button" aria-label="Close navigation" onClick={() => setOpen(false)} className="absolute right-8 top-8 grid h-9 w-9 place-items-center rounded-full border border-[var(--line)] bg-transparent text-[var(--text-dim)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--text-dim)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"><svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg></button>
      {items.map((item, index) => <span key={item} className="block overflow-hidden pb-[0.1em] -mb-[0.1em]"><button type="button" onClick={() => setOpen(false)} style={{ animationDelay: `${index * stagger}ms` }} className="block animate-[studio-rise_var(--dur-slow)_var(--ease)_both] border-0 bg-transparent p-0 text-left font-[var(--font-display)] text-[clamp(32px,7vw,72px)] font-bold leading-[1.05] -tracking-[0.02em] text-[var(--text-dim)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">{item}</button></span>)}
    </div> : null}
  </>
}

export const usage = "Use when navigation is part of the opening experience rather than a persistent bar; it takes the viewport and traps focus while open."
