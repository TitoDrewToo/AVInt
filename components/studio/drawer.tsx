"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * A secondary surface that enters without losing page context — the scrim
 * stays partly transparent so the page behind is still legible, which is the
 * difference between a drawer and a modal.
 */
export function Drawer({ triggerLabel = "Open filters", title = "Refine", children }: { triggerLabel?: string; title?: string; children?: ReactNode }) {
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
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("button, [href], input, select, textarea"))
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener("keydown", key)
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", key); triggerNode?.focus() }
  }, [open])

  return <>
    <button ref={trigger} type="button" onClick={() => setOpen(true)} className="rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-[18px] py-[11px] font-[var(--font-body)] text-sm text-[var(--text)] transition-colors duration-[var(--dur)] ease-[var(--ease)] hover:border-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">{triggerLabel}</button>
    {open ? <div onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }} className="fixed inset-0 z-50 flex justify-end bg-[color-mix(in_srgb,var(--surface)_58%,transparent)]">
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} className="flex h-full w-[min(360px,88vw)] animate-[studio-slide-in_var(--dur)_var(--ease)_both] flex-col gap-5 border-l border-[var(--line)] bg-[var(--surface-2)] p-6">
        <div className="flex items-start justify-between gap-4"><h2 className="m-0 font-[var(--font-display)] text-[19px] font-bold text-[var(--text)]">{title}</h2><button ref={close} type="button" aria-label="Close drawer" onClick={() => setOpen(false)} className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[calc(var(--radius)*.6)] border border-[var(--line)] bg-transparent text-[var(--text-dim)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--text-dim)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"><svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true"><path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg></button></div>
        <div className="text-sm leading-relaxed text-[var(--text-dim)]">{children ?? "Filters, detail, or navigation that would crowd the page but should not take it over."}</div>
      </div>
    </div> : null}
  </>
}

export const usage = "Use for detail, filters, or navigation on constrained screens; the scrim stays translucent so the page behind keeps its context."
