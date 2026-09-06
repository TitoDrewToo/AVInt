"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, Download, Loader2, Pencil, Play, Plus, Sparkles, Trash2, X } from "lucide-react"

import { ReportDocumentView } from "@/components/report-document-view"
import { Tip } from "@/components/ui/tip"
import type { ReportDocument } from "@/lib/report-document"
import type { ReportDefinition, ReportDefinitionInput, ReportDefinitionListItem } from "@/lib/report-definitions"
import { supabase } from "@/lib/supabase"

function starterDefinition(folderId: string | null): ReportDefinitionInput {
  return {
    title: "Monthly Operations Report",
    description: "A refreshable summary of current Smart Storage records.",
    source: { kind: "records" },
    scope: folderId ? { folderId } : null,
    period: { kind: "rolling", unit: "month", count: 1, offset: -1 },
    filters: [],
    blocks: [
      { type: "kpi", items: [{ label: "Records", metric: { aggregation: "count" } }, { label: "Total amount", metric: { aggregation: "sum", field: "amount" } }] },
      { type: "share", title: "Amount by category", groupBy: "category", metric: { aggregation: "sum", field: "amount" }, limit: 12 },
      { type: "table", title: "Record detail", columns: [{ field: "occurred_on", label: "Date" }, { field: "counterparty", label: "Counterparty" }, { field: "category", label: "Category" }, { field: "amount", label: "Amount" }, { field: "currency", label: "Currency" }], sort: { field: "occurred_on", direction: "desc" }, limit: 100 },
    ],
    theme: null,
  }
}

export function SavedReportManager({ folderId }: { folderId: string | null }) {
  const [definitions, setDefinitions] = useState<ReportDefinitionListItem[]>([])
  const [selected, setSelected] = useState<ReportDefinitionListItem | null>(null)
  const [document, setDocument] = useState<ReportDocument | null>(null)
  const [editor, setEditor] = useState<string | null>(null)
  const [editingSlug, setEditingSlug] = useState<string | null>(null)
  const [editingVersion, setEditingVersion] = useState<number | null>(null)
  const [assistantPrompt, setAssistantPrompt] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const token = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? "", [])
  const load = useCallback(async () => {
    const auth = await token()
    if (!auth) return
    const response = await fetch("/api/report-definitions", { headers: { Authorization: `Bearer ${auth}` } })
    const payload = await response.json().catch(() => null)
    if (response.ok) setDefinitions(payload?.definitions ?? [])
    else setError(payload?.error ?? "Saved reports could not be loaded.")
  }, [token])
  useEffect(() => { void load() }, [load])

  async function run(definition: ReportDefinitionListItem) {
    setBusy(true); setError(null); setSelected(definition)
    try {
      const auth = await token()
      const response = await fetch(`/api/report-definitions/${definition.slug}/run`, { method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ format: "json" }) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "The report could not be run.")
      setDocument(payload.document)
    } catch (runError) { setError(runError instanceof Error ? runError.message : "The report could not be run.") } finally { setBusy(false) }
  }
  async function edit(definition: ReportDefinitionListItem) {
    setBusy(true); setError(null)
    try {
      const auth = await token(); const response = await fetch(`/api/report-definitions/${definition.slug}`, { headers: { Authorization: `Bearer ${auth}` } }); const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "The definition could not be loaded.")
      const full = payload.definition as ReportDefinition
      const { title, description, source, scope, period, filters, blocks, theme } = full
      setEditor(JSON.stringify({ title, description, source, scope, period, filters, blocks, theme }, null, 2)); setEditingSlug(full.slug); setEditingVersion(full.version)
    } catch (editError) { setError(editError instanceof Error ? editError.message : "The definition could not be loaded.") } finally { setBusy(false) }
  }
  async function save() {
    if (!editor) return
    setBusy(true); setError(null)
    try {
      const definition = JSON.parse(editor); const auth = await token()
      const response = await fetch(editingSlug ? `/api/report-definitions/${editingSlug}` : "/api/report-definitions", { method: editingSlug ? "PATCH" : "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify(editingSlug ? { ...definition, expectedVersion: editingVersion } : definition) })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "The definition could not be saved.")
      setEditor(null); setEditingSlug(null); setEditingVersion(null); await load(); await run(payload.definition)
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "The definition could not be saved.") } finally { setBusy(false) }
  }
  async function propose() {
    if (!assistantPrompt.trim()) return
    setBusy(true); setError(null)
    try {
      const auth = await token(); const response = await fetch("/api/report-definitions/author", { method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ prompt: assistantPrompt }) }); const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "The assistant could not propose a report.")
      const proposal = payload.proposal as ReportDefinitionInput
      if (folderId && !proposal.scope?.folderId) proposal.scope = { folderId }
      setEditor(JSON.stringify(proposal, null, 2)); setEditingSlug(null); setEditingVersion(null)
    } catch (proposalError) { setError(proposalError instanceof Error ? proposalError.message : "The assistant could not propose a report.") } finally { setBusy(false) }
  }
  async function duplicate(definition: ReportDefinitionListItem) {
    setBusy(true); setError(null)
    try {
      const auth = await token(); const response = await fetch(`/api/report-definitions/${definition.slug}`, { headers: { Authorization: `Bearer ${auth}` } }); const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "The definition could not be loaded.")
      const full = payload.definition as ReportDefinition
      const { title, description, source, scope, period, filters, blocks, theme } = full
      setEditor(JSON.stringify({ title: `${title} Copy`, description, source, scope, period, filters, blocks, theme }, null, 2)); setEditingSlug(null); setEditingVersion(null)
    } catch (duplicateError) { setError(duplicateError instanceof Error ? duplicateError.message : "The definition could not be duplicated.") } finally { setBusy(false) }
  }
  async function archive(definition: ReportDefinitionListItem) {
    if (!window.confirm(`Archive ${definition.title}?`)) return
    const auth = await token(); const response = await fetch(`/api/report-definitions/${definition.slug}`, { method: "DELETE", headers: { Authorization: `Bearer ${auth}` } }); const payload = await response.json().catch(() => null)
    if (!response.ok) setError(payload?.error ?? "The report could not be archived.")
    else { if (selected?.slug === definition.slug) { setSelected(null); setDocument(null) }; await load() }
  }
  async function download() {
    if (!selected) return
    setBusy(true); setError(null)
    try {
      const auth = await token(); const response = await fetch(`/api/report-definitions/${selected.slug}/run`, { method: "POST", headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ format: "pdf" }) })
      if (!response.ok) { const payload = await response.json().catch(() => null); throw new Error(payload?.error ?? "PDF export failed.") }
      const url = URL.createObjectURL(await response.blob()); const anchor = window.document.createElement("a"); anchor.href = url; anchor.download = `${selected.slug}.pdf`; anchor.click(); URL.revokeObjectURL(url)
    } catch (downloadError) { setError(downloadError instanceof Error ? downloadError.message : "PDF export failed.") } finally { setBusy(false) }
  }

  return <section className="space-y-3 border-b border-border p-3">
    <div className="flex items-center justify-between"><div><p className="text-xs font-semibold">Saved reports</p><p className="text-[10px] text-muted-foreground">Refreshable definitions over your current data</p></div><button onClick={() => { setEditor(JSON.stringify(starterDefinition(folderId), null, 2)); setEditingSlug(null); setEditingVersion(null) }} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px]"><Plus className="h-3 w-3" />New</button></div>
    <div className="flex gap-1"><input value={assistantPrompt} onChange={(event) => setAssistantPrompt(event.target.value)} placeholder="Ask the assistant for a report…" className="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs" /><Tip text="Turn this request into a report definition for review."><button disabled={busy || !assistantPrompt.trim()} onClick={() => void propose()} className="rounded border border-primary/30 px-2 text-primary disabled:opacity-40" aria-label="Create report proposal"><Sparkles className="h-3.5 w-3.5" /></button></Tip></div>
    {error && <p className="rounded border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">{error}</p>}
    {editor && <div className="space-y-2 rounded-lg border border-primary/30 bg-background p-2"><div className="flex items-center justify-between"><p className="text-[10px] font-medium uppercase tracking-wider">{editingSlug ? `Edit ${editingSlug}` : "Review definition before saving"}</p><Tip text="Close the definition editor without saving."><button onClick={() => setEditor(null)} aria-label="Close report definition editor"><X className="h-3.5 w-3.5" /></button></Tip></div><textarea value={editor} onChange={(event) => setEditor(event.target.value)} className="h-64 w-full resize-y rounded border border-border bg-muted/20 p-2 font-mono text-[10px] outline-none" spellCheck={false} /><button disabled={busy} onClick={() => void save()} className="w-full rounded bg-primary px-2 py-1.5 text-xs text-primary-foreground">{busy ? "Validating…" : "Confirm and save"}</button></div>}
    <div className="max-h-44 space-y-1 overflow-y-auto">{definitions.map((definition) => <div key={definition.slug} className={`rounded-lg border p-2 ${selected?.slug === definition.slug ? "border-primary/50 bg-primary/5" : "border-border"}`}><button onClick={() => void run(definition)} className="w-full text-left"><p className="truncate text-xs font-medium">{definition.title}</p><p className="text-[10px] text-muted-foreground">{definition.slug} · v{definition.version} · {definition.authored_by}</p></button><div className="mt-2 flex gap-2 text-muted-foreground"><Tip text="Run this report against current records."><button aria-label={`Run ${definition.title}`} onClick={() => void run(definition)}><Play className="h-3 w-3" /></button></Tip><Tip text="Edit this report definition."><button aria-label={`Edit ${definition.title}`} onClick={() => void edit(definition)}><Pencil className="h-3 w-3" /></button></Tip><Tip text="Create a copy you can modify."><button aria-label={`Duplicate ${definition.title}`} onClick={() => void duplicate(definition)}><Copy className="h-3 w-3" /></button></Tip><Tip text="Archive this saved report."><button aria-label={`Archive ${definition.title}`} onClick={() => void archive(definition)}><Trash2 className="h-3 w-3" /></button></Tip></div></div>)}</div>
    {busy && <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />Working…</p>}
    {document && <div className="space-y-2"><div className="flex justify-end"><button onClick={() => void download()} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px]"><Download className="h-3 w-3" />PDF</button></div><ReportDocumentView document={document} /></div>}
  </section>
}
