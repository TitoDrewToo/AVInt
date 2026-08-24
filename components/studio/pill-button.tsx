"use client"

export function PillButton({ children = "Get started", brand = false, onClick, buttonRef }: { children?: React.ReactNode; brand?: boolean; onClick?: () => void; buttonRef?: React.Ref<HTMLButtonElement> }) {
  return <button ref={buttonRef} type="button" onClick={onClick} className={`relative isolate overflow-hidden rounded-full border px-6 py-3 font-[var(--font-body)] text-[15px] font-semibold transition-[color] duration-[var(--dur)] ease-[var(--ease)] before:absolute before:inset-[3px] before:-z-10 before:origin-center before:scale-x-0 before:rounded-full before:bg-[var(--text)] before:transition-transform before:duration-[var(--dur)] before:ease-[var(--ease)] hover:text-[var(--surface)] hover:before:scale-x-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand)] ${brand ? "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)] before:bg-[var(--brand-ink)] hover:text-[var(--brand)]" : "border-[var(--text)] bg-transparent text-[var(--text)]"}`}>{children}</button>
}

export const usage = "Use a pill button for a primary action; the filled brand variant is the default when the action must read immediately."
