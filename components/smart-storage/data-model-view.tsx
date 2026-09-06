"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, ChevronLeft, ChevronRight, Database, FileText, Folder, GitBranch, PencilLine, RefreshCw, RotateCcw, Search, Table2 } from "lucide-react"

import type { UploadedFile, VirtualFolder } from "@/lib/smart-storage"
import { supabase } from "@/lib/supabase"
import { createSingleFlight } from "@/lib/single-flight"
import { Tip } from "@/components/ui/tip"

type ModelFile = Pick<UploadedFile, "id" | "filename" | "file_type" | "file_size" | "storage_path" | "folder_id" | "document_type" | "upload_status" | "scan_reason" | "analysis_json" | "analyzed_at" | "source_rows_json" | "created_at">
type ModelRecord = {
  id: string; file_id: string; record_type: string; document_type: string | null; status: string
  occurred_on: string | null; amount: number | null; currency: string | null; counterparty: string | null
  confidence: number | null; needs_review: boolean; has_user_edits: boolean; excluded_at: string | null; updated_at: string
}
type ModelField = { id: string; record_id: string; field_key: string; value: unknown; value_type: string; confidence: number | null; is_custom: boolean; source_evidence: Record<string, unknown> }
type CatalogField = { field_key: string; value_types: string[]; occurrence_count: number; is_custom: boolean; source_kinds: string[] }
type Dataset = { id: string; file_id: string; name: string; sheet_name: string | null; row_count: number; column_count: number; needs_review: boolean }
type DatasetColumn = { id: string; dataset_id: string; key: string; label: string; data_type: string; role: string | null; distinct_count: number | null; type_confidence: number | null; needs_review: boolean; review_reason: string | null }
type ModelPayload = {
  files: ModelFile[]; records: ModelRecord[]; fields: ModelField[]; catalog: CatalogField[]
  datasets: Dataset[]; datasetColumns: DatasetColumn[]; page: number; total: number; allTotal: number; hasMore: boolean
  nextPage: number | null; statusCounts: Record<string, number>
  stats: { activeRecords: number; excludedRecords: number; needsReview: number; userEdited: number; lineItems: number }
}
type Revision = { id: string; revision_number: number; change_kind: string; target_kind: "column" | "attribute"; target: string; previous_value: unknown; new_value: unknown; actor: string; note: string | null; created_at: string }

const runModelLoadOnce = createSingleFlight()

async function fetchModel(token: string, userId: string, params: URLSearchParams) {
  const url = `/api/data-model?${params}`
  const requestKey = `${userId}:${url}`
  return runModelLoadOnce(requestKey, () => fetch(url, { headers: { Authorization: `Bearer ${token}` } }).then(async (response) => {
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error ?? "The data model could not be loaded.")
    return payload as ModelPayload
  }))
}

export function DataModelView({ files, folders, onManualEntry, onReclassify, onRetry, onOpenSource }: {
  files: UploadedFile[]
  folders: VirtualFolder[]
  onManualEntry?: () => void
  onReclassify?: (file: UploadedFile) => void
  onRetry?: (file: UploadedFile) => void
  onOpenSource?: (file: UploadedFile) => void
}) {
  const [view, setView] = useState<"map" | "schema">("map")
  const [model, setModel] = useState<ModelPayload | null>(null)
  const [query, setQuery] = useState("")
  const [customOnly, setCustomOnly] = useState(false)
  const [reviewOnly, setReviewOnly] = useState(false)
  const [showExcluded, setShowExcluded] = useState(false)
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [page, setPage] = useState(0)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadSequence = useRef(0)

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current
    setLoading(true)
    setError(null)
    try {
      const session = (await supabase.auth.getSession()).data.session
      const token = session?.access_token
      if (!token || !session.user.id) throw new Error("Sign in to inspect your data model.")
      const params = new URLSearchParams({ page: String(page), page_size: "40" })
      if (debouncedQuery) params.set("search", debouncedQuery)
      if (customOnly) params.set("custom_only", "true")
      if (reviewOnly) params.set("review_only", "true")
      if (showExcluded) params.set("include_excluded", "true")
      const payload = await fetchModel(token, session.user.id, params)
      if (sequence === loadSequence.current) setModel(payload)
    } catch (loadError) {
      if (sequence === loadSequence.current) setError(loadError instanceof Error ? loadError.message : "The data model could not be loaded.")
    } finally {
      if (sequence === loadSequence.current) setLoading(false)
    }
  }, [customOnly, debouncedQuery, page, reviewOnly, showExcluded])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPage(0)
      setDebouncedQuery(query.trim())
    }, query ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!selectedRecordId) { setRevisions([]); return }
    setRevisions([])
    let cancelled = false
    void supabase.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token
      if (!token) return
      const response = await fetch(`/api/data-model/${selectedRecordId}/history`, { headers: { Authorization: `Bearer ${token}` } })
      const payload = await response.json().catch(() => null)
      if (!cancelled && response.ok) setRevisions(payload?.revisions ?? [])
    })
    return () => { cancelled = true }
  }, [selectedRecordId])

  const sourceFiles = useMemo(() => {
    const loadedById = new Map(files.map((file) => [file.id, file]))
    return (model?.files ?? files).map((file) => loadedById.get(file.id) ?? file)
  }, [files, model?.files])
  const fileById = useMemo(() => new Map(sourceFiles.map((file) => [file.id, file])), [sourceFiles])
  const folderById = useMemo(() => new Map(folders.map((folder) => [folder.id, folder])), [folders])
  const selectedRecord = model?.records.find((record) => record.id === selectedRecordId) ?? null
  const selectedDataset = model?.datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null
  const visibleRecords = (model?.records ?? []).filter((record) => !selectedFileId || record.file_id === selectedFileId)
  const visibleDatasets = reviewOnly ? [] : (model?.datasets ?? []).filter((dataset) => !selectedFileId || dataset.file_id === selectedFileId)
  const detailFields = selectedRecord ? (model?.fields ?? []).filter((field) => field.record_id === selectedRecord.id) : []
  const detailColumns = selectedDataset ? (model?.datasetColumns ?? []).filter((column) => column.dataset_id === selectedDataset.id) : []
  const classificationRationale = detailFields.find((field) => field.field_key === "classification_rationale") ?? null
  const groupedFields = groupRecordFields(detailFields.filter((field) => field.field_key !== "classification_rationale"))
  const revisionsByTarget = useMemo(() => {
    const result = new Map<string, Revision>()
    for (const revision of revisions) if (["user_edit", "reclassify", "rollback"].includes(revision.change_kind) && !result.has(revision.target)) result.set(revision.target, revision)
    return result
  }, [revisions])
  const sourceGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; items: UploadedFile[] }>()
    const needle = query.trim().toLowerCase()
    const matchingFileIds = new Set([...(model?.records ?? []).map((record) => record.file_id), ...(model?.datasets ?? []).map((dataset) => dataset.file_id)])
    for (const file of sourceFiles) {
      if (needle && !file.filename.toLowerCase().includes(needle) && !matchingFileIds.has(file.id)) continue
      const folder = file.folder_id ? folderById.get(file.folder_id) : null
      const key = folder?.id ?? "root"
      const group = groups.get(key) ?? { id: key, name: folder?.name ?? "Workspace root", items: [] }
      group.items.push(file)
      groups.set(key, group)
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [folderById, model?.datasets, model?.records, query, sourceFiles])

  async function restoreExtractedValue(revision: Revision) {
    if (!selectedRecord || !window.confirm(`Restore the extracted value for ${revision.target}?`)) return
    const token = (await supabase.auth.getSession()).data.session?.access_token
    if (!token) return
    const response = await fetch(`/api/records/${selectedRecord.id}/correct`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ target_kind: revision.target_kind, target: revision.target, change_kind: "rollback", note: `Restored from Data Model history revision ${revision.revision_number}` }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) setError(payload?.error ?? "The extracted value could not be restored.")
    else void load()
  }

  return <div className="flex h-full min-h-0 flex-col bg-background">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 pr-14">
      <div><p className="font-aldrich text-[10px] uppercase tracking-[0.18em] text-primary">Data Model</p><h2 className="mt-1 text-sm font-semibold">Manage the data behind your workspace</h2></div>
      <div className="flex items-center gap-2">
        <button onClick={() => void load()} className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs text-muted-foreground"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</button>
        <div className="flex rounded-lg border border-border p-0.5">
          <ViewButton active={view === "map"} onClick={() => setView("map")} icon={<GitBranch className="h-3.5 w-3.5" />} label="Map" />
          <ViewButton active={view === "schema"} onClick={() => setView("schema")} icon={<Table2 className="h-3.5 w-3.5" />} label="Schema" />
        </div>
      </div>
    </header>
    <div className="grid grid-cols-2 gap-2 border-b border-border p-4 sm:grid-cols-5">
      <Summary label="Sources" value={sourceFiles.length} loading={loading && !model} />
      <Summary label="Active records" value={model?.stats.activeRecords} hint={model && model.stats.excludedRecords > 0 ? `${model.allTotal} total` : undefined} loading={loading && !model} />
      <Summary label="Datasets" value={model?.datasets.length} loading={loading && !model} />
      <Summary label="Needs review" value={model?.stats.needsReview} loading={loading && !model} active={reviewOnly} onClick={() => { setPage(0); setReviewOnly((value) => !value) }} />
      <Summary label="Custom fields" value={(model?.catalog ?? []).filter((field) => field.is_custom).length} loading={loading && !model} />
    </div>
    <div className="flex flex-wrap gap-2 border-b border-border p-4">
      <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-border px-3 py-2"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources, records, or fields" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
      <button aria-pressed={reviewOnly} onClick={() => { setPage(0); setReviewOnly((value) => !value) }} className={`rounded-lg border px-3 py-2 text-xs ${reviewOnly ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>Needs review</button>
      <button aria-pressed={showExcluded} onClick={() => { setPage(0); setShowExcluded((value) => !value) }} className={`rounded-lg border px-3 py-2 text-xs ${showExcluded ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{showExcluded ? "Hide excluded" : `Show excluded${model?.stats.excludedRecords ? ` (${model.stats.excludedRecords})` : ""}`}</button>
      <button aria-pressed={customOnly} onClick={() => { setPage(0); setCustomOnly((value) => !value) }} className={`rounded-lg border px-3 py-2 text-xs ${customOnly ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>Custom fields</button>
    </div>
    {error && <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><AlertCircle className="h-4 w-4" />{error}</div>}
    <main className="min-h-0 flex-1 overflow-auto p-4">
      {loading && !model ? <DataModelSkeleton /> : model && model.total === 0 && model.datasets.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-2 text-center"><Database className="h-8 w-8 text-primary/60" /><p className="text-sm font-medium">{reviewOnly || customOnly || debouncedQuery ? "No matching records" : model.allTotal > 0 ? "No active records" : "No records yet"}</p><p className="max-w-md text-xs text-muted-foreground">{reviewOnly || customOnly || debouncedQuery ? "Clear a filter or search to see the rest of your model." : model.allTotal > 0 ? "This workspace only contains excluded records. You can include them for historical review." : "Upload a source file or create a manual record to form your workspace data model."}</p>{reviewOnly || customOnly || debouncedQuery ? <button onClick={() => { setQuery(""); setDebouncedQuery(""); setReviewOnly(false); setCustomOnly(false); setPage(0) }} className="mt-2 rounded-lg border border-border px-3 py-2 text-xs">Clear filters</button> : model.allTotal > 0 ? <button onClick={() => { setShowExcluded(true); setPage(0) }} className="mt-2 rounded-lg border border-border px-3 py-2 text-xs">Show excluded records</button> : onManualEntry && <button onClick={onManualEntry} className="mt-2 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">Add manual record</button>}</div> : view === "map" ? <div className="grid gap-3 xl:grid-cols-3">
        <ModelColumn title="Folders & sources" subtitle="Workspace organization">
          <button onClick={() => setSelectedFileId(null)} className={`w-full rounded-lg border p-2 text-left text-xs ${selectedFileId === null ? "border-primary/50 bg-primary/10" : "border-border"}`}>All workspace data</button>
          {sourceGroups.map((group) => <div key={group.id} className="space-y-1"><p className="flex items-center gap-1.5 px-1 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground"><Folder className="h-3 w-3" />{group.name}</p>{group.items.map((file) => <button key={file.id} onClick={() => { setSelectedFileId(file.id); setSelectedRecordId(null); setSelectedDatasetId(null) }} className={`w-full rounded-lg border p-2 text-left ${selectedFileId === file.id ? "border-primary/50 bg-primary/10" : "border-border/70"}`}><p className="truncate text-xs font-medium">{file.filename}</p><p className="mt-1 text-[10px] text-muted-foreground">{file.document_type.replaceAll("_", " ")} · {file.upload_status ?? "unknown"}</p></button>)}</div>)}
        </ModelColumn>
        <ModelColumn title="Records & datasets" subtitle={`${visibleRecords.length} loaded records · ${visibleDatasets.length} datasets`}>
          {visibleRecords.map((record) => <button key={record.id} onClick={() => { setSelectedRecordId(record.id); setSelectedDatasetId(null) }} className={`w-full rounded-lg border p-2 text-left ${selectedRecordId === record.id ? "border-primary/50 bg-primary/10" : record.excluded_at ? "border-border/50 bg-muted/25 opacity-65" : "border-border/70"}`}><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-medium">{record.counterparty || record.record_type.replaceAll("_", " ")}</p>{record.has_user_edits && <EditedBadge />}</div><p className="mt-1 text-[10px] text-muted-foreground">record · {record.status}{record.currency ? ` · ${record.currency}` : ""}{record.needs_review ? " · review" : ""}{record.excluded_at ? " · excluded" : ""}</p></button>)}
          {visibleDatasets.map((dataset) => <button key={dataset.id} onClick={() => { setSelectedDatasetId(dataset.id); setSelectedRecordId(null) }} className={`w-full rounded-lg border p-2 text-left ${selectedDatasetId === dataset.id ? "border-primary/50 bg-primary/10" : "border-border/70"}`}><p className="truncate text-xs font-medium">{dataset.name}</p><p className="mt-1 text-[10px] text-muted-foreground">dataset · {dataset.row_count} rows · {dataset.column_count} columns{dataset.needs_review ? " · review" : ""}</p></button>)}
        </ModelColumn>
        <ModelColumn title="Fields & lineage" subtitle={selectedRecord ? "Selected record" : selectedDataset ? "Selected dataset" : "Select an item"}>
          {selectedRecord && <div className="rounded-lg border border-border/70 bg-muted/20 p-2"><div className="flex items-center justify-between gap-2"><p className="text-xs font-medium">{selectedRecord.counterparty || selectedRecord.record_type.replaceAll("_", " ")}</p>{selectedRecord.has_user_edits && <EditedBadge />}</div><p className="mt-1 text-[10px] text-muted-foreground">Record lineage · {fileById.get(selectedRecord.file_id)?.filename ?? "source file"}</p>{classificationRationale && <details className="mt-2"><summary className="cursor-pointer text-[10px] font-medium text-muted-foreground">Why this was classified this way</summary><p className="mt-1 text-xs text-muted-foreground">{formatValue(classificationRationale.value)}</p></details>}</div>}
          {selectedRecord && <FieldGroup title="Extracted" fields={groupedFields.extracted} revisionsByTarget={revisionsByTarget} />}
          {selectedRecord && <FieldGroup title="Derived" fields={groupedFields.derived} revisionsByTarget={revisionsByTarget} />}
          {groupedFields.internal.length > 0 && <details className="rounded-lg border border-border/70"><summary className="cursor-pointer px-2 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Internal · {groupedFields.internal.length}</summary><div className="space-y-2 border-t border-border p-2"><FieldRows fields={groupedFields.internal} revisionsByTarget={revisionsByTarget} /></div></details>}
          {detailColumns.map((column) => <div key={column.id} className="rounded-lg border border-border/70 p-2"><div className="flex justify-between gap-2"><code className="text-[11px]">{column.key}</code><span className="text-[10px] text-muted-foreground">{column.data_type}</span></div><p className="mt-1 text-xs">{column.label}</p><p className="mt-1 text-[10px] text-muted-foreground">{column.distinct_count ?? 0} distinct{column.needs_review ? ` · ${column.review_reason ?? "review required"}` : ""}</p></div>)}
          {selectedRecord && <RecordActions file={fileById.get(selectedRecord.file_id)} onOpenSource={onOpenSource} onReclassify={onReclassify} onRetry={onRetry} />}
          {revisions.length > 0 && <div className="border-t border-border pt-3"><p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Revision history</p>{revisions.slice(0, 8).map((revision) => <div key={revision.id} className="mb-2 rounded-lg border border-border/70 p-2 text-xs"><div className="flex items-center justify-between gap-2"><code>{revision.target}</code><button onClick={() => void restoreExtractedValue(revision)} className="flex items-center gap-1 text-[10px] text-primary"><RotateCcw className="h-3 w-3" />Restore extracted</button></div><p className="mt-1 break-words text-[11px]">{formatValue(revision.previous_value)} → {formatValue(revision.new_value)}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatChangeKind(revision.change_kind)} · {formatActor(revision.actor)} · {new Date(revision.created_at).toLocaleString()}</p></div>)}</div>}
        </ModelColumn>
      </div> : <SchemaView catalog={model?.catalog ?? []} datasets={model?.datasets ?? []} columns={model?.datasetColumns ?? []} query={query} />}
    </main>
    <footer className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground"><span>{loading && !model ? "Loading records…" : `Page ${page + 1} · ${model?.total ?? 0} matching ${showExcluded ? "records, including excluded" : "active records"}`}</span><div className="flex gap-1"><Tip text="Show the previous page of records."><button disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded border border-border p-1 disabled:opacity-40" aria-label="Previous records page"><ChevronLeft className="h-4 w-4" /></button></Tip><Tip text="Show the next page of records."><button disabled={!model?.hasMore || loading} onClick={() => setPage((value) => value + 1)} className="rounded border border-border p-1 disabled:opacity-40" aria-label="Next records page"><ChevronRight className="h-4 w-4" /></button></Tip></div></footer>
  </div>
}

function SchemaView({ catalog, datasets, columns, query }: { catalog: CatalogField[]; datasets: Dataset[]; columns: DatasetColumn[]; query: string }) {
  const datasetById = new Map(datasets.map((dataset) => [dataset.id, dataset]))
  const needle = query.trim().toLowerCase()
  const visibleCatalog = needle ? catalog.filter((field) => [field.field_key, ...field.value_types, ...field.source_kinds].some((value) => value.toLowerCase().includes(needle))) : catalog
  const visibleColumns = needle ? columns.filter((column) => {
    const datasetName = datasetById.get(column.dataset_id)?.name ?? ""
    return [datasetName, column.key, column.label, column.data_type, column.role ?? ""].some((value) => value.toLowerCase().includes(needle))
  }) : columns
  return <div className="space-y-5"><section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider">Canonical record fields</h3><div className="overflow-hidden rounded-xl border border-border"><div className="grid grid-cols-[1fr_120px_80px] bg-muted/40 px-3 py-2 text-[10px] uppercase text-muted-foreground"><span>Field</span><span>Type</span><span>Seen</span></div>{visibleCatalog.map((field) => <div key={field.field_key} className="grid grid-cols-[1fr_120px_80px] border-t border-border px-3 py-2 text-xs"><span><code>{field.field_key}</code>{field.is_custom && <span className="ml-2 text-[10px] text-primary">Custom</span>}</span><span>{field.value_types.join(", ")}</span><span>{field.occurrence_count}</span></div>)}</div></section><section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider">Dataset schemas</h3><div className="overflow-hidden rounded-xl border border-border"><div className="grid grid-cols-[1fr_1fr_120px_90px] bg-muted/40 px-3 py-2 text-[10px] uppercase text-muted-foreground"><span>Dataset</span><span>Column key</span><span>Type / role</span><span>Review</span></div>{visibleColumns.map((column) => <div key={column.id} className="grid grid-cols-[1fr_1fr_120px_90px] border-t border-border px-3 py-2 text-xs"><span>{datasetById.get(column.dataset_id)?.name ?? "Dataset"}</span><span><code>{column.key}</code><span className="ml-2 text-muted-foreground">{column.label}</span></span><span>{column.data_type}{column.role ? ` · ${column.role}` : ""}</span><span>{column.needs_review ? "Required" : "Ready"}</span></div>)}</div></section></div>
}

function RecordActions({ file, onOpenSource, onReclassify, onRetry }: { file?: UploadedFile; onOpenSource?: (file: UploadedFile) => void; onReclassify?: (file: UploadedFile) => void; onRetry?: (file: UploadedFile) => void }) {
  if (!file) return null
  return <div className="flex flex-wrap gap-2 border-t border-border pt-3"><button onClick={() => onOpenSource?.(file)} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px]"><FileText className="h-3 w-3" />Open source</button><button onClick={() => onReclassify?.(file)} className="rounded border border-border px-2 py-1 text-[10px]">Reclassify</button>{file.attention_state && <button onClick={() => onRetry?.(file)} className="rounded border border-border px-2 py-1 text-[10px]">Retry</button>}</div>
}
function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button onClick={onClick} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs ${active ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>{icon}{label}</button> }
function Summary({ label, value, hint, loading = false, active = false, onClick }: { label: string; value?: number; hint?: string; loading?: boolean; active?: boolean; onClick?: () => void }) {
  const content = <><p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p>{loading ? <div className="mt-2 h-5 w-12 animate-pulse rounded bg-muted" /> : <div className="mt-1 flex items-baseline gap-1.5"><p className="text-lg font-semibold">{value ?? 0}</p>{hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}</div>}</>
  return onClick ? <button type="button" aria-pressed={active} onClick={onClick} className={`rounded-lg border p-3 text-left transition-colors ${active ? "border-primary/50 bg-primary/10" : "border-border/70 hover:border-primary/30"}`}>{content}</button> : <div className="rounded-lg border border-border/70 p-3">{content}</div>
}
function ModelColumn({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="min-h-80 rounded-xl border border-border bg-card/30"><div className="border-b border-border px-3 py-2"><h3 className="text-xs font-semibold">{title}</h3><p className="text-[10px] text-muted-foreground">{subtitle}</p></div><div className="space-y-2 p-2">{children}</div></section> }
function formatValue(value: unknown) { if (value === null || value === undefined || value === "") return "—"; return typeof value === "object" ? JSON.stringify(value) : String(value) }

const DERIVED_FIELD_KEYS = new Set(["jurisdiction", "merchant_domain", "merchant_address_country", "recurrence_cadence"])
const EXTRACTED_FIELD_KEYS = new Set(["amount", "description", "vendor_name", "tax_amount", "quantity", "net_income", "employer_name", "income_source", "discount_amount", "warranty_monthly", "adjustment"])
const INTERNAL_FIELD_KEYS = new Set(["_raw_json", "filename", "raw_json"])

function groupRecordFields(fields: ModelField[]) {
  const groups: { extracted: ModelField[]; derived: ModelField[]; internal: ModelField[] } = { extracted: [], derived: [], internal: [] }
  for (const field of fields) {
    if (INTERNAL_FIELD_KEYS.has(field.field_key)) groups.internal.push(field)
    else if (EXTRACTED_FIELD_KEYS.has(field.field_key)) groups.extracted.push(field)
    else if (DERIVED_FIELD_KEYS.has(field.field_key) || !field.is_custom) groups.derived.push(field)
    else groups.extracted.push(field)
  }
  return groups
}

function FieldGroup({ title, fields, revisionsByTarget }: { title: string; fields: ModelField[]; revisionsByTarget: Map<string, Revision> }) {
  return <section><p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>{fields.length > 0 ? <div className="space-y-2"><FieldRows fields={fields} revisionsByTarget={revisionsByTarget} /></div> : <p className="rounded-lg border border-dashed border-border/70 p-2 text-[10px] text-muted-foreground">No {title.toLowerCase()} fields</p>}</section>
}

function FieldRows({ fields, revisionsByTarget }: { fields: ModelField[]; revisionsByTarget: Map<string, Revision> }) {
  return <>{fields.map((field) => {
    const revision = revisionsByTarget.get(field.field_key)
    return <div key={field.id} className="rounded-lg border border-border/70 p-2"><div className="flex justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><code className="truncate text-[11px]">{field.field_key}</code>{revision && <EditedBadge />}</div><span className="shrink-0 text-[10px] text-muted-foreground">{field.value_type}{field.is_custom ? " · custom" : ""}</span></div><p className="mt-1 break-words text-xs">{formatValue(field.value)}</p>{revision && <details className="mt-2"><summary className="cursor-pointer text-[10px] text-primary">View edit</summary><p className="mt-1 text-[10px] text-muted-foreground">Was {formatValue(revision.previous_value)} · {formatActor(revision.actor)}</p></details>}</div>
  })}</>
}

function EditedBadge() { return <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary"><PencilLine className="h-2.5 w-2.5" />Edited</span> }
function formatActor(actor: string) { return actor === "you" ? "edited by you" : actor === "system" ? "system change" : "edited" }
function formatChangeKind(kind: string) { return kind.replaceAll("_", " ") }

function DataModelSkeleton() {
  return <div aria-label="Loading data model" className="grid gap-3 xl:grid-cols-3">{Array.from({ length: 3 }, (_, column) => <section key={column} className="min-h-80 rounded-xl border border-border"><div className="border-b border-border p-3"><div className="h-3 w-28 animate-pulse rounded bg-muted" /></div><div className="space-y-2 p-2">{Array.from({ length: 5 }, (_, row) => <div key={row} className="h-12 animate-pulse rounded-lg bg-muted/70" />)}</div></section>)}</div>
}
