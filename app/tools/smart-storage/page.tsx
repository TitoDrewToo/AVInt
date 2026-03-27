"use client"

import { useState, useEffect, useCallback } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import { supabase } from "@/lib/supabase"
import type { Session } from "@supabase/supabase-js"
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  File,
  Calendar,
} from "lucide-react"

// ── Document type normalization ───────────────────────────────────────────────

const SUPPORTED_DOCUMENT_TYPES = [
  "receipt",
  "invoice",
  "payslip",
  "income_statement",
  "bank_statement",
  "transaction_record",
  "contract",
  "agreement",
  "tax_document",
  "general_document",
] as const

type DocumentType = typeof SUPPORTED_DOCUMENT_TYPES[number]

const DOCUMENT_TYPE_ALIASES: Record<string, DocumentType> = {
  "expense receipt": "receipt",
  "expense": "receipt",
  "bill": "receipt",
  "salary slip": "payslip",
  "pay slip": "payslip",
  "paycheck": "payslip",
  "wage slip": "payslip",
  "employment agreement": "contract",
  "service agreement": "contract",
  "nda": "contract",
  "bank record": "bank_statement",
  "account statement": "bank_statement",
  "income record": "income_statement",
  "earnings statement": "income_statement",
  "tax form": "tax_document",
  "tax return": "tax_document",
  "transaction": "transaction_record",
}

const CONFIDENCE_THRESHOLD = 0.7

function normalizeDocumentType(raw: string, confidence: number): DocumentType {
  if (confidence < CONFIDENCE_THRESHOLD) return "general_document"
  const lower = raw.toLowerCase().trim()
  if (SUPPORTED_DOCUMENT_TYPES.includes(lower as DocumentType)) return lower as DocumentType
  if (DOCUMENT_TYPE_ALIASES[lower]) return DOCUMENT_TYPE_ALIASES[lower]
  // partial match
  for (const [alias, type] of Object.entries(DOCUMENT_TYPE_ALIASES)) {
    if (lower.includes(alias) || alias.includes(lower)) return type
  }
  return "general_document"
}

// ── Date range ────────────────────────────────────────────────────────────────

type DateRangePreset = "30d" | "90d" | "this_year" | "prev_year" | "custom"

interface DateRange {
  preset: DateRangePreset
  from: string
  to: string
}

function getPresetRange(preset: DateRangePreset): { from: string; to: string } {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, "0")
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const today = fmt(now)

  switch (preset) {
    case "30d": {
      const from = new Date(now); from.setDate(from.getDate() - 30)
      return { from: fmt(from), to: today }
    }
    case "90d": {
      const from = new Date(now); from.setDate(from.getDate() - 90)
      return { from: fmt(from), to: today }
    }
    case "this_year":
      return { from: `${now.getFullYear()}-01-01`, to: today }
    case "prev_year":
      return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` }
    default:
      return { from: "", to: today }
  }
}

// ── Report definitions ────────────────────────────────────────────────────────

interface ReportDef {
  id: string
  label: string
  // minimum field requirements to be enabled
  requires: "any_file" | "date_and_amount_2" | "income_amount" | "expense_or_income" | "contract_fields"
}

const REPORTS: ReportDef[] = [
  { id: "expense_summary",       label: "Expense Summary",         requires: "date_and_amount_2" },
  { id: "receipt_extraction",    label: "Receipt Extraction Report",requires: "date_and_amount_2" },
  { id: "income_summary",        label: "Income Summary",          requires: "income_amount" },
  { id: "profit_loss",           label: "Profit & Loss Summary",   requires: "expense_or_income" },
  { id: "tax_bundle",            label: "Tax Bundle Summary",      requires: "expense_or_income" },
  { id: "transaction_summary",   label: "Transaction Summary",     requires: "date_and_amount_2" },
  { id: "document_index",        label: "Document Index",          requires: "any_file" },
  { id: "contract_summary",      label: "Contract Summary",        requires: "contract_fields" },
  { id: "key_terms",             label: "Key Terms Summary",       requires: "contract_fields" },
  { id: "general_summary",       label: "General Document Summary",requires: "any_file" },
]

// ── Folder tree ───────────────────────────────────────────────────────────────

const userFolders = [
  {
    name: "Documents",
    children: [
      {
        name: "Receipts",
        children: [
          { name: "2026", children: [] },
          { name: "2025", children: [] },
        ],
      },
      { name: "Invoices", children: [] },
      { name: "Contracts", children: [] },
    ],
  },
  { name: "Personal", children: [] },
  { name: "Business", children: [] },
]

const classificationFolders = [
  "Unclassified",
  "Receipts",
  "Income",
  "Tax",
  "Contracts",
  "Legal",
  "Other",
]

const workspaceFolders = [
  { name: "Receipts 2026" },
  { name: "Invoices" },
  { name: "Contracts" },
  { name: "Tax Documents" },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function FolderTreeItem({
  folder,
  level = 0,
  selectedFolder,
  onSelect,
}: {
  folder: { name: string; children?: { name: string; children?: any[] }[] }
  level?: number
  selectedFolder: string | null
  onSelect: (name: string) => void
}) {
  const [isOpen, setIsOpen] = useState(level === 0)
  const hasChildren = folder.children && folder.children.length > 0
  const isSelected = selectedFolder === folder.name

  return (
    <div>
      <button
        onClick={() => {
          onSelect(folder.name)
          if (hasChildren) setIsOpen(!isOpen)
        }}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${
          isSelected ? "bg-muted text-foreground" : "text-muted-foreground"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {hasChildren ? (
          isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <span className="w-3.5" />
        )}
        {isOpen && hasChildren ? (
          <FolderOpen className="h-4 w-4 shrink-0 text-primary/70" />
        ) : (
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{folder.name}</span>
      </button>
      {isOpen && hasChildren && (
        <div>
          {folder.children!.map((child) => (
            <FolderTreeItem
              key={child.name}
              folder={child}
              level={level + 1}
              selectedFolder={selectedFolder}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DateRangeSelector({
  dateRange,
  onChange,
}: {
  dateRange: DateRange
  onChange: (range: DateRange) => void
}) {
  const presets: { label: string; value: DateRangePreset }[] = [
    { label: "Last 30 days", value: "30d" },
    { label: "Last 90 days", value: "90d" },
    { label: "This year",    value: "this_year" },
    { label: "Prev year",    value: "prev_year" },
    { label: "Custom",       value: "custom" },
  ]

  const handlePreset = (preset: DateRangePreset) => {
    const { from, to } = getPresetRange(preset)
    onChange({ preset, from, to })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => handlePreset(p.value)}
            className={`rounded-md px-2 py-1 text-xs transition-colors ${
              dateRange.preset === p.value
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {dateRange.preset === "custom" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-6 text-xs text-muted-foreground">From</span>
            <Input
              type="date"
              value={dateRange.from}
              onChange={(e) => onChange({ ...dateRange, from: e.target.value })}
              className="h-7 rounded-md text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 text-xs text-muted-foreground">To</span>
            <Input
              type="date"
              value={dateRange.to}
              onChange={(e) => onChange({ ...dateRange, to: e.target.value })}
              className="h-7 rounded-md text-xs"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function ReportItem({
  report,
  enabled,
  onSelect,
  selected,
}: {
  report: ReportDef
  enabled: boolean
  onSelect: (id: string) => void
  selected: boolean
}) {
  return (
    <button
      disabled={!enabled}
      onClick={() => enabled && onSelect(report.id)}
      className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
        selected
          ? "bg-primary/10 text-primary"
          : enabled
          ? "text-foreground hover:bg-muted"
          : "cursor-not-allowed text-muted-foreground/40"
      }`}
    >
      {report.label}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SmartStoragePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [showDateRange, setShowDateRange] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>({
    preset: "this_year",
    ...getPresetRange("this_year"),
  })

  // Report availability state — driven by document_fields presence
  const [reportAvailability, setReportAvailability] = useState<Record<string, boolean>>({})

  // ── Session ─────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setSessionLoaded(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  // ── Processing indicator ─────────────────────────────────────────────────
  const checkProcessingState = useCallback(async () => {
    if (!session?.user?.id) return

    const { data: userFiles } = await supabase
      .from("files")
      .select("id")
      .eq("user_id", session.user.id)

    if (!userFiles || userFiles.length === 0) {
      setIsProcessing(false)
      return
    }

    const fileIds = userFiles.map((f) => f.id)

    const { data: activeJobs } = await supabase
      .from("processing_jobs")
      .select("status")
      .in("file_id", fileIds)
      .in("status", ["uploaded", "processing"])

    setIsProcessing((activeJobs?.length ?? 0) > 0)
  }, [session])

  useEffect(() => {
    checkProcessingState()
  }, [checkProcessingState])

  // ── Report availability — check document_fields for required data ─────────
  const checkReportAvailability = useCallback(async () => {
    if (!session?.user?.id) return

    const { data: userFiles } = await supabase
      .from("files")
      .select("id")
      .eq("user_id", session.user.id)

    const availability: Record<string, boolean> = {}

    if (!userFiles || userFiles.length === 0) {
      REPORTS.forEach((r) => { availability[r.id] = false })
      setReportAvailability(availability)
      return
    }

    const fileIds = userFiles.map((f) => f.id)

    const { data: fields } = await supabase
      .from("document_fields")
      .select("file_id, total_amount, gross_income, net_income, document_date, vendor_name, employer_name")
      .in("file_id", fileIds)

    const hasAnyFile = fileIds.length > 0

    const docsWithDateAndAmount = (fields ?? []).filter(
      (f) => f.document_date && f.total_amount != null
    )
    const docsWithIncome = (fields ?? []).filter(
      (f) => f.gross_income != null || f.net_income != null
    )
    const docsWithExpenseOrIncome = (fields ?? []).filter(
      (f) => f.total_amount != null || f.gross_income != null
    )
    const docsWithContracts = (fields ?? []).filter(
      (f) => f.vendor_name || f.employer_name
    )

    for (const report of REPORTS) {
      switch (report.requires) {
        case "any_file":
          availability[report.id] = hasAnyFile
          break
        case "date_and_amount_2":
          availability[report.id] = docsWithDateAndAmount.length >= 2
          break
        case "income_amount":
          availability[report.id] = docsWithIncome.length >= 1
          break
        case "expense_or_income":
          availability[report.id] = docsWithExpenseOrIncome.length >= 1
          break
        case "contract_fields":
          availability[report.id] = docsWithContracts.length >= 1
          break
      }
    }

    setReportAvailability(availability)
  }, [session])

  useEffect(() => {
    checkReportAvailability()
  }, [checkReportAvailability])

  // ── Upload handler ────────────────────────────────────────────────────────
  const handleUpload = async (files: FileList | File[]) => {
    if (!session?.user?.id) return

    for (const file of Array.from(files)) {
      try {
        const ext = file.name.split(".").pop()
        const uniqueName = `${crypto.randomUUID()}.${ext}`
        const storagePath = `${session.user.id}/${uniqueName}`

        const { error: storageError } = await supabase.storage
          .from("documents")
          .upload(storagePath, file)
        if (storageError) throw storageError

        const { data: fileRecord, error: fileError } = await supabase
          .from("files")
          .insert({
            user_id: session.user.id,
            filename: file.name,
            storage_path: storagePath,
            file_type: file.type,
            file_size: file.size,
            document_type: "unknown",
            upload_status: "uploaded",
          })
          .select()
          .single()
        if (fileError) throw fileError

        const { error: jobError } = await supabase
          .from("processing_jobs")
          .insert({ file_id: fileRecord.id, status: "uploaded" })
        if (jobError) throw jobError

        await checkProcessingState()
        await checkReportAvailability()

      } catch (err) {
        console.error("Upload failed for", file.name, err)
      }
    }
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) await handleUpload(e.dataTransfer.files)
  }

  // ── Auth guard ────────────────────────────────────────────────────────────
  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex flex-1">
        <div className="flex flex-1">

          {/* LEFT PANE — Folder Navigation (15%) */}
          <aside className="flex w-[15%] min-w-[180px] flex-col border-r border-border bg-card">
            <div className="flex-[0.6] overflow-y-auto border-b border-border p-3">
              <div className="mb-2 flex justify-end">
                <ProcessingIndicator active={isProcessing} />
              </div>
              <div className="space-y-0.5">
                {userFolders.map((folder) => (
                  <FolderTreeItem
                    key={folder.name}
                    folder={folder}
                    selectedFolder={selectedFolder}
                    onSelect={setSelectedFolder}
                  />
                ))}
              </div>
            </div>
            <div className="flex-[0.4] overflow-y-auto p-3">
              <span className="mb-2 block px-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Classification
              </span>
              <div className="space-y-0.5">
                {classificationFolders.map((name) => (
                  <button
                    key={name}
                    onClick={() => setSelectedFolder(name)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${
                      selectedFolder === name ? "bg-muted text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <Folder className="h-4 w-4 shrink-0" />
                    <span className="truncate">{name}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>

          {/* CENTER PANE — Workspace (65%) */}
          <div
            className={`relative flex w-[65%] flex-col bg-background p-6 transition-colors ${
              isDragOver ? "bg-primary/5" : ""
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {workspaceFolders.length > 0 && (
              <div className="mb-8 grid grid-cols-4 gap-4">
                {workspaceFolders.map((folder) => (
                  <button
                    key={folder.name}
                    className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-muted"
                  >
                    <Folder className="h-10 w-10 text-primary/70" />
                    <span className="text-center text-sm text-foreground">{folder.name}</span>
                  </button>
                ))}
              </div>
            )}

            <div className={`flex flex-1 flex-col items-center justify-center ${workspaceFolders.length > 0 ? "opacity-50" : ""}`}>
              <div className="relative mb-6 flex items-end justify-center gap-2">
                <div className="flex h-16 w-14 items-center justify-center rounded-lg bg-muted/50">
                  <FileText className="h-8 w-8 text-muted-foreground/30" />
                </div>
                <div className="flex h-20 w-16 items-center justify-center rounded-lg bg-muted/50">
                  <File className="h-10 w-10 text-muted-foreground/30" />
                </div>
                <div className="flex h-16 w-14 items-center justify-center rounded-lg bg-muted/50">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/30" />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Drag & drop files here</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {["PDF", "JPG", "JPEG", "PNG", "WEBP", "HEIC"].map((ext) => (
                  <span key={ext} className="text-xs text-muted-foreground/60">{ext}</span>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT PANE — Reports (20%) */}
          <aside className="flex w-[20%] min-w-[180px] flex-col border-l border-border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold text-foreground">Reports</h2>

            {/* Date range toggle */}
            <button
              onClick={() => setShowDateRange(!showDateRange)}
              className="mb-3 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {dateRange.preset === "custom"
                  ? `${dateRange.from} – ${dateRange.to}`
                  : { "30d": "Last 30 days", "90d": "Last 90 days", "this_year": "This year", "prev_year": "Prev year" }[dateRange.preset]
                }
              </span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDateRange ? "rotate-180" : ""}`} />
            </button>

            {showDateRange && (
              <div className="mb-3 rounded-lg border border-border bg-muted/30 p-3">
                <DateRangeSelector dateRange={dateRange} onChange={setDateRange} />
              </div>
            )}

            <Button
              className="mb-4 w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!selectedReport}
            >
              Generate Report
            </Button>

            {/* Flat report list */}
            <div className="flex-1 space-y-0.5 overflow-y-auto">
              {REPORTS.map((report) => (
                <ReportItem
                  key={report.id}
                  report={report}
                  enabled={reportAvailability[report.id] ?? false}
                  selected={selectedReport === report.id}
                  onSelect={setSelectedReport}
                />
              ))}
            </div>
          </aside>

        </div>
      </main>

      <Footer />
    </div>
  )
}