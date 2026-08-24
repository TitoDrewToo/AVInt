"use client"

import { useRef, useState } from "react"

export function MagneticButton({ children = "Reserve" }: { children?: React.ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  function move(event: React.PointerEvent<HTMLDivElement>) {
    const field = event.currentTarget.getBoundingClientRect()
    setOffset({ x: (event.clientX - (field.left + field.width / 2)) * 0.32, y: (event.clientY - (field.top + field.height / 2)) * 0.32 })
  }
  return <div className="grid h-[110px] w-[260px] place-items-center" onPointerMove={move} onPointerLeave={() => setOffset({ x: 0, y: 0 })}><button ref={ref} type="button" style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }} className="rounded-[var(--radius)] border-0 bg-[var(--brand)] px-[30px] py-3.5 font-[var(--font-body)] text-[15px] font-semibold text-[var(--brand-ink)] transition-transform duration-[520ms] ease-[var(--ease-io)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] motion-reduce:!transform-none">{children}</button></div>
}

export const usage = "Use inside a bounded field when the button should lean toward the pointer; the field, not the button, defines the magnetic area."
