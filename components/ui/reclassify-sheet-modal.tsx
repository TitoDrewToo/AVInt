"use client"

import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowUpRight,
  ChevronDown,
  Check,
  Coins,
  Copy,
  EyeOff,
  LayoutGrid,
  RefreshCw,
  Tag,
  X,
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "@/hooks/use-toast"

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
const RENORMALIZE_SKIP_FIELDS = new Set(["expense_category", "currency", "normalization_status"])
const FIELD_NAME_ALIASES: Record<string, string> = {
  category: "expense_category",
  expense_type: "expense_category",
  vendor: "vendor_name",
  supplier: "vendor_name",
  employer: "employer_name",
  date: "document_date",
  transaction_date: "document_date",
  amount: "total_amount",
  total: "total_amount",
  tax: "tax_amount",
  discount: "discount_amount",
  invoice: "invoice_number",
  ref: "invoice_number",
}

function normalizeFieldName(field: string): string {
  return FIELD_NAME_ALIASES[field] ?? field
}

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
  applied_finding_ids?: string[]
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
  finding_id?: string
  affected_row_ids: string[]
  action: {
    kind: "exclude" | "set_field"
    field?: string
    value?: string
  }
  label: string
}

type FindingEditState = {
  findingId: string
  selectedRowIds: Set<string>
  value: string
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

function findingMatchesRows(finding: AnalysisFinding, rows: DocumentFieldRow[]) {
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const affectedRows = finding.affected_row_ids.map((rowId) => rowById.get(rowId)).filter(Boolean) as DocumentFieldRow[]
  if (affectedRows.length === 0 || affectedRows.length !== finding.affected_row_ids.length) return false
  if (finding.proposed_action.kind === "exclude") {
    return affectedRows.every((row) => row.normalization_status === "excluded")
  }
  const field = finding.proposed_action.field
  if (!field) return false
  const normalizedField = normalizeFieldName(field)
  if (!(normalizedField in (affectedRows[0] ?? {}))) return false
  const proposedValue = finding.proposed_action.value
  // Empty proposed values cannot prove a user applied this action. Only
  // explicit applied_finding_ids should mark those findings as applied.
  if (proposedValue === null || proposedValue === undefined || proposedValue === "") return false
  return affectedRows.every((row) => {
    const rowValue = (row as any)[normalizedField]
    if (rowValue === null || rowValue === undefined) return false
    return String(rowValue) === String(proposedValue)
  })
}

function persistedAppliedFindingIds(analysis: SheetAnalysis | null, rows: DocumentFieldRow[]) {
  const explicit = new Set(analysis?.applied_finding_ids ?? [])
  for (const finding of analysis?.findings ?? []) {
    if (findingMatchesRows(finding, rows)) explicit.add(finding.id)
  }
  return explicit
}

function filterAnalysisAppliedFindingIds(analysis: SheetAnalysis): SheetAnalysis {
  const findingIds = new Set((analysis.findings ?? []).map((finding) => finding.id))
  return {
    ...analysis,
    applied_finding_ids: (analysis.applied_finding_ids ?? []).filter((id) => findingIds.has(id)),
  }
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

function Tip({ children, text }: { children: ReactElement; text: string }) {
  return (
    <Tooltip delayDuration={500}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent sideOffset={6}>{text}</TooltipContent>
    </Tooltip>
  )
}

function StatPill({ value, label, toneClass, tooltip }: { value: number; label: string; toneClass: string; tooltip: string }) {
  const [displayValue, setDisplayValue] = useState(value)
  const [pulsing, setPulsing] = useState(false)
  const previousValueRef = useRef(value)

  useEffect(() => {
    const from = previousValueRef.current
    if (from === value) return
    previousValueRef.current = value
    const startedAt = performance.now()
    let frame = 0
    setPulsing(true)
    const step = () => {
      const progress = Math.min(1, (performance.now() - startedAt) / 400)
      setDisplayValue(Math.round(from + (value - from) * progress))
      if (progress < 1) {
        frame = requestAnimationFrame(step)
      } else {
        window.setTimeout(() => setPulsing(false), 600)
      }
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <Tip text={tooltip}>
      <div className={`flex cursor-help items-baseline gap-1.5 rounded-md px-1.5 py-1 transition-shadow ${pulsing ? "shadow-[0_0_0_1px_rgba(239,68,68,0.35),0_0_18px_rgba(239,68,68,0.18)]" : ""}`}>
        <span className={`font-mono text-base font-semibold tabular-nums ${toneClass}`}>{displayValue}</span>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
    </Tip>
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

function updatedLabel(value: string | null | undefined) {
  if (!value) return null
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return "Updated now"
  if (minutes < 60) return `Updated ${minutes} min ago`
  return `Updated ${Math.round(minutes / 60)} hr ago`
}

export function ReclassifySheetModal({ isOpen, fileId, filename, onClose, onSaved }: ReclassifySheetModalProps) {
  const [rows, setRows] = useState<DocumentFieldRow[]>([])
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [highlightedRowIds, setHighlightedRowIds] = useState<Set<string>>(new Set())
  const [pulseRowIds, setPulseRowIds] = useState<Set<string>>(new Set())
  const [acceptedFindingIds, setAcceptedFindingIds] = useState<Set<string>>(new Set())
  const [appliedFindingIds, setAppliedFindingIds] = useState<Set<string>>(new Set())
  const [dismissedFindingIds, setDismissedFindingIds] = useState<Set<string>>(new Set())
  const [fieldFlashRowIds, setFieldFlashRowIds] = useState<Set<string>>(new Set())
  const [editingFinding, setEditingFinding] = useState<FindingEditState | null>(null)
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
  const [copiedJson, setCopiedJson] = useState(false)
  const [saveNotice, setSaveNotice] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const autoAnalyzeStartedRef = useRef<string | null>(null)
  const pulseTimeoutRef = useRef<number | null>(null)
  const fieldFlashTimeoutRef = useRef<number | null>(null)
  const saveNoticeTimeoutRef = useRef<number | null>(null)

  const analysis = fileMeta?.analysis_json ?? null

  const loadSheet = useCallback(async (options: { resetWorkflow?: boolean } = {}) => {
    if (!fileId) return
    const resetWorkflow = options.resetWorkflow ?? true
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
      setAppliedFindingIds(persistedAppliedFindingIds((fileData as FileMeta).analysis_json, (fieldRows ?? []) as DocumentFieldRow[]))
      if (resetWorkflow) {
        setSelected(new Set())
        setPendingChanges([])
        setAcceptedFindingIds(new Set())
        setDismissedFindingIds(new Set())
        setEditingFinding(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sheet rows.")
    } finally {
      setLoading(false)
    }
  }, [fileId])

  useEffect(() => {
    if (!isOpen) return
    void loadSheet({ resetWorkflow: true })
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
  const rowById = useMemo(() => new Map(rows.map((row, index) => [row.id, { row, index }])), [rows])
  const renormalizableChanges = useMemo(
    () => pendingChanges.filter((change) => change.action.kind === "set_field" && Boolean(change.action.field) && !RENORMALIZE_SKIP_FIELDS.has(change.action.field ?? "")),
    [pendingChanges],
  )
  const affectedByRenormalize = useMemo(
    () => new Set(renormalizableChanges.flatMap((change) => change.affected_row_ids)).size,
    [renormalizableChanges],
  )
  const shouldShowRenormalize = affectedByRenormalize > 0

  useEffect(() => {
    setShouldRenormalize(shouldShowRenormalize)
  }, [shouldShowRenormalize])

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) window.clearTimeout(pulseTimeoutRef.current)
      if (fieldFlashTimeoutRef.current) window.clearTimeout(fieldFlashTimeoutRef.current)
      if (saveNoticeTimeoutRef.current) window.clearTimeout(saveNoticeTimeoutRef.current)
    }
  }, [])

  const copyAsJson = useCallback(async () => {
    if (!fileId) return
    const payload = {
      file_id: fileId,
      filename,
      stats: {
        rows: stats.rows,
        ready: analysis?.totals?.ready ?? stats.ready,
        needs_review: analysis?.totals?.needs_review ?? stats.needsReview,
        excluded: analysis?.totals?.excluded ?? stats.excluded,
      },
      best_fit_report: analysis?.best_fit_report ?? "Mixed",
      briefing: {
        summary: analysis?.summary ?? "",
        analyzed_at: fileMeta?.analyzed_at ?? analysis?.analyzed_at ?? null,
        exists: Boolean(analysis?.summary),
      },
      findings: (analysis?.findings ?? []).map((finding) => ({
        id: finding.id,
        type: finding.type,
        title: finding.title,
        rationale: finding.rationale,
        confidence: finding.confidence,
        affected_row_count: finding.affected_row_ids.length,
      })),
      rows: rows.map((row, index) => {
        const sourceIndex = row.raw_json?.source_index ?? index
        const sourceEntry = fileMeta?.source_rows_json?.[sourceIndex] ?? row.raw_json?.source_row ?? null
        return {
          row_index: sourceEntry?.row_index ?? index + 1,
          vendor: displayVendor(row),
          date: row.document_date,
          amount: amountForRow(row),
          currency: row.currency,
          category: row.expense_category ?? row.income_source,
          source_sheet: row.raw_json?.source_sheet ?? sourceEntry?.sheet_name ?? null,
          custom_fields: row.raw_json?.custom_fields ?? row.raw_json?.gemini_raw?._custom_fields ?? null,
          normalization_status: row.normalization_status,
        }
      }),
      ui_state: {
        selected_count: selected.size,
        filter,
        pending_changes_count: pendingChanges.length,
      },
    }

    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    setCopiedJson(true)
    window.setTimeout(() => setCopiedJson(false), 2000)
  }, [analysis, fileId, fileMeta, filename, filter, pendingChanges.length, rows, selected.size, stats])

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
      affected_row_ids: rowIds,
      action: { kind: "set_field", field, value },
      label: `Set ${field} to ${value}`,
    })
  }

  function queueBulkExclude(rowIds = [...selected]) {
    if (rowIds.length === 0) return
    queueChange({
      id: `exclude-${Date.now()}`,
      affected_row_ids: rowIds,
      action: { kind: "exclude" },
      label: `Exclude ${rowIds.length} rows`,
    })
  }

  function flashRows(rowIds: string[]) {
    if (pulseTimeoutRef.current) window.clearTimeout(pulseTimeoutRef.current)
    setPulseRowIds(new Set(rowIds))
    pulseTimeoutRef.current = window.setTimeout(() => setPulseRowIds(new Set()), 1500)
  }

  function flashFieldRows(rowIds: string[]) {
    if (fieldFlashTimeoutRef.current) window.clearTimeout(fieldFlashTimeoutRef.current)
    setFieldFlashRowIds(new Set(rowIds))
    fieldFlashTimeoutRef.current = window.setTimeout(() => setFieldFlashRowIds(new Set()), 800)
  }

  function applyFinding(finding: AnalysisFinding, rowIds = finding.affected_row_ids, value = finding.proposed_action.value) {
    const curatedRowIds = rowIds.filter((rowId) => rowById.has(rowId))
    if (curatedRowIds.length === 0) return
    flashRows(curatedRowIds)
    queueChange({
      id: `finding-${finding.id}`,
      finding_id: finding.id,
      affected_row_ids: curatedRowIds,
      action: {
        kind: finding.proposed_action.kind,
        field: finding.proposed_action.field,
        value,
      },
      label: finding.title,
    })
    setAcceptedFindingIds((prev) => new Set(prev).add(finding.id))
    setEditingFinding(null)
  }

  function summarizeSavedChanges(changes: PendingChange[]) {
    const rowsExcluded = new Set(changes.filter((change) => change.action.kind === "exclude").flatMap((change) => change.affected_row_ids)).size
    const findingsApplied = changes.filter((change) => Boolean(change.finding_id)).length
    if (rowsExcluded > 0 || findingsApplied > 0) {
      return [
        rowsExcluded > 0 ? `${rowsExcluded} row${rowsExcluded === 1 ? "" : "s"} excluded` : null,
        findingsApplied > 0 ? `${findingsApplied} finding${findingsApplied === 1 ? "" : "s"} applied` : null,
      ].filter(Boolean).join(" · ")
    }
    return `${changes.length} change${changes.length === 1 ? "" : "s"} saved`
  }

  function startFindingEdit(finding: AnalysisFinding) {
    setEditingFinding({
      findingId: finding.id,
      selectedRowIds: new Set(finding.affected_row_ids.filter((rowId) => rowById.has(rowId))),
      value: finding.proposed_action.value ?? "",
    })
  }

  function toggleFindingEditRow(rowId: string) {
    setEditingFinding((prev) => {
      if (!prev) return prev
      const selectedRowIds = new Set(prev.selectedRowIds)
      if (selectedRowIds.has(rowId)) selectedRowIds.delete(rowId)
      else selectedRowIds.add(rowId)
      return { ...prev, selectedRowIds }
    })
  }

  function startInlineEdit(row: DocumentFieldRow) {
    setEditingCell({ rowId: row.id, field: "vendor_name" })
    setEditValue(row.vendor_name ?? "")
  }

  function commitInlineEdit(rowId: string) {
    queueChange({
      id: `inline-vendor-${rowId}`,
      affected_row_ids: [rowId],
      action: { kind: "set_field", field: "vendor_name", value: editValue },
      label: "Edit vendor",
    })
    setRows((prev) => prev.map((row) => row.id === rowId ? { ...row, vendor_name: editValue } : row))
    setEditingCell(null)
  }

  const runAnalysis = useCallback(async () => {
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
      const nextAnalysis = filterAnalysisAppliedFindingIds(payload)
      if (JSON.stringify(nextAnalysis.applied_finding_ids ?? []) !== JSON.stringify(payload.applied_finding_ids ?? [])) {
        const { error: staleAppliedError } = await supabase
          .from("files")
          .update({ analysis_json: nextAnalysis })
          .eq("id", fileId)
        if (staleAppliedError) throw new Error(staleAppliedError.message)
      }
      setFileMeta((prev) => ({
        analysis_json: nextAnalysis,
        analyzed_at: nextAnalysis.analyzed_at ?? new Date().toISOString(),
        source_rows_json: prev?.source_rows_json ?? null,
        storage_path: prev?.storage_path ?? null,
      }))
      setAppliedFindingIds(persistedAppliedFindingIds(nextAnalysis, rows))
      setAcceptedFindingIds(new Set())
      setPendingChanges([])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.")
    } finally {
      setAnalyzing(false)
    }
  }, [fileId, rows])

  useEffect(() => {
    if (!isOpen) {
      autoAnalyzeStartedRef.current = null
      return
    }
    if (!fileId || loading || analyzing || !fileMeta || rows.length === 0) return
    if (fileMeta.analysis_json) return
    if (autoAnalyzeStartedRef.current === fileId) return
    autoAnalyzeStartedRef.current = fileId
    void runAnalysis()
  }, [analyzing, fileId, fileMeta, isOpen, loading, rows.length, runAnalysis])

  async function openFile() {
    if (!fileMeta?.storage_path) return
    const { data } = await supabase.storage.from("documents").createSignedUrl(fileMeta.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  async function saveChanges() {
    if (!fileId || pendingChanges.length === 0) return
    setSaving(true)
    setError(null)
    const changesToSave = pendingChanges
    const pendingCount = changesToSave.length
    const affectedRowIds = [...new Set(changesToSave.flatMap((change) => change.affected_row_ids))]
    const fieldChangedRowIds = [...new Set(changesToSave.filter((change) => change.action.kind === "set_field").flatMap((change) => change.affected_row_ids))]
    const savedFindingIds = changesToSave.flatMap((change) => change.finding_id ? [change.finding_id] : [])
    try {
      console.log("[save] starting", { pendingCount, fileId })
      for (const change of changesToSave) {
        if (change.affected_row_ids.length === 0) continue
        const kind = change.action.kind
        const field = change.action.field
        const value = change.action.value
        const affectedCount = change.affected_row_ids.length
        console.log("[save] processing change", { kind, affectedCount, field, value })
        if (kind === "exclude") {
          const { data, error } = await supabase
            .from("document_fields")
            .update({ normalization_status: "excluded" })
            .in("id", change.affected_row_ids)
            .select("id")
          console.log("[save] update result", { data, error, rowsAffected: data?.length })
          if (error) throw new Error(error.message)
          if ((data?.length ?? 0) !== affectedCount) {
            throw new Error(`Expected to exclude ${affectedCount} row${affectedCount === 1 ? "" : "s"}, but database updated ${data?.length ?? 0}.`)
          }
        } else if (field) {
          const normalizedField = normalizeFieldName(field)
          const { data, error } = await supabase
            .from("document_fields")
            .update({ [normalizedField]: value ?? null })
            .in("id", change.affected_row_ids)
            .select("id")
          console.log("[save] update result", {
            data,
            error,
            rowsAffected: data?.length,
            originalField: field,
            normalizedField,
          })
          if (error) throw new Error(error.message)
          if ((data?.length ?? 0) !== affectedCount) {
            throw new Error(`Expected to update ${affectedCount} row${affectedCount === 1 ? "" : "s"}, but database updated ${data?.length ?? 0}.`)
          }
        } else {
          throw new Error("Set-field change is missing a field name.")
        }
      }

      const currentAnalysisJson = fileMeta?.analysis_json ?? {}
      const newAppliedIds = [
        ...(currentAnalysisJson.applied_finding_ids ?? []),
        ...savedFindingIds,
      ]
      const nextAnalysis = { ...currentAnalysisJson, applied_finding_ids: [...new Set(newAppliedIds)] }
      console.log("[save] updating analysis_json", { newAppliedIds: nextAnalysis.applied_finding_ids })
      const { error: analysisUpdateError } = await supabase
        .from("files")
        .update({ analysis_json: nextAnalysis })
        .eq("id", fileId)
      if (analysisUpdateError) throw new Error(analysisUpdateError.message)

      if (shouldRenormalize && affectedByRenormalize > 0) {
        const userToken = (await supabase.auth.getSession()).data.session?.access_token
        const rowIdsToRenormalize = [...new Set(renormalizableChanges.flatMap((change) => change.affected_row_ids))]
        await Promise.allSettled(
          rowIdsToRenormalize.map((rowId) => {
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
      const nextFileMeta = fileData as FileMeta
      const nextRows = (fieldRows ?? []) as DocumentFieldRow[]

      setFileMeta(nextFileMeta)
      setRows(nextRows)
      setAppliedFindingIds(persistedAppliedFindingIds(nextFileMeta.analysis_json, nextRows))
      setAcceptedFindingIds((prev) => {
        const next = new Set(prev)
        savedFindingIds.forEach((id) => next.add(id))
        return next
      })
      flashRows(affectedRowIds)
      if (fieldChangedRowIds.length > 0) flashFieldRows(fieldChangedRowIds)
      onSaved(fileId)
      setPendingChanges([])
      setSelected(new Set())
      setSaveNotice(summarizeSavedChanges(changesToSave) || `${pendingCount} change${pendingCount === 1 ? "" : "s"} saved`)
      if (saveNoticeTimeoutRef.current) window.clearTimeout(saveNoticeTimeoutRef.current)
      saveNoticeTimeoutRef.current = window.setTimeout(() => setSaveNotice(null), 2000)
      console.log("[save] complete")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save sheet changes."
      setError(`Save failed: ${message}`)
      toast({
        variant: "destructive",
        title: `Save failed: ${message}`,
      })
    } finally {
      setSaving(false)
    }
  }

  const findings = useMemo(() => {
    const visible = (analysis?.findings ?? []).filter((finding) => !dismissedFindingIds.has(finding.id))
    return [...visible].sort((a, b) => Number(appliedFindingIds.has(a.id)) - Number(appliedFindingIds.has(b.id)))
  }, [analysis?.findings, appliedFindingIds, dismissedFindingIds])
  const appliedFindingCount = findings.filter((finding) => appliedFindingIds.has(finding.id)).length
  const pendingFindingCount = findings.length - appliedFindingCount
  const highlightedActive = highlightedRowIds.size > 0

  if (!isOpen) return null

  return (
    <TooltipProvider delayDuration={500}>
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
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => void copyAsJson()}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {copiedJson ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                Copy as JSON
              </button>
              {copiedJson && (
                <span className="absolute right-0 top-10 rounded-md border border-border bg-popover px-2 py-1 text-[11px] text-foreground shadow-md">
                  Copied
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6 border-b border-border bg-muted/40 px-6 py-3 text-sm">
          <StatPill value={stats.rows} label="Rows" toneClass="text-foreground" tooltip="Total rows extracted from spreadsheet" />
          <StatPill value={analysis?.totals?.ready ?? stats.ready} label="Ready" toneClass="text-foreground" tooltip="Rows with vendor and amount populated, ready for reports" />
          <StatPill value={analysis?.totals?.needs_review ?? stats.needsReview} label="Needs review" toneClass="text-primary" tooltip="Rows missing core fields (vendor, amount) - review recommended" />
          <StatPill value={analysis?.totals?.excluded ?? stats.excluded} label="Excluded" toneClass="text-muted-foreground" tooltip="Rows excluded from reports and analytics" />
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
              <Tip text={selectedRows > 0 ? `Apply to ${selectedRows} selected rows` : "Select rows first"}>
                <select
                  disabled={selectedRows === 0}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-40"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) queueBulkSet("expense_category", e.target.value); e.currentTarget.value = "" }}
                >
                  <option value="">Set category</option>
                  {EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </Tip>
              <Tag className="h-3.5 w-3.5 text-muted-foreground" />
              <Tip text={selectedRows > 0 ? `Apply to ${selectedRows} selected rows` : "Select rows first"}>
                <select
                  disabled={selectedRows === 0}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs disabled:opacity-40"
                  defaultValue=""
                  onChange={(e) => { if (e.target.value) queueBulkSet("currency", e.target.value); e.currentTarget.value = "" }}
                >
                  <option value="">Set currency</option>
                  {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
                </select>
              </Tip>
              <Coins className="h-3.5 w-3.5 text-muted-foreground" />
              <Tip text={selectedRows > 0 ? `Apply to ${selectedRows} selected rows` : "Select rows first"}>
                <button
                  disabled={selectedRows === 0}
                  onClick={() => queueBulkExclude()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs hover:bg-muted disabled:opacity-40"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  Exclude
                </button>
              </Tip>
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
                    const pulsed = pulseRowIds.has(row.id)
                    const fieldFlashing = fieldFlashRowIds.has(row.id)
                    const dimmed = highlightedActive && !highlighted
                    const sourceIndex = row.raw_json?.source_index ?? rowNumber - 1
                    const sourceEntry = fileMeta?.source_rows_json?.[sourceIndex] ?? row.raw_json?.source_row ?? null
                    const sourceCells = sourceEntry?.cells ?? sourceEntry?.source_row ?? {}
                    return (
                      <tr
                        key={row.id}
                        className={[
                          "group border-b border-border/60 transition-colors hover:bg-muted/40",
                          excluded ? "opacity-40 line-through decoration-muted-foreground/40" : "",
                          lowConfidence && !excluded ? "bg-primary/[0.03]" : "",
                          highlighted ? "ring-1 ring-inset ring-primary/40 bg-primary/[0.06]" : "",
                          pulsed ? "ring-2 ring-inset ring-red-400/40 bg-red-500/[0.05]" : "",
                          fieldFlashing ? "bg-primary/[0.08]" : "",
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
                        <td className={`px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground transition-colors ${fieldFlashing ? "bg-primary/10" : ""}`}>{row.document_date ?? "-"}</td>
                        <td className={`px-3 py-2.5 text-right font-mono text-xs tabular-nums text-foreground transition-colors ${fieldFlashing ? "bg-primary/10" : ""}`}>{formatAmount(amountForRow(row))}</td>
                        <td className={`px-3 py-2.5 font-mono text-xs tabular-nums text-muted-foreground transition-colors ${fieldFlashing ? "bg-primary/10" : ""}`}>{row.currency ?? "-"}</td>
                        <td className={`px-3 py-2.5 transition-colors ${fieldFlashing ? "bg-primary/10" : ""}`}><CategoryChip value={row.expense_category ?? row.income_source} confidence={Number(row.confidence_score ?? 0)} /></td>
                        <td className="px-3 py-2.5">
                          <Popover>
                            <Tooltip delayDuration={500}>
                              <TooltipTrigger asChild>
                                <PopoverTrigger asChild>
                                  <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100" aria-label="Open source row">
                                    <ArrowUpRight className="h-3.5 w-3.5" />
                                  </button>
                                </PopoverTrigger>
                              </TooltipTrigger>
                              <TooltipContent sideOffset={6}>Show original spreadsheet row data</TooltipContent>
                            </Tooltip>
                            <PopoverContent align="end" className="w-80 rounded-lg border border-border bg-popover p-4 shadow-xl">
                              <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground" style={aldrichStyle()}>Source row</div>
                              <div className="mb-3 font-mono text-xs text-muted-foreground">
                                Sheet: "{sourceEntry?.sheet_name ?? "Unknown"}" · Row {sourceEntry?.row_index ?? rowNumber}
                              </div>
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                  <div className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">Original</div>
                                  {Object.entries(sourceCells).slice(0, 8).map(([key, value]) => (
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
                <p className="text-sm leading-relaxed text-foreground">{analysis.summary}</p>
              ) : analyzing ? (
                <p className="text-sm text-muted-foreground">
                  Analyzing spreadsheet…
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  No briefing yet.
                </p>
              )}
              <Tip text="Re-run AI analysis on this spreadsheet (~5-15s)">
                <button
                  onClick={() => void runAnalysis()}
                  disabled={analyzing}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${analyzing ? "animate-spin" : ""}`} />
                  Re-analyze
                </button>
              </Tip>
              {analysis && updatedLabel(fileMeta?.analyzed_at ?? analysis.analyzed_at) && (
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  {updatedLabel(fileMeta?.analyzed_at ?? analysis.analyzed_at)}
                </span>
              )}
              {error && <p className="mt-3 text-xs text-primary">{error}</p>}
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground" style={aldrichStyle()}>
                  {appliedFindingCount > 0
                    ? `${pendingFindingCount} pending · ${appliedFindingCount} applied`
                    : `Findings · ${findings.length}`}
                </h3>
                <button className="text-[11px] text-muted-foreground hover:text-foreground" onClick={() => findings.forEach((finding) => applyFinding(finding))}>
                  Apply all ({findings.length})
                </button>
              </div>

              <div className="space-y-3">
                {findings.length === 0 ? (
                  <div className="glass-surface-sm rounded-lg p-4 text-xs text-muted-foreground">Analysis findings will appear here after the briefing completes.</div>
                ) : findings.map((finding, index) => {
                  const isPending = pendingChanges.some((change) => change.id === `finding-${finding.id}`)
                  const isAccepted = isPending || acceptedFindingIds.has(finding.id)
                  const isApplied = appliedFindingIds.has(finding.id)
                  const editedFinding = editingFinding?.findingId === finding.id ? editingFinding : null
                  const affectedRows = finding.affected_row_ids
                    .map((rowId) => rowById.get(rowId))
                    .filter((entry): entry is { row: DocumentFieldRow; index: number } => Boolean(entry))
                  const canEditValue = finding.proposed_action.kind === "set_field"
                  return (
                    <div
                      key={finding.id}
                      className={`group relative rounded-lg border bg-card p-4 transition-all ${
                        isApplied
                          ? "border-primary/20 bg-primary/[0.02] opacity-50"
                          : isAccepted
                          ? "border-primary/40 bg-primary/[0.03]"
                          : "border-border hover:border-primary/30 hover:shadow-sm"
                      }`}
                      onMouseEnter={() => setHighlightedRowIds(new Set(finding.affected_row_ids))}
                      onMouseLeave={() => setHighlightedRowIds(new Set())}
                    >
                      <div className="mb-2 flex items-baseline gap-3">
                        <span className="text-xs font-medium tracking-wider text-primary tabular-nums" style={aldrichStyle()}>{String(index + 1).padStart(2, "0")} ·</span>
                        <h4 className="flex-1 text-sm font-medium text-foreground">{finding.title}</h4>
                        <Tip text={`AI confidence: ${Math.round(finding.confidence * 100)}%`}>
                          <ConfidenceMeter value={finding.confidence} />
                        </Tip>
                      </div>
                      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{finding.rationale}</p>
                      <div className="mb-3 flex items-center gap-2 text-[11px]">
                        <span className="font-mono text-muted-foreground tabular-nums">{finding.affected_row_ids.length} rows</span>
                        <button className="text-primary hover:underline" onClick={() => setHighlightedRowIds(new Set(finding.affected_row_ids))}>Show in table</button>
                      </div>
                      <div className="flex items-center gap-2">
                        {isApplied ? (
                          <span className="flex-1 rounded-md border border-primary/20 bg-primary/[0.04] px-3 py-1.5 text-center text-xs font-medium text-primary">
                            ✓ Applied
                          </span>
                        ) : (
                          <>
                            <Tip text={`Apply this suggestion to ${finding.affected_row_ids.length} affected rows`}>
                              <button onClick={() => applyFinding(finding)} className="flex-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">Apply</button>
                            </Tip>
                            <Tip text="Review and modify before applying">
                              <button onClick={() => startFindingEdit(finding)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">Edit</button>
                            </Tip>
                            <Tip text="Skip this suggestion (won't apply)">
                              <button
                                onClick={() => setDismissedFindingIds((prev) => new Set(prev).add(finding.id))}
                                className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                              >
                                Dismiss
                              </button>
                            </Tip>
                          </>
                        )}
                      </div>
                      {editedFinding && !isApplied && (
                        <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
                          {canEditValue && (
                            <label className="mb-3 block text-xs text-muted-foreground">
                              Proposed value
                              <input
                                value={editedFinding.value}
                                onChange={(e) => setEditingFinding((prev) => prev ? { ...prev, value: e.target.value } : prev)}
                                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                              />
                            </label>
                          )}
                          <div className="max-h-44 space-y-1 overflow-auto pr-1">
                            {affectedRows.map(({ row, index: rowIndex }) => (
                              <label key={row.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-background/70">
                                <input
                                  type="checkbox"
                                  checked={editedFinding.selectedRowIds.has(row.id)}
                                  onChange={() => toggleFindingEditRow(row.id)}
                                  className="h-3.5 w-3.5 accent-primary"
                                />
                                <span className="w-8 font-mono text-muted-foreground tabular-nums">{rowIndex + 1}</span>
                                <span className="min-w-0 flex-1 truncate text-foreground">{displayVendor(row)}</span>
                                <span className="w-20 text-right font-mono text-muted-foreground">{formatAmount(amountForRow(row))}</span>
                                <span className="w-10 font-mono text-muted-foreground">{row.currency ?? "-"}</span>
                                <span className="w-24 truncate text-muted-foreground">{row.expense_category ?? row.income_source ?? "-"}</span>
                              </label>
                            ))}
                          </div>
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <button onClick={() => setEditingFinding(null)} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                            <button
                              onClick={() => applyFinding(finding, [...editedFinding.selectedRowIds], canEditValue ? editedFinding.value : finding.proposed_action.value)}
                              disabled={editedFinding.selectedRowIds.size === 0}
                              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                            >
                              Apply with edits
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </aside>
        </div>

        <div className="relative flex items-center gap-3 border-t border-border bg-muted/30 px-6 py-3">
          {saveNotice && (
            <div className="absolute bottom-full left-1/2 mb-3 -translate-x-1/2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 shadow-lg">
              {saveNotice}
            </div>
          )}
          <div className="flex-1" />
          {pendingChanges.length > 0 && (
            <span className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground">{pendingChanges.length}</span> change(s) pending
            </span>
          )}
          {shouldShowRenormalize && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={shouldRenormalize} onChange={(e) => setShouldRenormalize(e.target.checked)} className="accent-primary" />
              Re-normalize <span className="font-mono">{affectedByRenormalize}</span> affected row{affectedByRenormalize === 1 ? "" : "s"} - refreshes AI-derived fields
            </label>
          )}
          <Tip text={pendingChanges.length > 0 ? "Close without committing pending changes" : "Close"}>
            <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Done</button>
          </Tip>
          <Tip text={`Commit ${pendingChanges.length} pending changes to database`}>
            <span className="inline-flex">
              <button
                onClick={() => void saveChanges()}
                disabled={saving || pendingChanges.length === 0}
                className="hover-bloom rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : `Save ${pendingChanges.length} change${pendingChanges.length === 1 ? "" : "s"}`}
              </button>
            </span>
          </Tip>
        </div>
      </div>
    </div>
    </TooltipProvider>
  )
}
