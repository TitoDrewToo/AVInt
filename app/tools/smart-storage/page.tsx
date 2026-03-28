"use client"

import { useState, useEffect, useCallback, useRef } from "react"
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
  Plus,
  Pencil,
  Check,
  X,
  Upload,
  ArrowLeft,
} from "lucide-react"

// ── Document type normalization ───────────────────────────────────────────────

const SUPPORTED_DOCUMENT_TYPES = [
  "receipt", "invoice", "payslip", "income_statement", "bank_statement",
  "transaction_record", "contract", "agreement", "tax_document", "general_document",
] as const

type DocumentType = typeof SUPPORTED_DOCUMENT_TYPES[number]

const DOCUMENT_TYPE_ALIASES: Record<string, DocumentType> = {
  "expense receipt": "receipt", "expense": "receipt", "bill": "receipt",
  "salary slip": "payslip", "pay slip": "payslip", "paycheck": "payslip",
  "employment agreement": "contract", "service agreement": "contract", "nda": "contract",
  "bank record": "bank_statement", "account statement": "bank_statement",
  "income record": "income_statement", "earnings statement": "income_statement",
  "tax form": "tax_document", "tax return": "tax_document",
  "transaction": "transaction_record",
}

const CONFIDENCE_THRESHOLD = 0.7

function normalizeDocumentType(raw: string, confidence: number): DocumentType {
  if (confidence < CONFIDENCE_THRESHOLD) return "general_document"
  const lower = raw.toLowerCase().trim()
  if (SUPPORTED_DOCUMENT_TYPES.includes(lower as DocumentType)) return lower as DocumentType
  if (DOCUMENT_TYPE_ALIASES[lower]) return DOCUMENT_TYPE_ALIASES[lower]
  for (const [alias, type] of Object.entries(DOCUMENT_TYPE_ALIASES)) {
    if (lower.includes(alias) || alias.includes(lower)) return type
  }
  return "general_document"
}

// ── Classification folder mapping ─────────────────────────────────────────────

const CLASSIFICATION_FOLDER_MAP: Record<string, string[]> = {
  Receipts:     ["receipt"],
  Invoices:     ["invoice"],
  Income:       ["payslip", "income_statement"],
  Tax:          ["tax_document"],
  Contracts:    ["contract", "agreement"],
  Transactions: ["bank_statement", "transaction_record"],
  Other:        ["general_document"],
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
    case "30d":  { const f = new Date(now); f.setDate(f.getDate() - 30);  return { from: fmt(f), to: today } }
    case "90d":  { const f = new Date(now); f.setDate(f.getDate() - 90);  return { from: fmt(f), to: today } }
    case "this_year":  return { from: `${now.getFullYear()}-01-01`, to: today }
    case "prev_year":  return { from: `${now.getFullYear() - 1}-01-01`, to: `${now.getFullYear() - 1}-12-31` }
    default: return { from: "", to: today }
  }
}

const PRESET_LABELS: Record<string, string> = {
  "30d": "Last 30 days", "90d": "Last 90 days",
  "this_year": "This year", "prev_year": "Prev year",
}

// ── Reports ───────────────────────────────────────────────────────────────────

interface ReportDef {
  id: string
  label: string
  requires: "any_file" | "date_and_amount_2" | "income_amount" | "expense_or_income" | "contract_fields"
  coreEnabled: boolean
}

const REPORTS: ReportDef[] = [
  { id: "expense_summary",     label: "Expense Summary",          requires: "date_and_amount_2",  coreEnabled: true  },
  { id: "income_summary",      label: "Income Summary",           requires: "income_amount",       coreEnabled: true  },
  { id: "tax_bundle",          label: "Tax Bundle Summary",       requires: "expense_or_income",   coreEnabled: true  },
  { id: "profit_loss",         label: "Profit & Loss Summary",    requires: "expense_or_income",   coreEnabled: false },
  { id: "transaction_summary", label: "Transaction Summary",      requires: "date_and_amount_2",   coreEnabled: false },
  { id: "contract_summary",    label: "Contract Summary",         requires: "contract_fields",     coreEnabled: false },
  { id: "key_terms",           label: "Key Terms Summary",        requires: "contract_fields",     coreEnabled: false },
  { id: "general_summary",     label: "General Document Summary", requires: "any_file",            coreEnabled: false },
  { id: "financial_overview",  label: "Financial Overview",       requires: "expense_or_income",   coreEnabled: false },
]

// ── Folder / File types ───────────────────────────────────────────────────────

interface VirtualFolder {
  id: string
  name: string
  parentId: string | null
  isRenaming?: boolean
}

interface UploadedFile {
  id: string
  filename: string
  file_type: string
  file_size: number
  document_type: string
  created_at: string
  storage_path: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
  if (fileType === "application/pdf") return <FileText className="h-4 w-4 shrink-0 text-primary/60" />
  return <File className="h-4 w-4 shrink-0 text-muted-foreground" />
}

// ── Left pane folder tree item ────────────────────────────────────────────────

function LeftFolderItem({
  name,
  isOpen,
  isSelected,
  onSelect,
  onToggle,
  children,
  level = 0,
}: {
  name: string
  isOpen?: boolean
  isSelected: boolean
  onSelect: () => void
  onToggle?: () => void
  children?: React.ReactNode
  level?: number
}) {
  return (
    <div>
      <button
        onClick={() => { onSelect(); onToggle?.() }}
        className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${
          isSelected ? "bg-muted text-foreground" : "text-muted-foreground"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        {children ? (
          isOpen
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        ) : <span className="w-3.5" />}
        {isOpen
          ? <FolderOpen className="h-4 w-4 shrink-0 text-primary/70" />
          : <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <span className="truncate">{name}</span>
      </button>
      {isOpen && children && <div>{children}</div>}
    </div>
  )
}

// ── Date range selector ───────────────────────────────────────────────────────

function DateRangeSelector({ dateRange, onChange }: { dateRange: DateRange; onChange: (r: DateRange) => void }) {
  const presets: { label: string; value: DateRangePreset }[] = [
    { label: "Last 30d", value: "30d" },
    { label: "Last 90d", value: "90d" },
    { label: "This year", value: "this_year" },
    { label: "Prev year", value: "prev_year" },
    { label: "Custom", value: "custom" },
  ]
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {presets.map((p) => (
          <button
            key={p.value}
            onClick={() => { const r = getPresetRange(p.value); onChange({ preset: p.value, ...r }) }}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
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
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-6 text-xs text-muted-foreground">From</span>
            <Input type="date" value={dateRange.from} onChange={(e) => onChange({ ...dateRange, from: e.target.value })} className="h-7 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-6 text-xs text-muted-foreground">To</span>
            <Input type="date" value={dateRange.to} onChange={(e) => onChange({ ...dateRange, to: e.target.value })} className="h-7 text-xs" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SmartStoragePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // Folder/navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string>("root")
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([{ id: "root", name: "Documents" }])
  const [selectedLeftFolder, setSelectedLeftFolder] = useState<string>("Documents")
  const [docsOpen, setDocsOpen] = useState(true)

  // Virtual folders (local state — DB-backed folders coming later)
  const [folders, setFolders] = useState<VirtualFolder[]>([
    { id: "root", name: "Documents", parentId: null },
  ])
  const [newFolderName, setNewFolderName] = useState("")
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  // Files state
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [detectedTypes, setDetectedTypes] = useState<string[]>([])

  // Upload
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Reports
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [showDateRange, setShowDateRange] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>({ preset: "this_year", ...getPresetRange("this_year") })
  const [reportAvailability, setReportAvailability] = useState<Record<string, boolean>>({})

  // ── Session ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionLoaded(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setSessionLoaded(true) })
    return () => subscription.unsubscribe()
  }, [])

  // ── Processing indicator ───────────────────────────────────────────────────
  const checkProcessingState = useCallback(async () => {
    if (!session?.user?.id) return
    const { data: userFiles } = await supabase.from("files").select("id").eq("user_id", session.user.id)
    if (!userFiles?.length) { setIsProcessing(false); return }
    const { data: activeJobs } = await supabase
      .from("processing_jobs").select("status")
      .in("file_id", userFiles.map((f) => f.id))
      .in("status", ["uploaded", "processing"])
    setIsProcessing((activeJobs?.length ?? 0) > 0)
  }, [session])

  // ── Load files ─────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from("files")
      .select("id, filename, file_type, file_size, document_type, created_at, storage_path")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
    if (data) {
      setFiles(data)
      const types = [...new Set(data.map((f) => f.document_type).filter((t) => t !== "unknown"))]
      setDetectedTypes(types)
    }
  }, [session])

  // ── Report availability ────────────────────────────────────────────────────
  const checkReportAvailability = useCallback(async () => {
    if (!session?.user?.id) return
    const { data: userFiles } = await supabase.from("files").select("id").eq("user_id", session.user.id)
    const availability: Record<string, boolean> = {}
    if (!userFiles?.length) { REPORTS.forEach((r) => { availability[r.id] = false }); setReportAvailability(availability); return }
    const fileIds = userFiles.map((f) => f.id)
    const { data: fields } = await supabase
      .from("document_fields")
      .select("file_id, total_amount, gross_income, net_income, document_date, vendor_name, employer_name")
      .in("file_id", fileIds)
    const f = fields ?? []
    for (const report of REPORTS) {
      if (!report.coreEnabled) { availability[report.id] = false; continue }
      switch (report.requires) {
        case "any_file":           availability[report.id] = fileIds.length > 0; break
        case "date_and_amount_2":  availability[report.id] = f.filter((x) => x.document_date && x.total_amount != null).length >= 2; break
        case "income_amount":      availability[report.id] = f.filter((x) => x.gross_income != null || x.net_income != null).length >= 1; break
        case "expense_or_income":  availability[report.id] = f.filter((x) => x.total_amount != null || x.gross_income != null).length >= 1; break
        case "contract_fields":    availability[report.id] = f.filter((x) => x.vendor_name || x.employer_name).length >= 1; break
      }
    }
    setReportAvailability(availability)
  }, [session])

  useEffect(() => {
    checkProcessingState()
    loadFiles()
    checkReportAvailability()
  }, [checkProcessingState, loadFiles, checkReportAvailability])

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async (uploadFiles: FileList | File[]) => {
    if (!session?.user?.id) return
    for (const file of Array.from(uploadFiles)) {
      try {
        const ext = file.name.split(".").pop()
        const uniqueName = `${crypto.randomUUID()}.${ext}`
        const storagePath = `${session.user.id}/${uniqueName}`
        const { error: storageError } = await supabase.storage.from("documents").upload(storagePath, file)
        if (storageError) throw storageError
        const { data: fileRecord, error: fileError } = await supabase
          .from("files")
          .insert({ user_id: session.user.id, filename: file.name, storage_path: storagePath, file_type: file.type, file_size: file.size, document_type: "unknown", upload_status: "uploaded" })
          .select().single()
        if (fileError) throw fileError
        const { error: jobError } = await supabase.from("processing_jobs").insert({ file_id: fileRecord.id, status: "uploaded" })
        if (jobError) throw jobError
      } catch (err) {
        console.error("Upload failed for", file.name, err)
      }
    }
    await checkProcessingState()
    await loadFiles()
    await checkReportAvailability()
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) await handleUpload(e.dataTransfer.files)
  }

  // ── Folder management ──────────────────────────────────────────────────────
  const createFolder = () => {
    if (!newFolderName.trim()) return
    const newFolder: VirtualFolder = { id: crypto.randomUUID(), name: newFolderName.trim(), parentId: currentFolderId }
    setFolders((prev) => [...prev, newFolder])
    setNewFolderName("")
    setIsCreatingFolder(false)
  }

  const startRename = (folder: VirtualFolder) => { setRenamingId(folder.id); setRenameValue(folder.name) }
  const confirmRename = () => {
    if (!renameValue.trim()) return
    setFolders((prev) => prev.map((f) => f.id === renamingId ? { ...f, name: renameValue.trim() } : f))
    setRenamingId(null)
  }

  const openFolder = (folder: VirtualFolder) => {
    setCurrentFolderId(folder.id)
    setBreadcrumb((prev) => {
      const existing = prev.findIndex((b) => b.id === folder.id)
      if (existing !== -1) return prev.slice(0, existing + 1)
      return [...prev, { id: folder.id, name: folder.name }]
    })
  }

  const navigateBreadcrumb = (id: string, name: string, index: number) => {
    setCurrentFolderId(id)
    setBreadcrumb((prev) => prev.slice(0, index + 1))
  }

  // ── Dynamic classification folders ────────────────────────────────────────
  const visibleClassificationFolders = Object.entries(CLASSIFICATION_FOLDER_MAP)
    .filter(([, types]) => types.some((t) => detectedTypes.includes(t)))
    .map(([name]) => name)

  const currentSubfolders = folders.filter((f) => f.parentId === currentFolderId)

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT PANE ─────────────────────────────────────────────────────── */}
          <aside className="flex w-[15%] min-w-[180px] flex-col border-r border-border bg-card overflow-hidden">
            <div className="flex-1 overflow-y-auto p-2">

              {/* Processing indicator */}
              <div className="mb-2 flex justify-end px-2">
                <ProcessingIndicator active={isProcessing} />
              </div>

              {/* Documents tree */}
              <LeftFolderItem
                name="Documents"
                isOpen={docsOpen}
                isSelected={selectedLeftFolder === "Documents"}
                onSelect={() => { setSelectedLeftFolder("Documents"); setCurrentFolderId("root"); setBreadcrumb([{ id: "root", name: "Documents" }]) }}
                onToggle={() => setDocsOpen(!docsOpen)}
                level={0}
              >
                <LeftFolderItem
                  name="Unclassified"
                  isSelected={selectedLeftFolder === "Unclassified"}
                  onSelect={() => setSelectedLeftFolder("Unclassified")}
                  level={1}
                />
                {visibleClassificationFolders.map((name) => (
                  <LeftFolderItem
                    key={name}
                    name={name}
                    isSelected={selectedLeftFolder === name}
                    onSelect={() => setSelectedLeftFolder(name)}
                    level={1}
                  />
                ))}
              </LeftFolderItem>
            </div>
          </aside>

          {/* CENTER PANE ────────────────────────────────────────────────────── */}
          <div
            className={`relative flex w-[65%] flex-col overflow-hidden bg-background transition-colors ${isDragOver ? "bg-primary/5" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Toolbar */}
            <div className="flex h-10 items-center gap-2 border-b border-border bg-card/50 px-4">
              {/* Breadcrumb */}
              <div className="flex flex-1 items-center gap-1 text-sm">
                {breadcrumb.map((crumb, index) => (
                  <span key={crumb.id} className="flex items-center gap-1">
                    {index > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                    <button
                      onClick={() => navigateBreadcrumb(crumb.id, crumb.name, index)}
                      className={`rounded px-1 py-0.5 transition-colors hover:bg-muted ${
                        index === breadcrumb.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {crumb.name}
                    </button>
                  </span>
                ))}
              </div>

              {/* Toolbar actions */}
              <div className="flex items-center gap-1">
                {breadcrumb.length > 1 && (
                  <button
                    onClick={() => { const prev = breadcrumb[breadcrumb.length - 2]; navigateBreadcrumb(prev.id, prev.name, breadcrumb.length - 2) }}
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => setIsCreatingFolder(true)}
                  className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New folder
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload
                </button>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && handleUpload(e.target.files)} />
              </div>
            </div>

            {/* File/folder list */}
            <div className="flex-1 overflow-y-auto p-4">

              {/* New folder input */}
              {isCreatingFolder && (
                <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <Folder className="h-4 w-4 shrink-0 text-primary/70" />
                  <Input
                    autoFocus
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setIsCreatingFolder(false) }}
                    placeholder="Folder name"
                    className="h-6 flex-1 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
                  />
                  <button onClick={createFolder} className="text-primary hover:text-primary/80"><Check className="h-4 w-4" /></button>
                  <button onClick={() => setIsCreatingFolder(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
              )}

              {/* Column headers */}
              {(currentSubfolders.length > 0 || files.length > 0) && (
                <div className="mb-1 grid grid-cols-[1fr_120px_100px_80px] gap-2 px-3 py-1 text-xs text-muted-foreground">
                  <span>Name</span>
                  <span>Type</span>
                  <span>Modified</span>
                  <span className="text-right">Size</span>
                </div>
              )}

              {/* Subfolders */}
              {currentSubfolders.map((folder) => (
                <div
                  key={folder.id}
                  onDoubleClick={() => openFolder(folder)}
                  className="group grid cursor-pointer grid-cols-[1fr_120px_100px_80px] items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
                >
                  {renamingId === folder.id ? (
                    <div className="col-span-4 flex items-center gap-2">
                      <Folder className="h-4 w-4 shrink-0 text-primary/70" />
                      <Input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenamingId(null) }}
                        className="h-6 flex-1 border-0 p-0 text-sm shadow-none focus-visible:ring-0"
                      />
                      <button onClick={confirmRename} className="text-primary"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setRenamingId(null)} className="text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Folder className="h-4 w-4 shrink-0 text-primary/70" />
                        <span className="truncate font-medium text-foreground">{folder.name}</span>
                      </div>
                      <span className="text-muted-foreground">Folder</span>
                      <span className="text-muted-foreground">—</span>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); startRename(folder) }}
                          className="opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}

              {/* Files */}
              {files.map((file) => (
                <div
                  key={file.id}
                  className="grid grid-cols-[1fr_120px_100px_80px] items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted"
                >
                  <div className="flex items-center gap-2">
                    {fileIcon(file.file_type)}
                    <span className="truncate text-foreground">{file.filename}</span>
                  </div>
                  <span className="truncate text-muted-foreground capitalize">
                    {file.document_type === "unknown" ? "Processing…" : file.document_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-muted-foreground">
                    {new Date(file.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                  </span>
                  <span className="text-right text-muted-foreground">{formatBytes(file.file_size)}</span>
                </div>
              ))}

              {/* Empty state */}
              {currentSubfolders.length === 0 && files.length === 0 && !isCreatingFolder && (
                <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3">
                  <div className="flex items-end justify-center gap-2 opacity-20">
                    <div className="flex h-16 w-14 items-center justify-center rounded-lg bg-muted">
                      <FileText className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="flex h-20 w-16 items-center justify-center rounded-lg bg-muted">
                      <File className="h-10 w-10 text-muted-foreground" />
                    </div>
                    <div className="flex h-16 w-14 items-center justify-center rounded-lg bg-muted">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Drop files here or click Upload</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {["PDF", "JPG", "JPEG", "PNG", "WEBP", "HEIC"].map((ext) => (
                      <span key={ext} className="text-xs text-muted-foreground/50">{ext}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANE ─────────────────────────────────────────────────────── */}
          <aside className="flex w-[20%] min-w-[180px] flex-col border-l border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Reports</h2>
            </div>

            <div className="flex flex-col gap-3 p-3">
              {/* Date range toggle */}
              <button
                onClick={() => setShowDateRange(!showDateRange)}
                className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {dateRange.preset === "custom" ? `${dateRange.from} – ${dateRange.to}` : PRESET_LABELS[dateRange.preset]}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDateRange ? "rotate-180" : ""}`} />
              </button>

              {showDateRange && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <DateRangeSelector dateRange={dateRange} onChange={setDateRange} />
                </div>
              )}

              <Button
                className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={!selectedReport || !reportAvailability[selectedReport]}
                size="sm"
              >
                Generate Report
              </Button>
            </div>

            {/* Flat report list */}
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              <div className="space-y-0.5">
                {REPORTS.map((report) => {
                  const enabled = report.coreEnabled && (reportAvailability[report.id] ?? false)
                  const isSelected = selectedReport === report.id
                  return (
                    <button
                      key={report.id}
                      disabled={!enabled}
                      onClick={() => enabled && setSelectedReport(report.id)}
                      className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                        isSelected
                          ? "bg-primary/10 text-primary"
                          : enabled
                          ? "text-foreground hover:bg-muted"
                          : "cursor-not-allowed text-muted-foreground/35"
                      }`}
                    >
                      {report.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </aside>

        </div>
      </main>

      <Footer />
    </div>
  )
}