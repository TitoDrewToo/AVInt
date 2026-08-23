"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity, ArrowUpRight, FileWarning, GitCommitHorizontal, Mail, RefreshCw, type LucideIcon } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

type OverviewData = {
  status: { overall: "operational" | "degraded" | "down" | "unknown"; lastDeploy: string | null }
  changelog: { title: string; dateLabel: string; url: string } | null
  errors: { open: number; bySeverity: Record<string, number> }
  inquiries: { unread: number }
}

function overallLabel(state: OverviewData["status"]["overall"]) {
  return state === "operational" ? "Operational" : state === "degraded" ? "Degraded" : state === "down" ? "Down" : "Unknown"
}

function formatDeploy(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not available"
}

export function SystemsOverview() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const response = session?.access_token ? await fetch("/api/systems/overview", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }) : null
    if (!response?.ok) {
      setError("Unable to load the systems overview.")
      setLoading(false)
      return
    }
    setData(await response.json() as OverviewData)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  if (loading) return <div className="glass-surface rounded-3xl p-8 text-sm text-muted-foreground">Loading systems overview…</div>
  if (error || !data) return <div className="glass-surface rounded-3xl p-8"><p className="text-sm text-destructive">{error ?? "Overview unavailable."}</p><Button variant="outline" size="sm" onClick={() => void load()} className="mt-5 gap-2"><RefreshCw className="h-4 w-4" />Retry</Button></div>

  const severity = Object.entries(data.errors.bySeverity).sort(([a], [b]) => a.localeCompare(b))
  return <section className="space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Internal overview</p><h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">What needs attention?</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">A compact read on production health, recent change, monitoring, and inbound work.</p></div><Button variant="outline" size="sm" onClick={() => void load()} className="gap-2"><RefreshCw className="h-4 w-4" />Refresh</Button></div>
    <div className="grid gap-4 md:grid-cols-2">
      <OverviewCard href="/systems/status" eyebrow="Current status" title={overallLabel(data.status.overall)} detail={`Last successful deploy · ${formatDeploy(data.status.lastDeploy)}`} Icon={Activity} />
      <OverviewCard href="/systems/changelog" eyebrow="Most recent change" title={data.changelog?.title ?? "No conventional changes yet"} detail={data.changelog?.dateLabel ?? "The changelog is ready for the next feat, fix, or perf entry."} Icon={GitCommitHorizontal} />
      <OverviewCard href="/systems/errors" eyebrow="Open error groups" title={`${data.errors.open} open`} detail={severity.length ? severity.map(([name, count]) => `${name} ${count}`).join(" · ") : "No open error groups"} Icon={FileWarning} />
      <OverviewCard href="/systems/inquiries" eyebrow="Unread inquiries" title={`${data.inquiries.unread} new`} detail="Partner and studio conversations awaiting review" Icon={Mail} />
    </div>
  </section>
}

function OverviewCard({ href, eyebrow, title, detail, Icon }: { href: string; eyebrow: string; title: string; detail: string; Icon: LucideIcon }) {
  return <Link href={href} className="glass-surface hover-bloom group block rounded-2xl p-6"><div className="flex items-start justify-between gap-4"><div className="glass-surface-sm flex h-10 w-10 items-center justify-center rounded-xl text-primary"><Icon className="h-4 w-4" /></div><ArrowUpRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-primary" /></div><p className="mt-6 text-xs font-medium uppercase tracking-[0.18em] text-primary">{eyebrow}</p><h3 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{detail}</p><span className="mt-5 inline-flex items-center gap-2 text-xs font-medium text-primary">Open section <ArrowUpRight className="h-3.5 w-3.5" /></span></Link>
}
