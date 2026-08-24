"use client"

import { useEffect, useRef, useState } from "react"
import { PillButton } from "@/components/studio/pill-button"

export function Modal({ triggerLabel = "Open booking sheet", title = "Keep the user oriented.", children = "The close control stays inside the panel, Escape closes, and focus returns to the trigger." }: { triggerLabel?: string; title?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    const triggerNode = trigger.current
    document.body.style.overflow = "hidden"
    close.current?.focus()
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); return }
      if (event.key !== "Tab" || !panel.current) return
      const focusable = [...panel.current.querySelectorAll<HTMLElement>("button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])")]
      const first = focusable[0], last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener("keydown", key)
    return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", key); triggerNode?.focus() }
  }, [open])
  return <><PillButton buttonRef={trigger} brand onClick={() => setOpen(true)}>{triggerLabel}</PillButton>{open ? <div role="dialog" aria-modal="true" aria-labelledby="studio-modal-title" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false) }} className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_srgb,var(--surface)_76%,transparent)] p-5 backdrop-blur-[3px]"><div ref={panel} className="relative w-full max-w-[400px] rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] p-[26px] transition-transform duration-[var(--dur)] ease-[var(--ease)]"><button ref={close} type="button" aria-label="Close dialog" onClick={() => setOpen(false)} className="absolute right-3.5 top-3.5 grid h-[30px] w-[30px] place-items-center rounded-[calc(var(--radius)*.6)] border border-[var(--line)] bg-transparent text-[var(--text-dim)] hover:border-[var(--text-dim)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">×</button><h2 id="studio-modal-title" className="pr-9 font-[var(--font-display)] text-[19px] font-bold text-[var(--text)]">{title}</h2><p className="mb-5 mt-2 text-sm text-[var(--text-dim)]">{children}</p><div className="flex gap-2.5"><button type="button" onClick={() => setOpen(false)} className="rounded-[var(--radius)] border border-[var(--line)] bg-transparent px-4 py-2 text-sm text-[var(--text-dim)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]">Cancel</button><PillButton brand onClick={() => setOpen(false)}>Confirm</PillButton></div></div></div> : null}</>
}

export const usage = "Use for a consequential choice; focus is trapped in the sheet, Escape and scrim close it, and focus returns to the trigger."
