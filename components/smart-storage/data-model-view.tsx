"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, ChevronLeft, ChevronRight, Database, FileText, Folder, GitBranch, RefreshCw, RotateCcw, Search, Table2 } from "lucide-react"

import type { UploadedFile, VirtualFolder } from "@/lib/smart-storage"
import { supabase } from "@/lib/supabase"

type ModelFile = Pick<UploadedFile, "id" | "filename" | "file_type" | "file_size" | "storage_path" | "folder_id" | "document_type" | "upload_status" | "scan_reason" | "analysis_json" | "analyzed_at" | "source_rows_json" | "created_at">
type ModelRecord = {
  id: string; file_id: string; record_type: string; document_type: string | null; status: string
  occurred_on: string | null; amount: number | null; currency: string | null; counterparty: string | null
  confidence: number | null; needs_review: boolean; excluded_at: string | null; updated_at: string
}
type ModelField = { id: string; record_id: string; field_key: string; value: unknown; value_type: string; confidence: number | null; is_custom: boolean; source_evidence: Record<string, unknown> }
type CatalogField = { field_key: string; value_types: string[]; occurrence_count: number; is_custom: boolean; source_kinds: string[] }
type Dataset = { id: string; file_id: string; name: string; sheet_name: string | null; row_count: number; column_count: number; needs_review: boolean }
type DatasetColumn = { id: string; dataset_id: string; key: string; label: string; data_type: string; role: string | null; distinct_count: number | null; type_confidence: number | null; needs_review: boolean; review_reason: string | null }
type ModelPayload = {
  files: ModelFile[]; records: ModelRecord[]; fields: ModelField[]; catalog: CatalogField[]
  datasets: Dataset[]; datasetColumns: DatasetColumn[]; page: number; total: number; hasMore: boolean
  nextPage: number | null; statusCounts: Record<string, number>
}
type Revision = { id: string; revision_number: number; change_kind: string; target_kind: "column" | "attribute"; target: string; previous_value: unknown; new_value: unknown; note: string | null; created_at: string }

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
  const [status, setStatus] = useState("")
  const [customOnly, setCustomOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null)
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      if (!token) throw new Error("Sign in to inspect your data model.")
      const params = new URLSearchParams({ page: String(page), page_size: "40" })
      if (query.trim()) params.set("search", query.trim())
      if (status) params.set("status", status)
      if (customOnly) params.set("custom_only", "true")
      const response = await fetch(`/api/data-model?${params}`, { headers: { Authorization: `Bearer ${token}` } })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error ?? "The data model could not be loaded.")
      setModel(payload as ModelPayload)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The data model could not be loaded.")
    } finally {
      setLoading(false)
    }
  }, [customOnly, page, query, status])

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0)
    return () => clearTimeout(timer)
  }, [load, files, query])

  useEffect(() => {
    setPage(0)
  }, [query, status, customOnly])

  useEffect(() => {
    if (!selectedRecordId) { setRevisions([]); return }
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
  const visibleDatasets = (model?.datasets ?? []).filter((dataset) => !selectedFileId || dataset.file_id === selectedFileId)
  const detailFields = selectedRecord ? (model?.fields ?? []).filter((field) => field.record_id === selectedRecord.id) : []
  const detailColumns = selectedDataset ? (model?.datasetColumns ?? []).filter((column) => column.dataset_id === selectedDataset.id) : []
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
      <Summary label="Sources" value={sourceFiles.length} /><Summary label="Records" value={model?.total ?? 0} /><Summary label="Datasets" value={model?.datasets.length ?? 0} /><Summary label="Needs review" value={(model?.records ?? []).filter((row) => row.needs_review).length + (model?.datasets ?? []).filter((row) => row.needs_review).length} /><Summary label="Custom fields" value={(model?.catalog ?? []).filter((field) => field.is_custom).length} />
    </div>
    <div className="flex flex-wrap gap-2 border-b border-border p-4">
      <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-border px-3 py-2"><Search className="h-3.5 w-3.5 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search sources, records, or fields" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-border bg-background px-3 text-xs"><option value="">All states</option><option value="derived">Derived</option><option value="reviewed">Reviewed</option><option value="superseded">Superseded</option></select>
      <button aria-pressed={customOnly} onClick={() => setCustomOnly((value) => !value)} className={`rounded-lg border px-3 py-2 text-xs ${customOnly ? "border-primary/50 bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>Custom fields</button>
    </div>
    {error && <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"><AlertCircle className="h-4 w-4" />{error}</div>}
    <main className="min-h-0 flex-1 overflow-auto p-4">
      {!loading && sourceFiles.length === 0 ? <div className="flex h-full flex-col items-center justify-center gap-2 text-center"><Database className="h-8 w-8 text-primary/60" /><p className="text-sm font-medium">Your model is waiting for source files</p><p className="max-w-md text-xs text-muted-foreground">Upload a file or create a manual record to form the workspace model.</p>{onManualEntry && <button onClick={onManualEntry} className="mt-2 rounded-lg bg-primary px-3 py-2 text-xs text-primary-foreground">Add manual record</button>}</div> : view === "map" ? <div className="grid gap-3 xl:grid-cols-3">
        <ModelColumn title="Folders & sources" subtitle="Workspace organization">
          <button onClick={() => setSelectedFileId(null)} className={`w-full rounded-lg border p-2 text-left text-xs ${selectedFileId === null ? "border-primary/50 bg-primary/10" : "border-border"}`}>All workspace data</button>
          {sourceGroups.map((group) => <div key={group.id} className="space-y-1"><p className="flex items-center gap-1.5 px-1 pt-2 text-[10px] uppercase tracking-wider text-muted-foreground"><Folder className="h-3 w-3" />{group.name}</p>{group.items.map((file) => <button key={file.id} onClick={() => { setSelectedFileId(file.id); setSelectedRecordId(null); setSelectedDatasetId(null) }} className={`w-full rounded-lg border p-2 text-left ${selectedFileId === file.id ? "border-primary/50 bg-primary/10" : "border-border/70"}`}><p className="truncate text-xs font-medium">{file.filename}</p><p className="mt-1 text-[10px] text-muted-foreground">{file.document_type.replaceAll("_", " ")} · {file.upload_status ?? "unknown"}</p></button>)}</div>)}
        </ModelColumn>
        <ModelColumn title="Records & datasets" subtitle={`${visibleRecords.length} loaded records · ${visibleDatasets.length} datasets`}>
          {visibleRecords.map((record) => <button key={record.id} onClick={() => { setSelectedRecordId(record.id); setSelectedDatasetId(null) }} className={`w-full rounded-lg border p-2 text-left ${selectedRecordId === record.id ? "border-primary/50 bg-primary/10" : "border-border/70"}`}><p className="truncate text-xs font-medium">{record.counterparty || record.record_type.replaceAll("_", " ")}</p><p className="mt-1 text-[10px] text-muted-foreground">record · {record.status}{record.currency ? ` · ${record.currency}` : ""}{record.needs_review ? " · review" : ""}</p></button>)}
          {visibleDatasets.map((dataset) => <button key={dataset.id} onClick={() => { setSelectedDatasetId(dataset.id); setSelectedRecordId(null) }} className={`w-full rounded-lg border p-2 text-left ${selectedDatasetId === dataset.id ? "border-primary/50 bg-primary/10" : "border-border/70"}`}><p className="truncate text-xs font-medium">{dataset.name}</p><p className="mt-1 text-[10px] text-muted-foreground">dataset · {dataset.row_count} rows · {dataset.column_count} columns{dataset.needs_review ? " · review" : ""}</p></button>)}
        </ModelColumn>
        <ModelColumn title="Fields & lineage" subtitle={selectedRecord ? "Selected record" : selectedDataset ? "Selected dataset" : "Select an item"}>
          {detailFields.map((field) => <div key={field.id} className="rounded-lg border border-border/70 p-2"><div className="flex justify-between gap-2"><code className="text-[11px]">{field.field_key}</code><span className="text-[10px] text-muted-foreground">{field.value_type}{field.is_custom ? " · custom" : ""}</span></div><p className="mt-1 break-words text-xs">{formatValue(field.value)}</p><p className="mt-1 text-[10px] text-muted-foreground">confidence {formatConfidence(field.confidence)} · {String(field.source_evidence?.source_kind ?? "record")}</p></div>)}
          {detailColumns.map((column) => <div key={column.id} className="rounded-lg border border-border/70 p-2"><div className="flex justify-between gap-2"><code className="text-[11px]">{column.key}</code><span className="text-[10px] text-muted-foreground">{column.data_type}</span></div><p className="mt-1 text-xs">{column.label}</p><p className="mt-1 text-[10px] text-muted-foreground">{column.distinct_count ?? 0} distinct · confidence {formatConfidence(column.type_confidence)}{column.needs_review ? ` · ${column.review_reason ?? "review"}` : ""}</p></div>)}
          {selectedRecord && <RecordActions file={fileById.get(selectedRecord.file_id)} onOpenSource={onOpenSource} onReclassify={onReclassify} onRetry={onRetry} />}
          {revisions.length > 0 && <div className="border-t border-border pt-3"><p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Change history</p>{revisions.slice(0, 8).map((revision) => <div key={revision.id} className="mb-2 rounded-lg border border-border/70 p-2 text-xs"><div className="flex items-center justify-between gap-2"><code>{revision.target}</code><button onClick={() => void restoreExtractedValue(revision)} className="flex items-center gap-1 text-[10px] text-primary"><RotateCcw className="h-3 w-3" />Restore extracted</button></div><p className="mt-1 text-[10px] text-muted-foreground">{revision.change_kind} · revision {revision.revision_number}</p></div>)}</div>}
        </ModelColumn>
      </div> : <SchemaView catalog={model?.catalog ?? []} datasets={model?.datasets ?? []} columns={model?.datasetColumns ?? []} query={query} />}
    </main>
    <footer className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground"><span>Page {page + 1} · {model?.total ?? 0} matching records</span><div className="flex gap-1"><button disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded border border-border p-1 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button><button disabled={!model?.hasMore} onClick={() => setPage((value) => value + 1)} className="rounded border border-border p-1 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button></div></footer>
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
  return <div className="space-y-5"><section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider">Canonical record fields</h3><div className="overflow-hidden rounded-xl border border-border"><div className="grid grid-cols-[1fr_120px_80px_120px] bg-muted/40 px-3 py-2 text-[10px] uppercase text-muted-foreground"><span>Field</span><span>Type</span><span>Seen</span><span>Source</span></div>{visibleCatalog.map((field) => <div key={field.field_key} className="grid grid-cols-[1fr_120px_80px_120px] border-t border-border px-3 py-2 text-xs"><code>{field.field_key}</code><span>{field.value_types.join(", ")}</span><span>{field.occurrence_count}</span><span>{field.is_custom ? "Custom" : field.source_kinds.join(", ")}</span></div>)}</div></section><section><h3 className="mb-2 text-xs font-semibold uppercase tracking-wider">Dataset schemas</h3><div className="overflow-hidden rounded-xl border border-border"><div className="grid grid-cols-[1fr_1fr_120px_90px] bg-muted/40 px-3 py-2 text-[10px] uppercase text-muted-foreground"><span>Dataset</span><span>Column key</span><span>Type / role</span><span>Review</span></div>{visibleColumns.map((column) => <div key={column.id} className="grid grid-cols-[1fr_1fr_120px_90px] border-t border-border px-3 py-2 text-xs"><span>{datasetById.get(column.dataset_id)?.name ?? "Dataset"}</span><span><code>{column.key}</code><span className="ml-2 text-muted-foreground">{column.label}</span></span><span>{column.data_type}{column.role ? ` · ${column.role}` : ""}</span><span>{column.needs_review ? "Required" : "Ready"}</span></div>)}</div></section></div>
}

function RecordActions({ file, onOpenSource, onReclassify, onRetry }: { file?: UploadedFile; onOpenSource?: (file: UploadedFile) => void; onReclassify?: (file: UploadedFile) => void; onRetry?: (file: UploadedFile) => void }) {
  if (!file) return null
  return <div className="flex flex-wrap gap-2 border-t border-border pt-3"><button onClick={() => onOpenSource?.(file)} className="flex items-center gap-1 rounded border border-border px-2 py-1 text-[10px]"><FileText className="h-3 w-3" />Open source</button><button onClick={() => onReclassify?.(file)} className="rounded border border-border px-2 py-1 text-[10px]">Reclassify</button>{file.attention_state && <button onClick={() => onRetry?.(file)} className="rounded border border-border px-2 py-1 text-[10px]">Retry</button>}</div>
}
function ViewButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) { return <button onClick={onClick} className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs ${active ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>{icon}{label}</button> }
function Summary({ label, value }: { label: string; value: number }) { return <div className="rounded-lg border border-border/70 p-3"><p className="font-mono text-[10px] uppercase text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div> }
function ModelColumn({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) { return <section className="min-h-80 rounded-xl border border-border bg-card/30"><div className="border-b border-border px-3 py-2"><h3 className="text-xs font-semibold">{title}</h3><p className="text-[10px] text-muted-foreground">{subtitle}</p></div><div className="space-y-2 p-2">{children}</div></section> }
function formatValue(value: unknown) { if (value === null || value === undefined || value === "") return "—"; return typeof value === "object" ? JSON.stringify(value) : String(value) }
function formatConfidence(value: number | null) { return value === null ? "—" : `${Math.round(Number(value) * 100)}%` }
