"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type MenuKey = "rooms" | "events" | "visit"
type Menu = { width: number; rail: string[]; links: string[]; promo: string }

const MENUS: Record<MenuKey, Menu> = {
  rooms: { width: 360, rail: ["Indoor", "Covered", "Lounge", "Pro shop"], links: ["Court sizes", "Surface & lighting", "Equipment hire"], promo: "Four regulation courts, floodlit until midnight" },
  events: { width: 400, rail: ["Leagues", "Clinics", "Corporate", "Kids"], links: ["Monthly ladder", "Beginner clinic", "Team-building days", "Holiday camps"], promo: "Saturday ladder — 32 places, opens Monday" },
  visit: { width: 300, rail: ["Hours", "Getting here"], links: ["Parking", "Food & drink"], promo: "Open 6am – midnight, seven days" },
}
const KEYS = Object.keys(MENUS) as MenuKey[]
const LABEL: Record<MenuKey, string> = { rooms: "Rooms", events: "Events", visit: "Visit" }

/**
 * The signature behaviour: open one trigger, hover another, and the panel
 * RESIZES while the notch TRAVELS. It does not close and reopen.
 *
 * The height has to be measured at the TARGET width. The content sits in an
 * absolutely positioned box pinned to that width, so its height is correct
 * immediately and does not depend on the width transition being finished —
 * measuring mid-transition is what makes the panel open with dead space.
 */
export function MegaMenu() {
  const [open, setOpen] = useState<MenuKey | null>(null)
  const [height, setHeight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef<Partial<Record<MenuKey, HTMLButtonElement | null>>>({})
  const [notch, setNotch] = useState({ left: 0, top: 0 })

  const menu = open ? MENUS[open] : null

  useEffect(() => {
    if (!open || !innerRef.current) { setHeight(0); return }
    setHeight(innerRef.current.offsetHeight)
    const trigger = triggerRefs.current[open]
    const wrap = wrapRef.current
    const panel = panelRef.current
    if (trigger && wrap && panel) {
      const t = trigger.getBoundingClientRect()
      const w = wrap.getBoundingClientRect()
      setNotch({ left: t.left - w.left + t.width / 2, top: panel.offsetTop - 5 })
    }
  }, [open])

  const escape = useCallback((event: KeyboardEvent) => { if (event.key === "Escape") setOpen(null) }, [])
  useEffect(() => { document.addEventListener("keydown", escape); return () => document.removeEventListener("keydown", escape) }, [escape])

  return <div ref={wrapRef} data-open={open ? "true" : "false"} className="relative w-full max-w-[620px]">
    <div className="flex gap-1 border-b border-[var(--line)] pb-2.5">{KEYS.map((key) => <button key={key} ref={(node) => { triggerRefs.current[key] = node }} type="button" aria-expanded={open === key} onClick={() => setOpen((value) => (value === key ? null : key))} onMouseEnter={() => setOpen((value) => (value && value !== key ? key : value))} className={`rounded-[var(--radius)] border-0 bg-transparent px-3 py-1.5 font-[var(--font-body)] text-sm font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${open === key ? "text-[var(--text)]" : "text-[var(--text-dim)] hover:text-[var(--text)]"}`}>{LABEL[key]}</button>)}</div>

    <div ref={panelRef} aria-hidden={!open} style={{ width: menu ? menu.width : 240, height }} className={`relative mt-3 overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] transition-[opacity,transform,width,height] duration-[var(--dur)] ease-[var(--ease)] ${open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none -translate-y-1.5 opacity-0"}`}>
      {menu ? <div ref={innerRef} style={{ width: menu.width }} className="absolute left-0 top-0 px-5 py-[18px]">
        <div className="grid grid-cols-[108px_1fr] gap-[22px]">
          <div className="flex flex-col gap-1.5">{menu.rail.map((item) => <span key={item} className="text-[13.5px] text-[var(--text-dim)]">{item}</span>)}</div>
          <div className="flex flex-col gap-1.5">{menu.links.map((item) => <span key={item} className="text-[13.5px] text-[var(--text-dim)]">{item}</span>)}</div>
        </div>
        <p className="mt-3.5 border-t border-[var(--line)] pt-3.5 font-[var(--font-display)] text-[15px] font-bold leading-[1.25] text-[var(--text)]">{menu.promo}</p>
      </div> : null}
    </div>

    <span aria-hidden="true" style={{ left: notch.left, top: notch.top }} className={`pointer-events-none absolute z-[2] h-[11px] w-[11px] -translate-x-1/2 rotate-45 border-l border-t border-[var(--line)] bg-[var(--surface-2)] transition-[left,opacity] duration-[var(--dur)] ease-[var(--ease)] ${open ? "opacity-100" : "opacity-0"}`} />
  </div>
}

export const usage = "Use when navigation needs room for grouped destinations; open one trigger then hover another and the panel morphs rather than closing."
