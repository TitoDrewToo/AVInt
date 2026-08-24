"use client"

export function TextRollButton({ children = "View the menu" }: { children?: React.ReactNode }) {
  return <button type="button" className="group h-[46px] overflow-hidden rounded-[var(--radius)] border border-[var(--line)] bg-[var(--surface-2)] px-[26px] font-[var(--font-body)] text-[15px] font-semibold text-[var(--text)] transition-[border-color] duration-[var(--dur)] ease-[var(--ease)] hover:border-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)]"><span className="block h-[46px] overflow-hidden"><span className="flex flex-col transition-transform duration-[var(--dur)] ease-[var(--ease)] group-hover:-translate-y-[46px] group-focus-visible:-translate-y-[46px]"><span className="grid h-[46px] place-items-center">{children}</span><span className="grid h-[46px] place-items-center text-[var(--brand)]">{children}</span></span></span></button>
}

export const usage = "Use when a button benefits from a second state arriving as a colour change, not a scale or layout shift."
