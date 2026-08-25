"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowUpRight, Search } from "lucide-react"
import type { ChangelogDay, ChangelogEntry } from "@/components/systems/operations-data"

function typeLabel(type: ChangelogEntry["type"]) {
  if (type === "feat") return "New"
  if (type === "perf") return "Faster"
  return "Fixed"
}

export function ChangelogArchive({ days, error }: { days: ChangelogDay[]; error: string | null }) {
  const [query, setQuery] = useState("")
  const [type, setType] = useState<"all" | ChangelogEntry["type"]>("all")
  const [month, setMonth] = useState("")
  const entries = useMemo(() => days.flatMap((day) => day.entries).filter((entry) => {
    const normalizedQuery = query.trim().toLowerCase()
    const matchesQuery = !normalizedQuery || `${entry.title} ${entry.sha}`.toLowerCase().includes(normalizedQuery)
    const matchesType = type === "all" || entry.type === type
    const matchesMonth = !month || entry.date.startsWith(month)
    return matchesQuery && matchesType && matchesMonth
  }), [days, month, query, type])

  return (
    <section aria-labelledby="changelog-archive-heading" className="space-y-5">
      <div className="glass-surface rounded-3xl p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Changelog archive</p>
            <h2 id="changelog-archive-heading" className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Every meaningful change, in one place.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Search and filter the parsed feat, fix, and perf history from main.</p>
          </div>
          <Link href="/systems/changelog" className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-colors hover:text-primary">Latest five <ArrowUpRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>

      {error ? <div className="glass-surface rounded-2xl border-primary/25 p-6 text-sm text-muted-foreground"><p className="font-medium text-foreground">The archive is taking a pause.</p><p className="mt-2">GitHub could not be reached right now. Check back shortly.</p></div> : null}
      {!error ? <>
        <div className="glass-surface flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center">
          <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><span className="sr-only">Search changelog</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles or commit SHA" className="w-full rounded-xl border border-border bg-background/50 py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" /></label>
          <label className="sr-only" htmlFor="changelog-type">Filter by type</label><select id="changelog-type" value={type} onChange={(event) => setType(event.target.value as typeof type)} className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"><option value="all">All types</option><option value="feat">New</option><option value="fix">Fixed</option><option value="perf">Faster</option></select>
          <label className="sr-only" htmlFor="changelog-month">Filter by month</label><input id="changelog-month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-xl border border-border bg-background/50 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary" />
        </div>
        <div className="glass-surface overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-border/70 bg-background/35 text-[10px] uppercase tracking-[0.16em] text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Change</th><th className="px-5 py-3 font-medium">Type</th><th className="px-5 py-3 font-medium">Commit</th><th className="px-5 py-3" /></tr></thead>
              <tbody className="divide-y divide-border/60">{entries.map((entry) => <tr key={entry.sha} className="transition-colors hover:bg-muted/20"><td className="whitespace-nowrap px-5 py-4 text-xs text-muted-foreground">{entry.dateLabel}</td><td className="max-w-[32rem] px-5 py-4 font-medium text-foreground">{entry.title}</td><td className="px-5 py-4"><span className="rounded-full border border-primary/25 bg-primary/8 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-primary">{typeLabel(entry.type)}</span></td><td className="px-5 py-4 font-mono text-xs text-muted-foreground">{entry.sha.slice(0, 7)}</td><td className="px-5 py-4 text-right"><a href={entry.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-primary">View <ArrowUpRight className="h-3.5 w-3.5" /></a></td></tr>)}</tbody>
            </table>
          </div>
          {!entries.length ? <p className="p-10 text-center text-sm text-muted-foreground">No archived changes match those filters.</p> : null}
        </div>
      </> : null}
    </section>
  )
}
