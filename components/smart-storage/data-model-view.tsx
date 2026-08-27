"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { AlertCircle, ChevronLeft, ChevronRight, Database, ExternalLink, GitBranch, RefreshCw, Search, Table2, X } from "lucide-react"

import type { UploadedFile } from "@/lib/smart-storage"
import { supabase } from "@/lib/supabase"

type DataModelViewProps = {
  files: UploadedFile[]
  onReclassify?: (file: UploadedFile) => void
  onManualEntry?: () => void
  onRetry?: (file: UploadedFile) => void
  onOpenSource?: (file: UploadedFile) => void
}

type ModelView = "lineage" | "schema"
type RecordStatus = "raw" | "normalized" | "manual" | "failed"

type VirtualRecord = {
  id: string
  file_id: string
  document_type: string | null
  record_type: string
  status: RecordStatus
  normalization_version: number | null
  created_at: string
  updated_at: string
}

type VirtualField = {
  id: string
  virtual_record_id: string
  field_key: string
  value: unknown
  value_type: string
  confidence: number | null
  is_custom: boolean
  source_evidence: Record<string, unknown>
}

type CatalogField = {
  field_key: string
  label: string
  value_types: string[]
  occurrence_count: number
  is_custom: boolean
  source_kinds: string[]
}

type VirtualModel = {
  records: VirtualRecord[]
  fields: VirtualField[]
  catalog: CatalogField[]
}

type RecordVersion = {
  id: string
  version_number: number
  status: RecordStatus
  normalization_version: number | null
  change_reason: string
  captured_at: string
}

type HistoryField = {
  version_id: string
  field_key: string
  value: unknown
  value_type: string
  confidence: number | null
  is_custom: boolean
  source_evidence: Record<string, unknown>
}

type StatusCounts = Record<RecordStatus, number>


const STATUS_FILTERS: Array<{ value: "all" | RecordStatus; label: string }> = [
  { value: "all", label: "All states" },
  { value: "normalized", label: "Ready" },
  { value: "manual", label: "Manual" },
  { value: "raw", label: "In progress" },
  { value: "failed", label: "Attention" },
]
const RECORDS_PER_PAGE = 40

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "object") return JSON.stringify(value)
  return String(value)
}

function formatStatus(status: string) {
  return status === "normalized" ? "ready" : status === "manual" ? "manual" : status === "failed" ? "attention" : "in progress"
}

function shortDate(value: string | null | undefined) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

export function DataModelView({ files, onReclassify, onManualEntry, onRetry, onOpenSource }: DataModelViewProps) {
  const [view, setView] = useState<ModelView>("lineage")
  const [virtualModel, setVirtualModel] = useState<VirtualModel | null>(null)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [selectedFieldKey, setSelectedFieldKey] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState<"all" | RecordStatus>("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [customOnly, setCustomOnly] = useState(false)
  const [recordPage, setRecordPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMoreModelRecords, setHasMoreModelRecords] = useState(false)
  const [nextModelPage, setNextModelPage] = useState<number | null>(null)
  const [totalModelRecords, setTotalModelRecords] = useState(0)
  const [statusCounts, setStatusCounts] = useState<StatusCounts>({ raw: 0, normalized: 0, manual: 0, failed: 0 })
  const [error, setError] = useState<string | null>(null)

  const loadVirtualModel = useCallback(async () => {
    setLoading(true)
    setError(null)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) {
      setVirtualModel(null)
      setError("Sign in to inspect your data model.")
      setLoading(false)
      return
    }
    const response = await fetch("/api/virtual-records?page=0&page_size=100", { headers: { Authorization: `Bearer ${token}` } })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(typeof payload?.error === "string" ? payload.error : "The data model could not be loaded.")
      setVirtualModel(null)
    } else {
      setVirtualModel({ records: (payload.records ?? []) as VirtualRecord[], fields: (payload.fields ?? []) as VirtualField[], catalog: (payload.catalog ?? []) as CatalogField[] })
      setHasMoreModelRecords(payload.has_more === true)
      setNextModelPage(typeof payload.next_page === "number" ? payload.next_page : null)
      setTotalModelRecords(typeof payload.total === "number" ? payload.total : (payload.records ?? []).length)
      setStatusCounts({ raw: payload.status_counts?.raw ?? 0, normalized: payload.status_counts?.normalized ?? 0, manual: payload.status_counts?.manual ?? 0, failed: payload.status_counts?.failed ?? 0 })
    }
    setLoading(false)
  }, [])

  const loadMoreVirtualModel = useCallback(async () => {
    if (loadingMore || nextModelPage === null) return
    setLoadingMore(true)
    setError(null)
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) {
      setError("Sign in to inspect your data model.")
      setLoadingMore(false)
      return
    }
    const response = await fetch(`/api/virtual-records?page=${nextModelPage}&page_size=100`, { headers: { Authorization: `Bearer ${token}` } })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      setError(typeof payload?.error === "string" ? payload.error : "More data model records could not be loaded.")
    } else {
      setVirtualModel((current) => {
        if (!current) return { records: (payload.records ?? []) as VirtualRecord[], fields: (payload.fields ?? []) as VirtualField[], catalog: (payload.catalog ?? []) as CatalogField[] }
        const records = [...current.records, ...((payload.records ?? []) as VirtualRecord[])].filter((record, index, all) => all.findIndex((item) => item.id === record.id) === index)
        const fields = [...current.fields, ...((payload.fields ?? []) as VirtualField[])].filter((field, index, all) => all.findIndex((item) => item.id === field.id) === index)
        const catalog = [...current.catalog, ...((payload.catalog ?? []) as CatalogField[])].reduce<CatalogField[]>((merged, field) => {
          const existing = merged.find((item) => item.field_key === field.field_key)
          if (!existing) merged.push(field)
          else {
            existing.occurrence_count = Math.max(existing.occurrence_count, field.occurrence_count)
            existing.value_types = [...new Set([...existing.value_types, ...field.value_types])]
            existing.source_kinds = [...new Set([...existing.source_kinds, ...field.source_kinds])]
            existing.is_custom = existing.is_custom || field.is_custom
          }
          return merged
        }, [])
        return { records, fields, catalog }
      })
      setHasMoreModelRecords(payload.has_more === true)
      setNextModelPage(typeof payload.next_page === "number" ? payload.next_page : null)
      if (typeof payload.total === "number") setTotalModelRecords(payload.total)
      setStatusCounts({ raw: payload.status_counts?.raw ?? 0, normalized: payload.status_counts?.normalized ?? 0, manual: payload.status_counts?.manual ?? 0, failed: payload.status_counts?.failed ?? 0 })
    }
    setLoadingMore(false)
  }, [loadingMore, nextModelPage])

  useEffect(() => { void loadVirtualModel() }, [loadVirtualModel, files])

  const model = virtualModel ?? { records: [], fields: [], catalog: [] }
  const fileById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files])
  const types = useMemo(() => [...new Set(model.records.map((record) => record.document_type).filter(Boolean))] as string[], [model.records])
  const filteredRecords = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return model.records.filter((record) => {
      if (status !== "all" && record.status !== status) return false
      if (typeFilter !== "all" && record.document_type !== typeFilter) return false
      const file = fileById.get(record.file_id)
      const recordFields = model.fields.filter((field) => field.virtual_record_id === record.id)
      if (customOnly && !recordFields.some((field) => field.is_custom)) return false
      if (!needle) return true
      return [file?.filename, record.document_type, record.record_type, ...recordFields.map((field) => field.field_key)].some((value) => String(value ?? "").toLowerCase().includes(needle))
    })
  }, [customOnly, fileById, model.fields, model.records, query, status, typeFilter])

  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / RECORDS_PER_PAGE))
  const visibleRecords = filteredRecords.slice(recordPage * RECORDS_PER_PAGE, (recordPage + 1) * RECORDS_PER_PAGE)
  const visibleCatalog = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return model.catalog.filter((field) => {
      if (customOnly && !field.is_custom) return false
      if (!needle) return true
      return [field.field_key, field.label, ...field.value_types, ...field.source_kinds].some((value) => value.toLowerCase().includes(needle))
    })
  }, [customOnly, model.catalog, query])

  useEffect(() => {
    setRecordPage(0)
  }, [query, status, typeFilter, customOnly])

  useEffect(() => {
    if (recordPage >= pageCount) setRecordPage(pageCount - 1)
  }, [pageCount, recordPage])

  const selectedRecord = filteredRecords.find((record) => record.id === selectedRecordId)
    ?? (selectedFieldKey ? filteredRecords.find((record) => model.fields.some((field) => field.virtual_record_id === record.id && field.field_key === selectedFieldKey)) : null)
    ?? filteredRecords[0]
    ?? null
  const selectedFile = selectedRecord ? fileById.get(selectedRecord.file_id) : undefined
  const selectedFields = selectedRecord ? model.fields.filter((field) => field.virtual_record_id === selectedRecord.id) : []
  const selectedField = selectedFields.find((field) => field.field_key === selectedFieldKey) ?? null
  const readyCount = statusCounts.normalized + statusCounts.manual
  const attentionCount = statusCounts.failed
  const customCount = model.catalog.filter((field) => field.is_custom).length

  function chooseRecord(record: VirtualRecord) {
    setSelectedRecordId(record.id)
    setSelectedFieldKey(null)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0"><p className="font-aldrich text-[10px] uppercase tracking-[0.18em] text-primary">Data Model</p><h2 className="mt-1 truncate text-sm font-semibold text-foreground">Understand the data behind your workspace</h2></div>
        <div className="flex items-center gap-2 pr-10"><button type="button" onClick={() => void loadVirtualModel()} className="cw-button-flow flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[11px] text-muted-foreground" aria-label="Refresh data model"><RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} /> Refresh</button><div className="flex items-center rounded-lg border border-border p-0.5"><button type="button" onClick={() => setView("lineage")} aria-pressed={view === "lineage"} className={`cw-button-flow flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] ${view === "lineage" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}><GitBranch className="h-3.5 w-3.5" /> Map</button><button type="button" onClick={() => setView("schema")} aria-pressed={view === "schema"} className={`cw-button-flow flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] ${view === "schema" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}><Table2 className="h-3.5 w-3.5" /> Schema</button></div></div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-border p-4 sm:grid-cols-5">{[["Sources", files.length], ["Records", totalModelRecords], ["Ready", readyCount], ["Attention", attentionCount], ["Custom fields", customCount]].map(([label, value]) => <div key={String(label)} className="glass-surface-sm rounded-lg p-3"><p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold text-foreground">{value}</p></div>)}</div>
        <ReconciliationPanel />
        {error && <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
        {loading && !virtualModel ? <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">Reading your account-scoped data model…</div> : model.records.length === 0 ? <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center"><Database className="h-8 w-8 text-primary/60" /><p className="text-sm font-medium text-foreground">Your data model is waiting for source files</p><p className="max-w-sm text-xs leading-relaxed text-muted-foreground">Upload a document or add a manual record to see sources, records, fields, and downstream possibilities here.</p>{onManualEntry && <button type="button" onClick={onManualEntry} className="cw-button-flow mt-2 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">Add a manual record</button>}</div> : <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex flex-wrap items-center gap-2"><label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-border bg-card/40 px-3 py-2"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search files, record types, or fields" className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground" /></label><select value={status} onChange={(event) => setStatus(event.target.value as "all" | RecordStatus)} className="rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-foreground">{STATUS_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}</select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-lg border border-border bg-card/40 px-3 py-2 text-xs text-foreground"><option value="all">All document types</option>{types.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}</select><button type="button" onClick={() => setCustomOnly((value) => !value)} aria-pressed={customOnly} className={`cw-button-flow rounded-lg border px-3 py-2 text-xs ${customOnly ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>Custom fields</button></div>
          {view === "lineage" ? <div className="grid min-h-[380px] gap-3 lg:grid-cols-[1fr_1fr_1fr]"><LineageColumn title="Sources" subtitle={`${files.length} files`} icon={<Database className="h-3.5 w-3.5" />}>{files.length === 0 ? <EmptyLine>Source files will appear here.</EmptyLine> : files.map((file) => { const records = filteredRecords.filter((record) => record.file_id === file.id); return <button key={file.id} type="button" onClick={() => records[0] && chooseRecord(records[0])} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedFile?.id === file.id ? "border-primary/50 bg-primary/10" : "border-border/70 bg-card/40 hover:bg-muted/50"}`}><p className="truncate text-xs font-medium text-foreground">{file.filename}</p><p className="mt-1 text-[11px] text-muted-foreground">{records.length} record{records.length === 1 ? "" : "s"} · {file.document_type || "unclassified"}</p></button> })}</LineageColumn><LineageColumn title="Virtual records" subtitle={`${filteredRecords.length} matching · page ${recordPage + 1} of ${pageCount}`} icon={<Table2 className="h-3.5 w-3.5" />}>{filteredRecords.length === 0 ? <EmptyLine>No records match these filters.</EmptyLine> : visibleRecords.map((record) => <button key={record.id} type="button" onClick={() => chooseRecord(record)} className={`w-full rounded-lg border p-3 text-left transition-colors ${selectedRecord?.id === record.id ? "border-primary/50 bg-primary/10" : "border-border/70 bg-card/40 hover:bg-muted/50"}`}><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-medium text-foreground">{record.record_type.replace(/_/g, " ")}</p><span className="font-mono text-[10px] text-muted-foreground">{formatStatus(record.status)}</span></div><p className="mt-1 text-[11px] text-muted-foreground">{record.document_type || "general document"} · {model.fields.filter((field) => field.virtual_record_id === record.id).length} fields</p></button>)}</LineageColumn><LineageColumn title="Fields" subtitle={selectedRecord ? `${selectedFields.length} on selected record` : "Select a record"} icon={<GitBranch className="h-3.5 w-3.5" />}>{!selectedRecord ? <EmptyLine>Select a source or record to inspect its fields.</EmptyLine> : selectedFields.length === 0 ? <EmptyLine>This record has no projected fields yet.</EmptyLine> : selectedFields.map((field) => <button key={field.id} type="button" onClick={() => { setSelectedRecordId(selectedRecord.id); setSelectedFieldKey(field.field_key) }} className={`w-full rounded-lg border p-3 text-left ${selectedField?.id === field.id ? "border-primary/50 bg-primary/10" : "border-border/70 bg-card/40 hover:bg-muted/50"}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-mono text-[11px] text-foreground">{field.field_key}</span>{field.is_custom && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] text-primary">custom</span>}</div><p className="mt-1 truncate text-[11px] text-muted-foreground">{formatValue(field.value)}</p></button>)}</LineageColumn></div> : <div className="grid min-h-[380px] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]"><div className="overflow-hidden rounded-xl border border-border bg-card/40"><div className="grid grid-cols-[minmax(0,1fr)_100px_100px_90px] gap-3 border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"><span>Field catalog</span><span>Type</span><span>Seen</span><span>Source</span></div>{visibleCatalog.map((field) => <button key={field.field_key} type="button" onClick={() => setSelectedFieldKey(field.field_key)} className={`grid w-full grid-cols-[minmax(0,1fr)_100px_100px_90px] gap-3 border-b border-border/60 px-3 py-3 text-left last:border-0 hover:bg-muted/40 ${selectedFieldKey === field.field_key ? "bg-primary/10" : ""}`}><span className="truncate"><span className="block text-xs text-foreground">{field.label}</span><span className="font-mono text-[10px] text-muted-foreground">{field.field_key}</span></span><span className="truncate font-mono text-[10px] text-muted-foreground">{field.value_types.join(", ") || "—"}</span><span className="font-mono text-[10px] text-muted-foreground">{field.occurrence_count}</span><span className="truncate font-mono text-[10px] text-muted-foreground">{field.source_kinds.join(", ") || "—"}</span></button>)}{visibleCatalog.length === 0 && <EmptyLine>No catalog fields match these filters.</EmptyLine>}</div><RecordDetail record={selectedRecord} file={selectedFile} fields={selectedFields} selectedField={selectedField} onSelectField={setSelectedFieldKey} onReclassify={onReclassify} onRetry={onRetry} onOpenSource={onOpenSource} /></div>}
          {view === "lineage" && selectedRecord && <RecordDetail record={selectedRecord} file={selectedFile} fields={selectedFields} selectedField={selectedField} onSelectField={setSelectedFieldKey} onReclassify={onReclassify} onRetry={onRetry} onOpenSource={onOpenSource} />}
          {view === "lineage" && pageCount > 1 && <div className="flex items-center justify-center gap-3"><button type="button" disabled={recordPage === 0} onClick={() => setRecordPage((page) => Math.max(0, page - 1))} className="cw-button-flow rounded-md border border-border p-1.5 text-muted-foreground disabled:opacity-40" aria-label="Previous record page"><ChevronLeft className="h-3.5 w-3.5" /></button><span className="font-mono text-[10px] text-muted-foreground">Showing {recordPage * RECORDS_PER_PAGE + 1}–{Math.min((recordPage + 1) * RECORDS_PER_PAGE, filteredRecords.length)} of {filteredRecords.length}</span><button type="button" disabled={recordPage === pageCount - 1} onClick={() => setRecordPage((page) => Math.min(pageCount - 1, page + 1))} className="cw-button-flow rounded-md border border-border p-1.5 text-muted-foreground disabled:opacity-40" aria-label="Next record page"><ChevronRight className="h-3.5 w-3.5" /></button></div>}
          {view === "lineage" && hasMoreModelRecords && <div className="flex justify-center"><button type="button" onClick={() => void loadMoreVirtualModel()} disabled={loadingMore} className="cw-button-flow rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground disabled:opacity-50">{loadingMore ? "Loading more records…" : "Load more records"}</button></div>}
        </div>}
      </div>
    </div>
  )
}

function LineageColumn({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode }) { return <section className="min-h-0 rounded-xl border border-border bg-card/40 p-3"><div className="mb-3 flex items-center gap-2"><span className="text-primary">{icon}</span><div><p className="text-xs font-semibold text-foreground">{title}</p><p className="text-[10px] text-muted-foreground">{subtitle}</p></div></div><div className="space-y-2 overflow-y-auto lg:max-h-[470px]">{children}</div></section> }

function EmptyLine({ children }: { children: ReactNode }) { return <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs leading-relaxed text-muted-foreground">{children}</p> }

function ReconciliationPanel() {
  const [summary, setSummary] = useState<{ source_files: number; represented_files: number; files_without_records: number; records_in_progress: number; records_needing_attention: number; custom_fields: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token
      if (!token) { if (!cancelled) setLoading(false); return }
      const response = await fetch("/api/virtual-records/reconciliation", { headers: { Authorization: `Bearer ${token}` } })
      const payload = await response.json().catch(() => null)
      if (cancelled) return
      if (!response.ok) setError(typeof payload?.error === "string" ? payload.error : "Reconciliation could not be loaded.")
      else setSummary(payload.summary ?? null)
      setLoading(false)
    }).catch(() => { if (!cancelled) { setError("Reconciliation could not be loaded."); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  if (loading || error || !summary) return null
  const issueCount = summary.files_without_records + summary.records_needing_attention + summary.records_in_progress
  return <div className="mx-4 mt-4 rounded-lg border border-border/70 bg-card/30 px-3 py-2 text-[11px]"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-mono uppercase tracking-wider text-muted-foreground">Reconciliation</span><span className={issueCount > 0 ? "text-amber-500" : "text-emerald-500"}>{issueCount > 0 ? `${issueCount} item${issueCount === 1 ? "" : "s"} to review` : "Sources and projections aligned"}</span></div><p className="mt-1 text-muted-foreground">{summary.represented_files} of {summary.source_files} source files represented · {summary.custom_fields} custom fields catalogued</p>{issueCount > 0 && <p className="mt-1 text-muted-foreground">{summary.files_without_records} without records · {summary.records_in_progress} in progress · {summary.records_needing_attention} failed</p>}</div>
}

function RecordDetail({ record, file, fields, selectedField, onSelectField, onReclassify, onRetry, onOpenSource }: { record: VirtualRecord | null; file?: UploadedFile; fields: VirtualField[]; selectedField: VirtualField | null; onSelectField: (key: string | null) => void; onReclassify?: (file: UploadedFile) => void; onRetry?: (file: UploadedFile) => void; onOpenSource?: (file: UploadedFile) => void }) {
  const [history, setHistory] = useState<RecordVersion[]>([])
  const [historyFields, setHistoryFields] = useState<HistoryField[]>([])
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [rollbackLoading, setRollbackLoading] = useState(false)
  const [rollbackError, setRollbackError] = useState<string | null>(null)

  useEffect(() => {
    if (!record) return
    let cancelled = false
    setHistoryLoading(true)
    setSelectedVersionId(null)
    supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token
      if (!token) {
        if (!cancelled) setHistoryLoading(false)
        return
      }
      const response = await fetch(`/api/virtual-records/${record.id}/history`, { headers: { Authorization: `Bearer ${token}` } })
      const payload = await response.json().catch(() => null)
      if (!cancelled && response.ok) {
        setHistory((payload?.versions ?? []) as RecordVersion[])
        setHistoryFields((payload?.fields ?? []) as HistoryField[])
      }
      if (!cancelled) setHistoryLoading(false)
    }).catch(() => { if (!cancelled) setHistoryLoading(false) })
    return () => { cancelled = true }
  }, [record])

  if (!record) return <section className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">Select a record to inspect its source, status, fields, and evidence.</section>

  const selectedVersion = history.find((version) => version.id === selectedVersionId) ?? null
  const selectedVersionFields = selectedVersion ? historyFields.filter((field) => field.version_id === selectedVersion.id) : []
  const comparison = selectedVersion ? [...new Set([...fields.map((field) => field.field_key), ...selectedVersionFields.map((field) => field.field_key)])].map((fieldKey) => {
    const current = fields.find((field) => field.field_key === fieldKey)
    const previous = selectedVersionFields.find((field) => field.field_key === fieldKey)
    const kind = !previous ? "added" : !current ? "removed" : JSON.stringify(current.value) !== JSON.stringify(previous.value) ? "changed" : "unchanged"
    return { fieldKey, current, previous, kind }
  }).filter((change) => change.kind !== "unchanged") : []

  async function rollbackToVersion(version: RecordVersion) {
    if (!record || rollbackLoading || !window.confirm(`Restore projection version ${version.version_number}? The source document will remain unchanged.`)) return
    setRollbackLoading(true)
    setRollbackError(null)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error("Sign in to restore a projection snapshot.")
      const response = await fetch(`/api/virtual-records/${record.id}/rollback`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ version_id: version.id }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "The projection could not be restored.")
      window.location.reload()
    } catch (rollbackFailure) {
      setRollbackError(rollbackFailure instanceof Error ? rollbackFailure.message : "The projection could not be restored.")
      setRollbackLoading(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-wider text-primary">Record detail</p>
          <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{file?.filename ?? record.record_type}</h3>
          <p className="mt-1 text-[11px] text-muted-foreground">{record.document_type || "general document"} · {formatStatus(record.status)} · updated {shortDate(record.updated_at)}</p>
        </div>
        <button type="button" onClick={() => onSelectField(null)} className="cw-button-flow rounded-md p-1.5 text-muted-foreground" aria-label="Clear field selection"><X className="h-3.5 w-3.5" /></button>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
        <div><span className="text-muted-foreground">Record type</span><p className="mt-0.5 text-foreground">{record.record_type}</p></div>
        <div><span className="text-muted-foreground">Normalization</span><p className="mt-0.5 text-foreground">{record.normalization_version ?? "Not versioned"}</p></div>
      </div>
      {record.status === "failed" && file?.normalization_error && <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-[11px] text-destructive">{file.normalization_error}</p>}

      <div className="mt-4 space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Projected fields</p>
        {fields.map((field) => <button key={field.id} type="button" onClick={() => onSelectField(field.field_key)} className={`w-full rounded-lg border p-2.5 text-left ${selectedField?.id === field.id ? "border-primary/50 bg-primary/10" : "border-border/70"}`}><div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] text-foreground">{field.field_key}</span><span className="font-mono text-[10px] text-muted-foreground">{field.value_type}</span></div><p className="mt-1 truncate text-[11px] text-muted-foreground">{formatValue(field.value)}</p></button>)}
      </div>

      {selectedField && <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3"><p className="font-mono text-[10px] uppercase tracking-wider text-primary">Field evidence</p><p className="mt-1 text-xs text-foreground">{selectedField.field_key}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">Confidence: {selectedField.confidence === null ? "not available" : `${Math.round(selectedField.confidence * 100)}%`}</p><pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words text-[10px] text-muted-foreground">{JSON.stringify(selectedField.source_evidence, null, 2)}</pre></div>}

      <div className="mt-4 rounded-lg border border-border/70 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Projection history</p>
          <span className="font-mono text-[10px] text-muted-foreground">{historyLoading ? "loading…" : `${history.length} version${history.length === 1 ? "" : "s"}`}</span>
        </div>
        {history.length > 0 && <div className="mt-2 space-y-2">{history.map((version) => <div key={version.id} className="rounded-md border border-border/70 p-2"><button type="button" onClick={() => setSelectedVersionId((current) => current === version.id ? null : version.id)} aria-pressed={selectedVersionId === version.id} className={`flex w-full items-center justify-between gap-3 text-left text-[11px] ${selectedVersionId === version.id ? "text-primary" : "text-foreground"}`}><span>v{version.version_number} · {version.change_reason.replace(/_/g, " ")}</span><span className="shrink-0 font-mono text-[10px] text-muted-foreground">{formatStatus(version.status)} · {shortDate(version.captured_at)}</span></button><button type="button" onClick={() => void rollbackToVersion(version)} disabled={rollbackLoading} className="mt-2 rounded border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50">{rollbackLoading ? "Restoring…" : "Restore this snapshot"}</button></div>)}</div>}
        {rollbackError && <p className="mt-2 text-[11px] text-destructive">{rollbackError}</p>}
        {!historyLoading && history.length === 0 && <p className="mt-2 text-[11px] text-muted-foreground">History will appear after the history migration is applied and the record is processed again.</p>}
        {selectedVersion && <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3"><div className="flex items-center justify-between gap-2"><p className="font-mono text-[10px] uppercase tracking-wider text-primary">Snapshot v{selectedVersion.version_number}</p><span className="font-mono text-[10px] text-muted-foreground">{selectedVersionFields.length} fields</span></div>{selectedVersionFields.length > 0 ? <div className="mt-2 space-y-2">{selectedVersionFields.map((field) => <div key={`${field.version_id}-${field.field_key}`} className="rounded-md border border-border/70 p-2"><div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] text-foreground">{field.field_key}</span><span className="font-mono text-[10px] text-muted-foreground">{field.value_type}</span></div><p className="mt-1 break-words text-[11px] text-muted-foreground">{formatValue(field.value)}</p></div>)}</div> : <p className="mt-2 text-[11px] text-muted-foreground">This snapshot contains no projected fields.</p>}<div className="mt-3 border-t border-primary/15 pt-3"><div className="flex items-center justify-between gap-2"><p className="font-mono text-[10px] uppercase tracking-wider text-primary">Changes from snapshot</p><span className="font-mono text-[10px] text-muted-foreground">{comparison.length}</span></div>{comparison.length > 0 ? <div className="mt-2 space-y-2">{comparison.map((change) => <div key={change.fieldKey} className="rounded-md border border-border/70 p-2"><div className="flex items-center justify-between gap-2"><span className="font-mono text-[10px] text-foreground">{change.fieldKey}</span><span className="font-mono text-[10px] uppercase text-muted-foreground">{change.kind}</span></div><p className="mt-1 break-words text-[11px] text-muted-foreground">{change.previous ? formatValue(change.previous.value) : "—"} → {change.current ? formatValue(change.current.value) : "—"}</p></div>)}</div> : <p className="mt-2 text-[11px] text-muted-foreground">The current projection matches this snapshot.</p>}</div></div>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {file && onReclassify && <button type="button" onClick={() => onReclassify(file)} className="cw-button-flow rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground">Reclassify source</button>}
        {file && record.status === "failed" && onRetry && <button type="button" onClick={() => onRetry(file)} className="cw-button-flow rounded-lg border border-primary/30 px-2.5 py-1.5 text-[11px] text-primary">Retry processing</button>}
        {file && onOpenSource && <button type="button" onClick={() => onOpenSource(file)} className="cw-button-flow inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-muted-foreground"><ExternalLink className="h-3 w-3" /> Open source</button>}
      </div>
    </section>
  )
}
