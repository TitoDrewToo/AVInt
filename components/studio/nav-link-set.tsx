"use client"

import { useState } from "react"

/**
 * Resting state is dim. The hovered item goes to full strength and its
 * siblings hold their dim — that restraint is what makes the set read as one
 * object rather than five independent links.
 */
export function NavLinkSet({ items = ["Rooms", "Events", "Visit", "Journal", "Contact"], current = "Rooms" }: { items?: string[]; current?: string }) {
  const [active, setActive] = useState(current)
  return <nav aria-label="Primary" className="flex flex-wrap items-center gap-1">{items.map((item) => <button key={item} type="button" aria-current={active === item ? "page" : undefined} onClick={() => setActive(item)} className={`relative rounded-[var(--radius)] border-0 bg-transparent px-3 py-2 font-[var(--font-body)] text-[15px] font-medium transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] after:absolute after:bottom-1 after:left-3 after:right-3 after:h-px after:origin-left after:scale-x-0 after:bg-[var(--brand)] after:transition-transform after:duration-[var(--dur)] after:ease-[var(--ease)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${active === item ? "text-[var(--text)] after:scale-x-100" : "text-[var(--text-dim)]"}`}>{item}</button>)}</nav>
}

export const usage = "Use for primary navigation where a full menu would be too heavy; the rule under the current item is the only persistent mark."
