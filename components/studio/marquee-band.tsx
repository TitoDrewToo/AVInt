"use client"

export function MarqueeBand({ items = ["Open 6am – midnight", "Four floodlit courts", "Walk-ins welcome"], separator = "✦" }: { items?: string[]; separator?: string }) {
  const track = items.flatMap((item) => [item, separator])
  return <div className="w-full overflow-hidden bg-[var(--brand)] py-[11px] text-[var(--brand-ink)] [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)] [-webkit-mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]"><div className="flex w-max animate-[studio-marquee_22s_linear_infinite]">{[...track, ...track].map((word, index) => <span key={`${word}-${index}`} aria-hidden={index >= track.length} className="whitespace-nowrap px-[26px] font-[var(--font-mono)] text-xs uppercase tracking-[0.16em]">{word}</span>)}</div></div>
}

export const usage = "Use as the divider between two section blocks, never as decoration on its own; the content is duplicated once so the loop is seamless at any width."
