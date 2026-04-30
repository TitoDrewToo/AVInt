"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowUpRight,
  ChevronDown,
  Coins,
  EyeOff,
  LayoutGrid,
  MoreHorizontal,
  RefreshCw,
  Tag,
  X,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const EXPENSE_CATEGORIES = [
  "Advertising",
  "Bank Fees",
  "Contract Labor",
  "Fuel",
  "Insurance",
  "Legal",
  "Meals",
  "Office",
  "Professional Services",
  "Rent",
  "Repairs",
  "Software",
  "Supplies",
  "Taxes",
  "Travel",
  "Utilities",
  "Other",
]

const CURRENCIES = ["PHP", "USD", "EUR", "GBP", "SGD", "JPY", "AUD"]
const ROW_HEIGHT = 48
const OVERSCAN = 8

type AnalysisFinding = {
  id: string
  type: string
  title: string
  rationale: string
  confidence: number
  affected_row_ids: string[]
  proposed_action: {
    kind: "exclude" | "set_field"
    field?: string
    value?: string
  }
}

type SheetAnalysis = {
  summary?: string
  best_fit_report?: string
  totals?: { ready?: number; needs_review?: number; excluded?: number }
  findings?: AnalysisFinding[]
  analyzed_at?: string
}

type DocumentFieldRow = {
  id: string
  file_id: string
  vendor_name: string | null
  employer_name: string | null
  document_date: string | null
  currency: string | null
  total_amount: number | string | null
  gross_income: number | string | null
  net_income: number | string | null
  expense_category: string | null
  income_source: string | null
  payment_method: string | null
  confidence_score: number | string | null
  normalization_status: string | null
  raw_json: any
  created_at: string
}

type FileMeta = {
  analysis_json: SheetAnalysis | null
  analyzed_at: string | null
  source_rows_json: any[] | null
  storage_path: string | null
}

type PendingChange = {
  id: string
  rowIds: string[]
  action: "exclude" | "set_field"
  field?: string
  value?: string
  label: string
}

interface ReclassifySheetModalProps {
  isOpen: boolean
  fileId: string | null
  filename: string
  onClose: () => void
  onSaved: (fileId: string) => void
}

function aldrichStyle() {
  return { fontFamily: 'var(--font-aldrich), "Aldrich", sans-serif' }
}

function instrumentStyle() {
  return { fontFamily: 'var(--font-display), "Instrument Serif", Georgia, serif' }
}

function formatAmount(value: number | string | null) {
  if (value === null || value === undefined || value === "") return "-"
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function amountForRow(row: DocumentFieldRow) {
  return row.total_amount ?? row.gross_income ?? row.net_income ?? null
}

function displayVendor(row: DocumentFieldRow) {
  return row.vendor_name ?? row.employer_name ?? "Unassigned"
}

function rowNeedsReview(row: DocumentFieldRow) {
  return row.normalization_status !== "excluded" && Number(row.confidence_score ?? 1) < 0.7
}

function ConfidenceMeter({ value }: { value: number }) {
  const filled = value >= 0.9 ? 3 : value >= 0.7 ? 2 : 1
  return (
    <span
      className="inline-flex items-end gap-0.5"
      title={`${Math.round(value * 100)}% confidence`}
    >
      {[6, 8, 10].map((height, index) => (
        <span
          key={height}
          className={`w-0.5 rounded-sm ${index < filled ? "bg-primary" : "bg-border"}`}
          style={{ height }}
        />
      ))}
    </span>
  )
}

function StatPill({ value, label, toneClass }: { value: number; label: string; toneClass: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={`font-mono text-base font-semibold tabular-nums ${toneClass}`}>{value}</span>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  )
}

function CategoryChip({ value, confidence }: { value: string | null; confidence: number }) {
  const ringClass = confidence >= 0.9 ? "ring-primary/70" : confidence >= 0.7 ? "ring-primary/40" : "ring-primary/20"
  return (
    <span className={`inline-flex max-w-full rounded-full bg-muted px-2 py-1 text-[11px] text-foreground ring-1 ${ringClass}`}>
      <span className="truncate">{value || "Unassigned"}</span>
    </span>
  )
}

function lastAnalyzedLabel(value: string | null | undefined) {
  if (!value) return "Not analyzed"
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return "Last analyzed now"
  if (minutes < 60) return `Last analyzed ${minutes} min ago`
  return `Last analyzed ${Math.round(minutes / 60)} hr ago`
}

export function ReclassifySheetModal({ isOpen, fileId, filename, onClose, onSaved }: ReclassifySheetModalProps) {
  const [rows, setRows] = useState<DocumentFieldRow[]>([])
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [highlightedRowIds, setHighlightedRowIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<"needs_review" | "all">("all")
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(520)
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: "vendor_name" } | null>(null)
  const [editValue, setEditValue] = useState("")
  const [shouldRenormalize, setShouldRenormalize] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const analysis = fileMeta?.analysis_json ?? null

  const loadSheet = useCallback(async () => {
    if (!fileId) return
    setLoading(true)
    setError(null)
    try {
      const [{ data: fileData, error: fileError }, { data: fieldRows, error: rowsError }] = await Promise.all([
        supabase
          .from("files")
          .select("analysis_json, analyzed_at, source_rows_json, storage_path")
          .eq("id", fileId)
          .single(),
        supabase
          .from("document_fields")
          .select("id, file_id, vendor_name, employer_name, document_date, currency, total_amount, gross_income, net_income, expense_category, income_source, payment_method, confidence_score, normalization_status, raw_json, created_at")
          .eq("file_id", fileId)
          .order("created_at", { ascending: true }),
      ])
      if (fileError) throw new Error(fileError.message)
      if (rowsError) throw new Error(rowsError.message)
      setFileMeta(fileData as FileMeta)
      setRows((fieldRows ?? []) as DocumentFieldRow[])
      setSelected(new Set())
      setPendingChanges([])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sheet rows.")
    } finally {
      setLoading(false)
    }
  }, [fileId])

  useEffect(() => {
    if (!isOpen) return
    void loadSheet()
  }, [isOpen, loadSheet])

  useEffect(() => {
    if (!isOpen || !fileId) return
    const channel = supabase
      .channel(`reclassify-sheet-${fileId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "files", filter: `id=eq.${fileId}` }, (payload) => {
        setFileMeta((prev) => ({
          analysis_json: (payload.new as any)?.analysis_json ?? prev?.analysis_json ?? null,
          analyzed_at: (payload.new as any)?.analyzed_at ?? prev?.analyzed_at ?? null,
          source_rows_json: (payload.new as any)?.source_rows_json ?? prev?.source_rows_json ?? null,
          storage_path: (payload.new as any)?.storage_path ?? prev?.storage_path ?? null,
        }))
      })
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [isOpen, fileId])

  useEffect(() => {
    if (!scrollRef.current) return
    const resize = () => setViewportHeight(scrollRef.current?.clientHeight ?? 520)
    resize()
    window.addEventListener("resize", resize)
    return () => window.removeEventListener("resize", resize)
  }, [isOpen])

  const visibleRows = useMemo(() => {
    if (filter === "needs_review") return rows.filter(rowNeedsReview)
    return rows
  }, [rows, filter])

  const virtual = useMemo(() => {
    if (visibleRows.length <= 100) {
      return { rows: visibleRows, start: 0, before: 0, after: 0 }
    }
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
    const count = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2
    const end = Math.min(visibleRows.length, start + count)
    return {
      rows: visibleRows.slice(start, end),
      start,
      before: start * ROW_HEIGHT,
      after: Math.max(0, (visibleRows.length - end) * ROW_HEIGHT),
    }
  }, [visibleRows, scrollTop, viewportHeight])

  const stats = useMemo(() => {
    const excluded = rows.filter((row) => row.normalization_status === "excluded").length
    const needsReview = rows.filter(rowNeedsReview).length
    return {
      rows: rows.length,
      ready: Math.max(0, rows.length - excluded - needsReview),
      needsReview,
      excluded,
    }
  }, [rows])

  const selectedRows = selected.size
  const affectedByRenormalize = pendingChanges.filter((change) => change.action === "set_field").reduce((sum, change) => sum + change.rowIds.length, 0)

  function toggleRow(rowId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rowId)) next.delete(rowId)
      else next.add(rowId)
      return next
    })
  }

  function queueChange(change: PendingChange) {
    setPendingChanges((prev) => [...prev.filter((item) => item.id !== change.id), change])
  }

  function queueBulkSet(field: string, value: string) {
    const rowIds = [...selected]
    if (rowIds.length === 0) return
    queueChange({
      id: `bulk-${field}-${Date.now()}`,
      rowIds,
      action: "set_field",
      field,
      value,
      label: `Set ${field} to ${value}`,
    })
  }

  function queueBulkExclude(rowIds = [...selected]) {
    if (rowIds.length === 0) return
    queueChange({
      id: `exclude-${Date.now()}`,
      rowIds,
      action: "exclude",
      label: `Exclude ${rowIds.length} rows`,
    })
  }

  function applyFinding(finding: AnalysisFinding) {
    queueChange({
      id: `finding-${finding.id}`,
      rowIds: finding.affected_row_ids,
      action: finding.proposed_action.kind,
      field: finding.proposed_action.field,
      value: finding.proposed_action.value,
      label: finding.title,
    })
  }

  function startInlineEdit(row: DocumentFieldRow) {
    setEditingCell({ rowId: row.id, field: "vendor_name" })
    setEditValue(row.vendor_name ?? "")
  }

  function commitInlineEdit(rowId: string) {
    queueChange({
      id: `inline-vendor-${rowId}`,
      rowIds: [rowId],
      action: "set_field",
      field: "vendor_name",
      value: editValue,
      label: "Edit vendor",
    })
    setRows((prev) => prev.map((row) => row.id === rowId ? { ...row, vendor_name: editValue } : row))
    setEditingCell(null)
  }

  async function runAnalysis() {
    if (!fileId) return
    setAnalyzing(true)
    setError(null)
    try {
      const userToken = (await supabase.auth.getSession()).data.session?.access_token
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/analyze-spreadsheet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${userToken ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
        },
        body: JSON.stringify({ file_id: fileId }),
      })
      if (!res.ok) throw new Error(await res.text())
      const payload = await res.json()
      setFileMeta((prev) => ({
        analysis_json: payload,
        analyzed_at: payload.analyzed_at ?? new Date().toISOString(),
        source_rows_json: prev?.source_rows_json ?? null,
        storage_path: prev?.storage_path ?? null,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.")
    } finally {
      setAnalyzing(false)
    }
  }

  async function openFile() {
    if (!fileMeta?.storage_path) return
    const { data } = await supabase.storage.from("documents").createSignedUrl(fileMeta.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  async function saveChanges() {
    if (!fileId || pendingChanges.length === 0) return
    setSaving(true)
    setError(null)
    try {
      for (const change of pendingChanges) {
        if (change.rowIds.length === 0) continue
        if (change.action === "exclude") {
          const { error } = await supabase
            .from("document_fields")
            .update({ normalization_status: "excluded" })
            .in("id", change.rowIds)
          if (error) throw new Error(error.message)
        } else if (change.field) {
          const { error } = await supabase
            .from("document_fields")
            .update({ [change.field]: change.value ?? null })
            .in("id", change.rowIds)
          if (error) throw new Error(error.message)
        }
      }

      if (shouldRenormalize && affectedByRenormalize > 0) {
        const userToken = (await supabase.auth.getSession()).data.session?.access_token
        await Promise.allSettled(
          pendingChanges
            .filter((change) => change.action === "set_field")
            .flatMap((change) => change.rowIds)
            .map((rowId) => {
              const row = rows.find((item) => item.id === rowId)
              return fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/normalize-document`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${userToken ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
                  "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
                },
                body: JSON.stringify({ file_id: fileId, fields: row }),
              })
            }),
        )
      }

      onSaved(fileId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sheet changes.")
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const findings = analysis?.findings ?? []
  const highlightedActive = highlightedRowIds.size > 0

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/60 backdrop-blur-sm">
      <div className="m-4 flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl lg:m-8">
        <div className="flex items-center gap-4 border-b border-border px-6 py-5">
          <div className="rounded-xl bg-primary/10 p-2.5 text-primary retro-glow">
            <LayoutGrid className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-foreground" style={aldrichStyle()}>
              Refine Spreadsheet
            </h2>
            <p className="truncate font-mono text-xs text-muted-foreground">{filename}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-6 border-b border-border bg-muted/40 px-6 py-3 text-sm">
          <StatPill value={stats.rows} label="Rows" toneClass="text-foreground" />
          <StatPill value={analysis?.totals?.ready ?? stats.ready} label="Ready" toneClass="text-foreground" />
          <StatPill value={analysis?.totals?.needs_review ?? stats.needsReview} label="Needs review" toneClass="text-primary" />
          <StatPill value={analysis?.totals?.excluded ?? stats.excluded} label="Excluded" toneClass="text-muted-foreground" />
          <div className="h-4 w-px bg-border" />
          <span className="font-mono text-xs text-muted-foreground">{lastAnalyzedLabel(fileMeta?.analyzed_at ?? analysis?.analyzed_at)}</span>
          <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <span>Best fit:</span>
            <span className="font-medium text-foreground">{analysis?.best_fit_report ?? "Mixed"}</span>
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)] lg:divide-x lg:divide-border">
          <section className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              {selectedRows > 0 ? (
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{selectedRows} selected</span>
              ) : (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelected(new Set(visibleRows.map((row) => row.id)))}
                >
                  Select all
                </button>
              )}
              <div className="h-4 w-px bg-border" />
              <select
                disabled={selectedRows === 0}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-40"
                defaultValue=""
                onChange={(e) => { if (e.target.value) queueBulkSet("expense_category", e.target.value); e.currentTarget.value = "" }}
              >
                <option value="">Set category</option>
                {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              <select
                disabled={selectedRows === 0}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-40"
                defaultValue=""
                onChange={(e) => { if (e.target.value) queueBulkSet("currency", e.target.value); e.currentTarget.value = "" }}
              >
                <option value="">Set currency</option>
                {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
              </select>
              <Coins className="h-3.5 w-3.5 text-muted-foreground" />
              <button
                disabled={selectedRows === 0}
                onClick={() => queueBulkExclude()}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:opacity-40"
              >
                <EyeOff className="h-3.5 w-3.5" />
                Exclude
              </button>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setFilter("needs_review")}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${filter === "needs_review" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  Needs review · {stats.needsReview}
                </button>
                <button
                  onClick={() => setFilter("all")}
                  className={`rounded-full px-2.5 py-1 text-[11px] ${filter === "all" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}
                >
                  All · {stats.rows}
                </button>
              </div>
            </div>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-auto"
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="w-10 px-3 py-2" />
                    <th className="w-11 px-3 py-2 font-mono tabular-nums">#</th>
                    <th className="px-3 py-2">Vendor</th>
                    <th className="w-[110px] px-3 py-2">Date</th>
                    <th className="w-[120px] px-3 py-2 text-right">Amount</th>
                    <th className="w-20 px-3 py-2">Currency</th>
                    <th className="w-40 px-3 py-2">Category</th>
                    <th className="w-11 px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {virtual.before > 0 && <tr><td colSpan={8} style={{ height: virtual.before }} /></tr>}
                  {loading ? (
                    <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">Loading rows…</td></tr>
                  ) : virtual.rows.map((row, offset) => {
                    const rowNumber = virtual.start + offset + 1
                    const excluded = row.normalization_status === "excluded"
                    const lowConfidence = rowNeedsReview(row)
                    const highlighted = highlightedRowIds.has(row.id)
                    const dimmed = highlightedActive && !highlighted
                    const sourceIndex = row.raw_json?.source_index ?? rowNumber - 1
                    const sourceEntry = fileMeta?.source_rows_json?.[sourceIndex] ?? row.raw_json?.source_row ?? null
                    return (
                      <tr
                        key={row.id}
                        className={[
                          "group border-b border-border/60 transition-colors hover:bg-muted/40",
                          excluded ? "opacity-40 line-through decoration-muted-foreground/40" : "",
                          lowConfidence && !excluded ? "bg-primary/[0.03]" : "",
                          highlighted ? "ring-1 ring-inset ring-primary/40 bg-primary/[0.06]" : "",
                          dimmed ? "opacity-30" : "",
                        ].join(" ")}
                      >
                        <td className="px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={selected.has(row.id)}
                            onChange={() => toggleRow(row.id)}
                            className="h-4 w-4 rounded border-border accent-primary"
                            aria-label={`Select row ${rowNumber}`}
                          />
                        </td>
                        <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">{rowNumber}</td>
                        <td className="min-w-0 px-3 py-2.5">
                          {editingCell?.rowId === row.id ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitInlineEdit(row.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitInlineEdit(row.id)
                                if (e.key === "Escape") setEditingCell(null)
                              }}
                              className="w-full rounded border border-primary bg-background px-2 py-1 text-sm outline-none"
                            />
                          ) : (
                            <button className="max-w-full truncate text-left text-foreground hover:text-primary" onClick={() => startInlineEdit(row)}>
                              {displayVendor(row)}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">{row.document_date ?? "-"}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs tabular-nums text-foreground">{formatAmount(amountForRow(row))}</td>
                        <td className="px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground">{row.currency ?? "-"}</td>
                        <td className="px-3 py-2.5"><CategoryChip value={row.expense_category ?? row.income_source} confidence={Number(row.confidence_score ?? 0)} /></td>
                        <td className="px-3 py-2.5">
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100" aria-label="Open source row">
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-80 rounded-lg border border-border bg-popover p-4 shadow-xl">
                              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={aldrichStyle()}>Source row</div>
                              <div className="mb-3 font-mono text-xs text-muted-foreground">
                                Sheet: "{sourceEntry?.sheet_name ?? "Unknown"}" · Row {sourceEntry?.row_index ?? rowNumber}
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Original</div>
                                  {Object.entries(sourceEntry?.source_row ?? {}).slice(0, 8).map(([key, value]) => (
                                    <div key={key} className="mb-1">
                                      <div className="text-muted-foreground">{key}</div>
                                      <div className="font-mono text-foreground">{String(value ?? "")}</div>
                                    </div>
                                  ))}
                                </div>
                                <div>
                                  <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Mapped to</div>
                                  {[
                                    ["Vendor", displayVendor(row)],
                                    ["Date", row.document_date ?? "-"],
                                    ["Amount", formatAmount(amountForRow(row))],
                                    ["Category", row.expense_category ?? row.income_source ?? "-"],
                                  ].map(([key, value]) => (
                                    <div key={key} className="mb-1">
                                      <div className="text-muted-foreground">{key}</div>
                                      <div className="font-mono text-foreground">{value}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="mt-4 flex gap-2">
                                <button className="text-xs text-primary hover:underline">Trust mapping</button>
                                <button className="text-xs text-primary hover:underline" onClick={() => startInlineEdit(row)}>Edit row</button>
                                <button className="text-xs text-primary hover:underline" onClick={() => void openFile()}>Open file</button>
                              </div>
                            </PopoverContent>
                          </Popover>
                        </td>
                      </tr>
                    )
                  })}
                  {virtual.after > 0 && <tr><td colSpan={8} style={{ height: virtual.after }} /></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-border px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <div className={`h-1.5 w-1.5 rounded-full bg-primary ${analyzing ? "animate-pulse" : ""}`} />
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={aldrichStyle()}>Briefing</span>
              </div>
              {analysis?.summary ? (
                <p className="text-sm leading-relaxed text-foreground" style={instrumentStyle()}>{analysis.summary}</p>
              ) : (
                <p className="text-sm italic text-muted-foreground" style={instrumentStyle()}>
                  No briefing yet. Run an analysis to see findings.
                </p>
              )}
              <button
                onClick={() => void runAnalysis()}
                disabled={analyzing}
                className={`mt-3 inline-flex items-center gap-1.5 text-xs ${analysis ? "text-muted-foreground hover:text-foreground" : "rounded-md bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90"}`}
              >
                <RefreshCw className={`h-3 w-3 ${analyzing ? "animate-spin" : ""}`} />
                {analysis ? "Re-analyze" : "Analyze with AI"}
                <span>{analysis ? "·" : ""}</span>
                <span className="font-mono">~$0.04</span>
              </button>
              {error && <p className="mt-3 text-xs text-primary">{error}</p>}
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={aldrichStyle()}>
                  Findings · {findings.length}
                </h3>
                <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => findings.forEach(applyFinding)}>
                  Apply all ({findings.length})
                </button>
              </div>

              <div className="space-y-3">
                {findings.length === 0 ? (
                  <div className="glass-surface-sm rounded-lg p-4 text-xs text-muted-foreground">Analysis findings will appear here after the briefing completes.</div>
                ) : findings.map((finding, index) => {
                  const isPending = pendingChanges.some((change) => change.id === `finding-${finding.id}`)
                  return (
                    <div
                      key={finding.id}
                      className={`group relative rounded-lg border bg-card p-4 transition-all ${isPending ? "border-primary/40 bg-primary/[0.03]" : "border-border hover:border-primary/30 hover:shadow-sm"}`}
                      onMouseEnter={() => setHighlightedRowIds(new Set(finding.affected_row_ids))}
                      onMouseLeave={() => setHighlightedRowIds(new Set())}
                    >
                      <div className="mb-2 flex items-baseline gap-3">
                        <span className="text-xs font-medium tracking-wider text-primary tabular-nums" style={aldrichStyle()}>{String(index + 1).padStart(2, "0")} ·</span>
                        <h4 className="flex-1 text-sm font-medium text-foreground">{finding.title}</h4>
                        <ConfidenceMeter value={finding.confidence} />
                      </div>
                      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{finding.rationale}</p>
                      <div className="mb-3 flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-muted-foreground tabular-nums">{finding.affected_row_ids.length} rows</span>
                        <button className="text-primary hover:underline" onClick={() => setHighlightedRowIds(new Set(finding.affected_row_ids))}>Show in table</button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => applyFinding(finding)} className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Apply</button>
                        <button onClick={() => applyFinding(finding)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Edit</button>
                        <button className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Dismiss</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </aside>
        </div>

        <div className="flex items-center gap-3 border-t border-border bg-muted/30 px-6 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <div className="flex-1" />
          {pendingChanges.length > 0 && (
            <span className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">{pendingChanges.length}</span> change(s) pending
            </span>
          )}
          {affectedByRenormalize > 0 && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={shouldRenormalize} onChange={(e) => setShouldRenormalize(e.target.checked)} className="accent-primary" />
              Re-normalize <span className="font-mono">{affectedByRenormalize}</span> affected row{affectedByRenormalize === 1 ? "" : "s"}
            </label>
          )}
          <button
            onClick={() => void saveChanges()}
            disabled={saving || pendingChanges.length === 0}
            className="hover-bloom rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : `Save ${pendingChanges.length} change${pendingChanges.length === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  )
}
