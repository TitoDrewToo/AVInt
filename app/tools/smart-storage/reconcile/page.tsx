"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, CheckCircle2, GitCompareArrows, Loader2, TriangleAlert } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"

type Dataset = { id: string; name: string; file_id: string; row_count: number; files?: { filename?: string | null } | Array<{ filename?: string | null }> | null }
type Column = { dataset_id: string; key: string; label: string; data_type: string; role?: string | null }
type Result = { summary: { sourceARows: number; sourceBRows: number; matched: number; missingFromA: number; missingFromB: number; duplicates: number; conflicts: number; reconciliationRate: number }; discrepancies: Array<{ classification: string; key: Record<string, unknown>; sourceA: { filename: string; rowIndex: number; values: Record<string, unknown> } | null; sourceB: { filename: string; rowIndex: number; values: Record<string, unknown> } | null; fieldDifferences: Array<{ leftField: string; rightField: string; left: unknown; right: unknown; difference?: number }>; severity: string }> }

export default function ReconcilePage() {
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [columns, setColumns] = useState<Column[]>([])
  const [leftId, setLeftId] = useState("")
  const [rightId, setRightId] = useState("")
  const [keyField, setKeyField] = useState("")
  const [compareFields, setCompareFields] = useState<string[]>([])
  const [tolerance, setTolerance] = useState("0")
  const [title, setTitle] = useState("Source reconciliation")
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const loadModel = useCallback(async () => {
    const session = (await supabase.auth.getSession()).data.session
    if (!session) throw new Error("Sign in to use reconciliation")
    const response = await fetch("/api/data-model?page_size=100", { headers: { Authorization: `Bearer ${session.access_token}` } })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error ?? "The data model could not be loaded")
    setDatasets(payload.datasets ?? [])
    setColumns(payload.datasetColumns ?? [])
  }, [])

  useEffect(() => { void loadModel().catch((cause) => setError(cause instanceof Error ? cause.message : "The data model could not be loaded")) }, [loadModel])

  const sharedFields = useMemo(() => {
    if (!leftId || !rightId) return []
    const left = new Set(columns.filter((column) => column.dataset_id === leftId).map((column) => column.key))
    return columns.filter((column) => column.dataset_id === rightId && left.has(column.key)).map((column) => column.key)
  }, [columns, leftId, rightId])

  useEffect(() => {
    setKeyField((current) => current && sharedFields.includes(current) ? current : sharedFields.find((field) => /(^|_)(id|key|number)$/.test(field)) ?? sharedFields[0] ?? "")
    setCompareFields((current) => current.filter((field) => sharedFields.includes(field)))
  }, [sharedFields])

  const datasetLabel = (dataset: Dataset) => `${dataset.name} · ${Array.isArray(dataset.files) ? dataset.files[0]?.filename : dataset.files?.filename ?? "source file"} (${dataset.row_count} rows)`

  async function run() {
    setError(""); setResult(null)
    if (!leftId || !rightId || !keyField || compareFields.length === 0) { setError("Choose two datasets, a match key, and at least one comparison field."); return }
    setBusy(true)
    try {
      const session = (await supabase.auth.getSession()).data.session
      if (!session) throw new Error("Sign in to run reconciliation")
      const body = { title, sourceADatasetId: leftId, sourceBDatasetId: rightId, keyFields: [keyField], comparisons: compareFields.map((field) => { const type = columns.find((column) => column.dataset_id === leftId && column.key === field)?.data_type; return { leftField: field, rightField: field, kind: type === "number" ? "numeric_tolerance" : type === "date" ? "date" : "normalized_text", ...(type === "number" ? { tolerance: Number(tolerance) || 0 } : {}) } }) }
      const saved = await fetch("/api/reconciliations", { method: "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const savedPayload = await saved.json()
      if (!saved.ok) throw new Error(savedPayload.error ?? "The reconciliation could not be saved")
      const runResponse = await fetch(`/api/reconciliations/${savedPayload.definition.slug}/run`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      const runPayload = await runResponse.json()
      if (!runResponse.ok) throw new Error(runPayload.error ?? "The reconciliation could not be run")
      setResult(runPayload.result)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The reconciliation could not be run") } finally { setBusy(false) }
  }

  return <div className="min-h-screen bg-background text-foreground">
    <Navbar wide />
    <main className="mx-auto max-w-6xl px-5 py-10">
      <Link href="/tools/smart-storage" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to Smart Storage</Link>
      <div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><GitCompareArrows className="h-5 w-5" /></div><div><p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Investigation workspace</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Reconcile two sources</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Compare normalized files, preserve the evidence, and surface the exact rows that need attention.</p></div></div>
          <div className="mt-7 space-y-5">
            <label className="block text-sm font-medium">Report name<Input className="mt-2" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} /></label>
            <label className="block text-sm font-medium">Source A<select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={leftId} onChange={(event) => setLeftId(event.target.value)}><option value="">Choose a dataset</option>{datasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{datasetLabel(dataset)}</option>)}</select></label>
            <label className="block text-sm font-medium">Source B<select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={rightId} onChange={(event) => setRightId(event.target.value)}><option value="">Choose a dataset</option>{datasets.filter((dataset) => dataset.id !== leftId).map((dataset) => <option key={dataset.id} value={dataset.id}>{datasetLabel(dataset)}</option>)}</select></label>
            {sharedFields.length > 0 && <>
              <label className="block text-sm font-medium">Match key<select className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={keyField} onChange={(event) => setKeyField(event.target.value)}>{sharedFields.map((field) => <option key={field} value={field}>{field}</option>)}</select></label>
              <fieldset><legend className="text-sm font-medium">Fields to compare</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{sharedFields.filter((field) => field !== keyField).map((field) => <label key={field} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"><input type="checkbox" checked={compareFields.includes(field)} onChange={(event) => setCompareFields((current) => event.target.checked ? [...current, field] : current.filter((item) => item !== field))} />{field}</label>)}</div></fieldset>
              <label className="block text-sm font-medium">Numeric tolerance<span className="ml-2 text-xs font-normal text-muted-foreground">absolute difference</span><Input className="mt-2" type="number" min="0" step="0.01" value={tolerance} onChange={(event) => setTolerance(event.target.value)} /></label>
            </>}
            {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <Button className="w-full" onClick={() => void run()} disabled={busy || sharedFields.length === 0}>{busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Comparing sources…</> : <><ArrowRight className="mr-2 h-4 w-4" />Run and save reconciliation</>}</Button>
          </div>
        </section>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-center justify-between"><div><p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Evidence report</p><h2 className="mt-1 text-xl font-semibold">Findings</h2></div>{result && <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4" />Saved and refreshed</span>}</div>
          {!result ? <div className="flex min-h-[420px] items-center justify-center text-center text-sm text-muted-foreground"><div className="max-w-sm"><GitCompareArrows className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" /><p>Choose two normalized datasets to see matched rows, missing records, duplicates, and field conflicts.</p></div></div> : <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Source A", result.summary.sourceARows], ["Source B", result.summary.sourceBRows], ["Matched", result.summary.matched], ["Conflicts", result.summary.conflicts]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}</div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-950"><p className="font-medium">What needs attention</p><p className="mt-1">{result.summary.missingFromA} missing from Source A · {result.summary.missingFromB} missing from Source B · {result.summary.duplicates} duplicate rows · reconciliation rate {(result.summary.reconciliationRate * 100).toFixed(2)}%.</p></div>
            <div className="mt-6 overflow-x-auto rounded-xl border border-border"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-3 py-3">Finding</th><th className="px-3 py-3">Key</th><th className="px-3 py-3">Evidence</th><th className="px-3 py-3">Difference</th></tr></thead><tbody className="divide-y divide-border">{result.discrepancies.slice(0, 100).map((item, index) => <tr key={`${item.classification}-${index}`} className="align-top"><td className="px-3 py-3"><span className="inline-flex items-center gap-1 font-medium"><TriangleAlert className="h-3.5 w-3.5 text-amber-600" />{item.classification.replaceAll("_", " ")}</span></td><td className="px-3 py-3 font-mono text-xs">{Object.values(item.key).join(" · ")}</td><td className="px-3 py-3 text-xs leading-5 text-muted-foreground">{item.sourceA ? `${item.sourceA.filename} · row ${item.sourceA.rowIndex}` : "—"}<br />{item.sourceB ? `${item.sourceB.filename} · row ${item.sourceB.rowIndex}` : "—"}</td><td className="px-3 py-3 text-xs">{item.fieldDifferences.length ? item.fieldDifferences.map((diff) => <div key={`${diff.leftField}-${diff.rightField}`}><span className="font-medium">{diff.leftField}</span>: {String(diff.left ?? "—")} → {String(diff.right ?? "—")}{diff.difference !== undefined ? ` (${diff.difference})` : ""}</div>) : "—"}</td></tr>)}</tbody></table></div>{result.discrepancies.length > 100 && <p className="mt-3 text-xs text-muted-foreground">Showing the first 100 discrepancies; the saved definition can be refreshed for the complete result.</p>}</>}
        </section>
      </div>
    </main>
  </div>
}
