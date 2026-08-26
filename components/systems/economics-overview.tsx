"use client"

import { useEffect, useState } from "react"
import { RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

type EconomicsData = {
  eventCount: number
  totals: { calls: number; inputTokens: number; outputTokens: number; internalCostUsd: number; customerBillableCostUsd: number; retryCostUsd: number; retries: number; fallbacks: number; failures: number }
  byOperation: { operation: string; calls: number; cost: number; retries: number }[]
  byProvider: { provider: string; model: string; calls: number; cost: number }[]
  byWorkload: { workloadClass: string; files: number; calls: number; cost: number; retries: number; averageCostPerFile: number; averageDurationMs: number }[]
  bySize: { label: string; files: number }[]
  byFile: { fileId: string; fileType: string; fileSizeBytes: number | null; sourceRowCount: number | null; extractedRowCount: number | null; calls: number; cost: number; retries: number }[]
}

function money(value: number) { return `$${value.toFixed(4)}` }
function number(value: number) { return new Intl.NumberFormat("en-US").format(value) }
function formatBytes(value: number) { return value < 1024 * 1024 ? `${(value / 1024).toFixed(0)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB` }

export function EconomicsOverview() {
  const [data, setData] = useState<EconomicsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError(null)
    const { data: { session } } = await supabase.auth.getSession()
    const response = session?.access_token ? await fetch("/api/systems/economics", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" }) : null
    if (!response?.ok) { setError("Unable to load AI usage telemetry."); setLoading(false); return }
    setData(await response.json() as EconomicsData)
    setLoading(false)
  }

  useEffect(() => { void load() }, [])
  if (loading) return <div className="glass-surface rounded-3xl p-8 text-sm text-muted-foreground">Loading processing economics…</div>
  if (error || !data) return <div className="glass-surface rounded-3xl p-8"><p className="text-sm text-destructive">{error ?? "Telemetry unavailable."}</p><Button variant="outline" size="sm" onClick={() => void load()} className="mt-5 gap-2"><RefreshCw className="h-4 w-4" />Retry</Button></div>

  const t = data.totals
  return <section className="space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Internal economics</p><h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">What does processing cost?</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">A 30-day view of provider usage across normalization and reprocess attempts. This measures infrastructure cost; it does not change customer billing.</p></div><Button variant="outline" size="sm" onClick={() => void load()} className="gap-2"><RefreshCw className="h-4 w-4" />Refresh</Button></div>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Internal provider cost" value={money(t.internalCostUsd)} /><Metric label="Retry cost" value={money(t.retryCostUsd)} detail={`${number(t.retries)} retry calls · not billable`} /><Metric label="AI calls" value={number(t.calls)} detail={`${number(t.inputTokens)} in · ${number(t.outputTokens)} out`} /><Metric label="Failures / fallbacks" value={`${number(t.failures)} / ${number(t.fallbacks)}`} detail={`${number(data.eventCount)} recorded events`} /></div>
    <div className="grid gap-4 lg:grid-cols-2"><Panel title="Cost by workload"><Rows rows={data.byWorkload.map((row) => ({ label: row.workloadClass, detail: `${row.files} files · ${row.calls} calls · ${row.retries} retries · ${money(row.averageCostPerFile)} avg/file · ${Math.round(row.averageDurationMs)} ms avg/call`, value: money(row.cost) }))} /></Panel><Panel title="Cost by operation"><Rows rows={data.byOperation.map((row) => ({ label: row.operation.replaceAll("_", " "), detail: `${row.calls} calls · ${row.retries} retries`, value: money(row.cost) }))} /></Panel></div>
    <div className="grid gap-4 lg:grid-cols-2"><Panel title="Provider and model"><Rows rows={data.byProvider.map((row) => ({ label: row.provider, detail: `${row.model} · ${row.calls} calls`, value: money(row.cost) }))} /></Panel><Panel title="Uploaded file sizes"><Rows rows={data.bySize.map((row) => ({ label: row.label, detail: `${row.files} files observed`, value: "" }))} empty="No file-size events recorded yet." /></Panel></div>
    <Panel title="Highest-cost source documents"><Rows rows={data.byFile.map((row) => ({ label: row.fileId === "unattributed" ? "Unattributed event" : `${row.fileId.slice(0, 8)}…`, detail: `${row.fileType} · ${row.fileSizeBytes == null ? "size unknown" : formatBytes(row.fileSizeBytes)} · ${row.calls} calls · ${row.retries} retries`, value: money(row.cost) }))} empty="No document events recorded yet." /></Panel>
    <div className="glass-surface rounded-2xl border border-primary/20 p-5 text-sm leading-relaxed text-muted-foreground"><span className="font-medium text-foreground">Retry policy:</span> retries and provider fallback attempts are recorded as real infrastructure cost, but the ledger marks reprocess attempts non-billable by default. This gives us the exposure data needed before deciding whether a future plan should include a fair-use rule.</div>
  </section>
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) { return <div className="glass-surface rounded-2xl p-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>{detail ? <p className="mt-2 text-xs text-muted-foreground">{detail}</p> : null}</div> }
function Panel({ title, children }: { title: string; children: React.ReactNode }) { return <div className="glass-surface rounded-2xl p-5"><h3 className="text-sm font-semibold uppercase tracking-[0.12em] text-primary">{title}</h3><div className="mt-4">{children}</div></div> }
function Rows({ rows, empty }: { rows: { label: string; detail: string; value: string }[]; empty?: string }) { if (!rows.length) return <p className="text-sm text-muted-foreground">{empty ?? "No usage events recorded yet. New events will appear after the next provider call."}</p>; return <div className="divide-y divide-border">{rows.map((row) => <div key={`${row.label}-${row.detail}`} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate text-sm font-medium capitalize">{row.label}</p><p className="mt-1 truncate text-xs text-muted-foreground">{row.detail}</p></div><span className="shrink-0 font-mono text-xs text-foreground">{row.value}</span></div>)}</div> }
