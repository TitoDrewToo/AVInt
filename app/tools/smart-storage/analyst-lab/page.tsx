"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, CheckCircle2, ClipboardCheck, ShieldAlert } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { evaluateEodControls, profileDataQuality, type AnalystRow, type QualityRule } from "@/lib/analyst-workflows"

const sampleRows: AnalystRow[] = [
  { transaction_id: "TX-1001", business_date: "2026-09-14", status: "posted", amount: 12500, source: "ledger" },
  { transaction_id: "TX-1002", business_date: "2026-09-14", status: "posted", amount: 8900, source: "ledger" },
  { transaction_id: "TX-1002", business_date: "2026-09-14", status: "posted", amount: 8900, source: "ledger" },
  { transaction_id: "TX-1003", business_date: "2026-09-14", status: "pending", amount: -40, source: "ledger" },
]

const rules: QualityRule[] = [
  { kind: "required", field: "transaction_id" },
  { kind: "required", field: "business_date" },
  { kind: "allowed_values", field: "status", values: ["posted", "pending", "reversed"] },
  { kind: "numeric_range", field: "amount", min: 0 },
  { kind: "unique", field: "transaction_id" },
]

export default function AnalystLabPage() {
  const sampleQuality = useMemo(() => profileDataQuality(sampleRows, rules), [])
  const [quality, setQuality] = useState(sampleQuality)
  const [datasets, setDatasets] = useState<Array<{ id: string; name: string }>>([])
  const [folders, setFolders] = useState<Array<{ id: string; name: string }>>([])
  const [scope, setScope] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState("")
  const loadScopes = useCallback(async () => {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) return
    const [modelResponse, folderResponse] = await Promise.all([
      fetch("/api/data-model?page_size=1", { headers: { Authorization: `Bearer ${session.access_token}` } }),
      supabase.from("folders").select("id, name").order("name"),
    ])
    if (modelResponse.ok) { const payload = await modelResponse.json(); setDatasets((payload.datasets ?? []).map((item: { id: string; name: string }) => ({ id: item.id, name: item.name }))) }
    if (!folderResponse.error) setFolders(folderResponse.data ?? [])
  }, [])
  useEffect(() => { void loadScopes() }, [loadScopes])
  async function runLive() {
    setMessage(""); setBusy(true)
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session || !scope) throw new Error("Choose a dataset or folder first")
      const isFolder = folders.some((folder) => folder.id === scope)
      const response = await fetch("/api/analyst/quality", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ [isFolder ? "folderId" : "datasetId"]: scope, rules }) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "Quality profile failed")
      setQuality(payload.result); setMessage(`Profiled ${payload.datasets?.length ?? 1} owned ${isFolder ? "folder dataset(s)" : "dataset"}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : "Quality profile failed") } finally { setBusy(false) }
  }
  const eod = useMemo(() => evaluateEodControls({ expectedRows: 3, actualRows: 4, expectedTotal: 21400, actualTotal: 30260, expectedFeeds: ["ledger", "settlement"], receivedFeeds: ["ledger"] }), [])
  return <div className="min-h-screen bg-background text-foreground"><Navbar wide /><main className="mx-auto max-w-6xl px-5 py-10">
    <Link href="/tools/smart-storage" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to Smart Storage</Link>
    <div className="mt-8 max-w-3xl"><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Analyst workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Quality checks before the report</h1><p className="mt-3 text-base leading-7 text-muted-foreground">A compact control layer for reconciliation, data-quality investigation, and end-of-day checks. It names the rows and feeds that need attention before a conclusion is written.</p></div>
    <section className="mt-7 rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="flex-1 text-sm font-medium">Lock scope to a dataset or folder<select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={scope} onChange={(event) => setScope(event.target.value)}><option value="">Synthetic example (no account data)</option>{folders.length > 0 && <optgroup label="Folders">{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name} · folder</option>)}</optgroup>}{datasets.length > 0 && <optgroup label="Datasets">{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</optgroup>}</select></label><Button onClick={() => void runLive()} disabled={!scope || busy}>{busy ? "Profiling…" : "Run quality profile"}</Button></div>{message && <p className="mt-3 text-sm text-muted-foreground" role="status">{message}</p>}</section>
    <div className="mt-8 grid gap-6 lg:grid-cols-2">
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Data quality profile</p><h2 className="mt-1 text-xl font-semibold">{quality.score * 100}% clean</h2></div><ClipboardCheck className="h-5 w-5 text-primary" /></div><p className="mt-3 text-sm text-muted-foreground">{quality.findings.length} findings across {quality.rowCount} rows · {quality.cleanRows} clean rows. Missing: {quality.summary.missingRequired}; invalid: {quality.summary.invalidValues}; range: {quality.summary.outOfRange}; duplicates: {quality.summary.duplicates}.</p><div className="mt-5 space-y-2">{quality.findings.map((finding) => <div key={`${finding.classification}-${finding.rowIndex}-${finding.field}`} className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-950"><span className="font-medium">Row {finding.rowIndex + 1} · {finding.classification.replaceAll("_", " ")}</span>{finding.field ? ` · ${finding.field}` : ""}{finding.message ? ` — ${finding.message}` : ""}</div>)}</div></section>
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">EOD control</p><h2 className="mt-1 text-xl font-semibold">{eod.status === "clear" ? "Clear to report" : "Control breaks found"}</h2></div>{eod.status === "clear" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}</div><p className="mt-3 text-sm text-muted-foreground">{eod.findings.length ? `${eod.findings.length} control checks need review before sign-off.` : "All configured control checks passed."}</p><div className="mt-5 space-y-2">{eod.findings.map((finding) => <div key={finding} className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-sm text-amber-950">{finding}</div>)}</div></section>
    </div>
    <p className="mt-8 text-xs text-muted-foreground">This lab uses synthetic rows. Connect it to a saved reconciliation or report definition once the workflow is approved for production use.</p>
  </main></div>
}
