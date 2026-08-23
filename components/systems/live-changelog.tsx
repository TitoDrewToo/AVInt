import { ArrowUpRight, GitCommitHorizontal } from "lucide-react"
import type { ChangelogDay, ChangelogEntry } from "@/components/systems/operations-data"

function typeLabel(type: ChangelogEntry["type"]) {
  if (type === "feat") return "New"
  if (type === "perf") return "Faster"
  return "Fixed"
}

export function LiveChangelog({ days, error }: { days: ChangelogDay[]; error: string | null }) {
  return (
    <section aria-labelledby="changelog-heading" className="space-y-5">
      <div className="glass-surface rounded-3xl p-6 md:p-8">
        <div className="flex items-start gap-4">
          <div className="glass-surface-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-primary"><GitCommitHorizontal className="h-5 w-5" /></div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Live changelog</p>
            <h2 id="changelog-heading" className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">What changed in production.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">A filtered view of meaningful product, reliability, and performance work on main.</p>
          </div>
        </div>
      </div>

      {error ? <div className="glass-surface rounded-2xl border-primary/25 p-6 text-sm text-muted-foreground"><p className="font-medium text-foreground">The changelog is taking a pause.</p><p className="mt-2">GitHub could not be reached right now. Check back shortly.</p></div> : null}
      {!error && !days.length ? <div className="glass-surface rounded-2xl p-10 text-center"><p className="text-sm font-medium text-foreground">No release notes yet.</p><p className="mt-2 text-sm text-muted-foreground">Meaningful changes will appear here when they land on main.</p></div> : null}
      {days.map((day) => <div key={day.date} className="grid gap-4 md:grid-cols-[150px_1fr] md:gap-8"><div className="pt-2 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{day.label}</div><div className="space-y-3">{day.entries.map((entry) => <ChangelogItem key={entry.sha} entry={entry} />)}</div></div>)}
    </section>
  )
}

function ChangelogItem({ entry }: { entry: ChangelogEntry }) {
  return <article className="glass-surface hover-bloom rounded-2xl p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-[10px] font-medium uppercase tracking-[0.18em] text-primary">{typeLabel(entry.type)}</span><h3 className="mt-2 text-base font-semibold text-foreground">{entry.title}</h3></div><a href={entry.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]">View commit <ArrowUpRight className="h-3.5 w-3.5" /></a></div><p className="mt-3 font-mono text-[10px] text-muted-foreground">{entry.sha.slice(0, 7)}</p></article>
}
