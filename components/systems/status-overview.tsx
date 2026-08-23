import { CheckCircle2, CircleAlert, CircleDashed, XCircle } from "lucide-react"
import type { StatusComponent, StatusOverview, SurfaceState } from "@/components/systems/operations-data"

function stateLabel(state: SurfaceState) {
  if (state === "operational") return "Operational"
  if (state === "degraded") return "Degraded"
  if (state === "down") return "Down"
  return "Unknown"
}

function stateIcon(state: SurfaceState) {
  if (state === "operational") return <CheckCircle2 className="h-5 w-5" />
  if (state === "down") return <XCircle className="h-5 w-5" />
  if (state === "degraded") return <CircleAlert className="h-5 w-5" />
  return <CircleDashed className="h-5 w-5" />
}

function stateClass(state: SurfaceState) {
  if (state === "operational") return "text-emerald-600 dark:text-emerald-400"
  if (state === "down") return "text-red-600 dark:text-red-400"
  if (state === "degraded") return "text-amber-600 dark:text-amber-400"
  return "text-muted-foreground"
}

function formatTime(value: string | null) {
  if (!value) return "Not available"
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function StatusOverview({ status }: { status: StatusOverview }) {
  return <section aria-labelledby="status-heading" className="space-y-5"><div className="glass-surface rounded-3xl p-6 md:p-8"><div className="flex flex-col justify-between gap-6 md:flex-row md:items-center"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Public status</p><h2 id="status-heading" className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">Current production state.</h2><p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">A quick read on the services behind the public experience.</p></div><div className={`flex items-center gap-3 rounded-2xl border border-border bg-background/45 px-4 py-3 ${stateClass(status.overall)}`}><span aria-hidden>{stateIcon(status.overall)}</span><span><span className="block text-[10px] font-medium uppercase tracking-[0.18em]">Overall</span><strong className="mt-1 block text-lg">{stateLabel(status.overall)}</strong></span></div></div><div className="mt-8 grid gap-3 border-t border-border/70 pt-6 sm:grid-cols-2"><div><p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Last successful deploy</p><p className="mt-2 font-mono text-sm text-foreground">{formatTime(status.lastDeploy)}</p></div><div><p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Refresh window</p><p className="mt-2 font-mono text-sm text-foreground">10 minutes</p></div></div></div><div className="grid gap-4 md:grid-cols-2">{status.components.map((component) => <StatusCard key={component.name} component={component} />)}</div></section>
}

function StatusCard({ component }: { component: StatusComponent }) {
  return <article className="glass-surface hover-bloom flex items-start justify-between gap-4 rounded-2xl p-5"><div className="flex items-start gap-3"><span className={`mt-0.5 ${stateClass(component.state)}`} aria-hidden>{stateIcon(component.state)}</span><div><h3 className="text-base font-semibold text-foreground">{component.name}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{component.detail}</p></div></div><span className={`shrink-0 text-[10px] font-medium uppercase tracking-[0.16em] ${stateClass(component.state)}`}>{stateLabel(component.state)}</span></article>
}
