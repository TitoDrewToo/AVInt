"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Navbar } from "@/components/navbar"
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
  FolderOutput,
  Download,
  PenLine,
  Tag,
  Menu,
  BarChart2,
} from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"
import { ManualEntryModal, ReclassifyModal } from "@/components/ui/document-modals"
import { useRouter } from "next/navigation"

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
  { id: "profit_loss",         label: "Profit & Loss Summary",    requires: "expense_or_income",   coreEnabled: true  },
  { id: "contract_summary",    label: "Contract Summary",         requires: "contract_fields",     coreEnabled: true  },
  { id: "key_terms",           label: "Key Terms Summary",        requires: "contract_fields",     coreEnabled: true  },
  { id: "business_expense",    label: "Business Expense Summary", requires: "expense_or_income",   coreEnabled: true  },
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
  folder_id: string | null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(fileType: string) {
  if (fileType === "manual") return <PenLine className="h-4 w-4 shrink-0 text-primary/70" />
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
  onRename,
  onDelete,
}: {
  name: string
  isOpen?: boolean
  isSelected: boolean
  onSelect: () => void
  onToggle?: () => void
  children?: React.ReactNode
  level?: number
  onRename?: () => void
  onDelete?: () => void
}) {
  return (
    <div>
      <div
        className={`group flex w-full items-center rounded text-sm transition-colors hover:bg-muted ${
          isSelected ? "bg-muted text-foreground" : "text-muted-foreground"
        }`}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        <button
          onClick={() => { onSelect(); onToggle?.() }}
          className="flex flex-1 min-w-0 items-center gap-1.5 py-1 text-left"
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
        {(onRename || onDelete) && (
          <div className="flex items-center gap-0.5 pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {onRename && (
              <button
                onClick={(e) => { e.stopPropagation(); onRename() }}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-muted-foreground/20"
                title="Rename"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete() }}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-destructive/20 hover:text-destructive"
                title="Delete"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
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
  // Classification view — null = normal folder view, string = active classification name
  const [classificationView, setClassificationView] = useState<string | null>(null)
  const [classificationSort, setClassificationSort] = useState<"date-desc" | "date-asc" | "name">("date-desc")

  // Virtual folders (local state — DB-backed folders coming later)
  const [folders, setFolders] = useState<VirtualFolder[]>([

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
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid")
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; fileId: string; filename: string } | null>(null)
  const [manualEntryOpen, setManualEntryOpen] = useState(false)
  const [reclassifyTarget, setReclassifyTarget] = useState<{ fileId: string; filename: string } | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [mobileReportsOpen, setMobileReportsOpen] = useState(false)
  const isMobile = useIsMobile()
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null)
  const [renameFileValue, setRenameFileValue] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Canvas drag state
  const CELL_W = 90
  const CELL_H = 104
  const GRID_PAD = 8
  const canvasRef = useRef<HTMLDivElement>(null)
  const [itemPositions, setItemPositions] = useState<Record<string, { col: number; row: number }>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragGhostPos, setDragGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [hoveredLeftFolderId, setHoveredLeftFolderId] = useState<string | null>(null)
  const leftFolderRefs = useRef<Map<string, HTMLElement>>(new Map())

  // Reports
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [showDateRange, setShowDateRange] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>({ preset: "this_year", ...getPresetRange("this_year") })
  const [reportAvailability, setReportAvailability] = useState<Record<string, boolean>>({})
  const router = useRouter()

  const REPORT_ROUTES: Record<string, string> = {
    expense_summary:   "/tools/smart-storage/reports/expense-summary",
    income_summary:    "/tools/smart-storage/reports/income-summary",
    tax_bundle:        "/tools/smart-storage/reports/tax-bundle",
    profit_loss:       "/tools/smart-storage/reports/profit-loss",
    contract_summary:  "/tools/smart-storage/reports/contract-summary",
    key_terms:         "/tools/smart-storage/reports/key-terms",
    business_expense:  "/tools/smart-storage/reports/business-expense",
  }

  // ── Session ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionLoaded(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setSessionLoaded(true) })
    return () => subscription.unsubscribe()
  }, [])

  // ── Processing indicator + polling ────────────────────────────────────────
  const checkProcessingState = useCallback(async () => {
    if (!session?.user?.id) return
    const { data: userFiles } = await supabase.from("files").select("id").eq("user_id", session.user.id)
    if (!userFiles?.length) { setIsProcessing(false); return false }
    const { data: activeJobs } = await supabase
      .from("processing_jobs").select("status")
      .in("file_id", userFiles.map((f) => f.id))
      .in("status", ["uploaded", "processing"])
    const stillActive = (activeJobs?.length ?? 0) > 0
    setIsProcessing(stillActive)
    return stillActive
  }, [session])

  // ── Load files ─────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from("files")
      .select("id, filename, file_type, file_size, document_type, created_at, storage_path, folder_id")
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
      .select("file_id, total_amount, gross_income, net_income, document_date, vendor_name, employer_name, counterparty_name")
      .in("file_id", fileIds)
    const f = fields ?? []
    for (const report of REPORTS) {
      if (!report.coreEnabled) { availability[report.id] = false; continue }
      switch (report.requires) {
        case "any_file":           availability[report.id] = fileIds.length > 0; break
        case "date_and_amount_2":  availability[report.id] = f.filter((x) => x.document_date && x.total_amount != null).length >= 2; break
        case "income_amount":      availability[report.id] = f.filter((x) => x.gross_income != null || x.net_income != null).length >= 1; break
        case "expense_or_income":  availability[report.id] = f.filter((x) => x.total_amount != null || x.gross_income != null).length >= 1; break
        case "contract_fields":    availability[report.id] = f.filter((x) => x.vendor_name || x.employer_name || x.counterparty_name).length >= 1; break
      }
    }
    setReportAvailability(availability)
  }, [session])

  // Poll every 3s while processing — stops when jobs complete, then refreshes files
  useEffect(() => {
    if (!isProcessing) return
    const interval = setInterval(async () => {
      const stillActive = await checkProcessingState()
      if (!stillActive) {
        clearInterval(interval)
        await loadFiles()
        await checkReportAvailability()
      }
    }, 3000)
    return () => clearInterval(interval)
  }, [isProcessing, checkProcessingState, loadFiles, checkReportAvailability])

  const loadFolders = useCallback(async () => {
    if (!session?.user?.id) return
    const { data } = await supabase
      .from("folders")
      .select("id, name, parent_id, user_id")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: true })
    if (data) {
      setFolders(
        data.map((f) => ({
          id: f.id,
          name: f.name,
          parentId: f.parent_id,
        }))
      )
    }
  }, [session])

  useEffect(() => {
    checkProcessingState()
    loadFiles()
    checkReportAvailability()
    loadFolders()
  }, [checkProcessingState, loadFiles, checkReportAvailability, loadFolders])

  // ── Auto-assign canvas positions ───────────────────────────────────────────
  useEffect(() => {
    const subfolderIds = folders
      .filter(f => currentFolderId === "root" ? f.parentId === null : f.parentId === currentFolderId)
      .map(f => f.id)
    const visibleFileIds = files
      .filter(f => (f.folder_id ?? null) === (currentFolderId === "root" ? null : currentFolderId))
      .map(f => f.id)
    const allIds = [...subfolderIds, ...visibleFileIds]
    setItemPositions(prev => {
      const next: Record<string, { col: number; row: number }> = {}
      const occupied = new Set<string>()
      for (const id of allIds) {
        if (prev[id]) { next[id] = prev[id]; occupied.add(`${prev[id].col},${prev[id].row}`) }
      }
      for (const id of allIds) {
        if (next[id]) continue
        let col = 0, row = 0
        while (occupied.has(`${col},${row}`)) { col++; if (col >= 8) { col = 0; row++ } }
        next[id] = { col, row }
        occupied.add(`${col},${row}`)
      }
      return next
    })
  }, [folders, files, currentFolderId])

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
        const { data: jobRecord, error: jobError } = await supabase
          .from("processing_jobs")
          .insert({ file_id: fileRecord.id, status: "uploaded" })
          .select()
          .single()
        if (jobError) throw jobError

        // Trigger Gemini extraction pipeline
        // Trigger Gemini extraction pipeline — fire and forget
        const _fileId = fileRecord.id
        const _jobId = jobRecord.id
        setTimeout(() => {
          fetch("https://njbxbltgtxvhmcctdluz.supabase.co/functions/v1/process-document", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ file_id: _fileId, job_id: _jobId }),
          }).catch((err) => console.error("process-document fetch error:", err))
        }, 0)
      } catch (err: any) {
        console.error("Upload failed for", file.name, JSON.stringify(err), err?.message, err?.error, err?.statusCode)
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

  // ── File selection ────────────────────────────────────────────────────────
  const handleFileClick = (fileId: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      setSelectedFiles(prev => {
        const next = new Set(prev)
        next.has(fileId) ? next.delete(fileId) : next.add(fileId)
        return next
      })
    } else {
      setSelectedFiles(new Set([fileId]))
    }
    setContextMenu(null)
  }

  const handleFileRightClick = (e: React.MouseEvent, fileId: string, filename: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, fileId, filename })
    setSelectedFiles(new Set([fileId]))
  }

  const handleDownloadFile = async (fileId: string) => {
    const file = files.find(f => f.id === fileId)
    if (!file) return
    const { data } = await supabase.storage.from("documents").createSignedUrl(file.storage_path, 60)
    if (!data?.signedUrl) return
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  const handleDeleteFile = async (fileId: string) => {
    const file = files.find(f => f.id === fileId)
    if (!file) return
    await supabase.storage.from("documents").remove([file.storage_path])
    await supabase.from("files").delete().eq("id", fileId)
    setFiles(prev => prev.filter(f => f.id !== fileId))
    setSelectedFiles(new Set())
    setContextMenu(null)
  }

  const handleRenameFile = async (fileId: string, newName: string) => {
    if (!newName.trim()) return
    await supabase.from("files").update({ filename: newName.trim() }).eq("id", fileId)
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, filename: newName.trim() } : f))
    setRenamingFileId(null)
    setContextMenu(null)
  }

  // ── Canvas helpers ─────────────────────────────────────────────────────────
  const findFreeSlot = (targetCol: number, targetRow: number, occupied: Set<string>) => {
    if (!occupied.has(`${targetCol},${targetRow}`)) return { col: targetCol, row: targetRow }
    for (let dist = 1; dist < 30; dist++) {
      for (let dc = -dist; dc <= dist; dc++) {
        for (let dr = -dist; dr <= dist; dr++) {
          if (Math.abs(dc) + Math.abs(dr) === dist) {
            const c = Math.max(0, targetCol + dc)
            const r = Math.max(0, targetRow + dr)
            if (!occupied.has(`${c},${r}`)) return { col: c, row: r }
          }
        }
      }
    }
    return { col: targetCol, row: targetRow }
  }

  const moveFileToFolder = async (fileId: string, targetFolderId: string | null) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, folder_id: targetFolderId } : f))
    setItemPositions(prev => { const next = { ...prev }; delete next[fileId]; return next })
    await supabase.from("files").update({ folder_id: targetFolderId }).eq("id", fileId)
  }

  const handleCanvasPointerDown = (e: React.PointerEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDraggingId(id)
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setDragGhostPos(null)
  }

  const handleCanvasPointerMove = (e: React.PointerEvent, id: string) => {
    if (draggingId !== id || !canvasRef.current) return
    const cr = canvasRef.current.getBoundingClientRect()
    setDragGhostPos({ x: e.clientX - cr.left - dragOffset.x, y: e.clientY - cr.top - dragOffset.y })
    // Check left pane folder hover (only for files)
    if (files.some(f => f.id === id)) {
      let found: string | null = null
      for (const [fid, el] of leftFolderRefs.current.entries()) {
        const r = el.getBoundingClientRect()
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          found = fid; break
        }
      }
      setHoveredLeftFolderId(found)
    }
  }

  const handleCanvasPointerUp = (e: React.PointerEvent, id: string, hoveredCanvasFolderId: string | null) => {
    if (draggingId !== id) { setDraggingId(null); setDragGhostPos(null); setHoveredLeftFolderId(null); return }
    const isFile = files.some(f => f.id === id)
    // Drop onto left pane folder
    if (isFile && hoveredLeftFolderId) {
      moveFileToFolder(id, hoveredLeftFolderId)
      setDraggingId(null); setDragGhostPos(null); setHoveredLeftFolderId(null)
      return
    }
    // Drop onto canvas folder
    if (isFile && hoveredCanvasFolderId) {
      moveFileToFolder(id, hoveredCanvasFolderId)
      setDraggingId(null); setDragGhostPos(null)
      return
    }
    if (!canvasRef.current) { setDraggingId(null); setDragGhostPos(null); return }
    // Snap to grid
    const cr = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - cr.left - dragOffset.x
    const y = e.clientY - cr.top - dragOffset.y
    const targetCol = Math.max(0, Math.round((x - GRID_PAD) / CELL_W))
    const targetRow = Math.max(0, Math.round((y - GRID_PAD) / CELL_H))
    const occupied = new Set(
      Object.entries(itemPositions)
        .filter(([itemId]) => itemId !== id)
        .map(([, p]) => `${p.col},${p.row}`)
    )
    const { col, row } = findFreeSlot(targetCol, targetRow, occupied)
    setItemPositions(prev => ({ ...prev, [id]: { col, row } }))
    setDraggingId(null); setDragGhostPos(null)
  }

  // ── Folder management ──────────────────────────────────────────────────────
  const createFolder = async () => {
    if (!newFolderName.trim() || !session?.user?.id) return
    const { data, error } = await supabase
      .from("folders")
      .insert({
        user_id: session.user.id,
        name: newFolderName.trim(),
        parent_id: currentFolderId === "root" ? null : currentFolderId,
      })
      .select()
      .single()
    if (!error && data) {
      setFolders((prev) => [...prev, { id: data.id, name: data.name, parentId: data.parent_id }])
    }
    setNewFolderName("")
    setIsCreatingFolder(false)
  }

  const startRename = (folder: VirtualFolder) => { setRenamingId(folder.id); setRenameValue(folder.name) }

  const confirmRename = async () => {
    if (!renameValue.trim() || !renamingId) return
    const { error } = await supabase
      .from("folders")
      .update({ name: renameValue.trim() })
      .eq("id", renamingId)
    if (!error) {
      setFolders((prev) => prev.map((f) => f.id === renamingId ? { ...f, name: renameValue.trim() } : f))
    }
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

  const manualEntriesCount = files.filter(f => f.file_type === "manual").length

  // ── Dynamic classification folders ────────────────────────────────────────
  const visibleClassificationFolders = Object.entries(CLASSIFICATION_FOLDER_MAP)
    .filter(([, types]) => types.some((t) => detectedTypes.includes(t)))
    .map(([name]) => name)

  const currentSubfolders = classificationView ? [] : folders.filter((f) =>
    currentFolderId === "root" ? f.parentId === null : f.parentId === currentFolderId
  )

  // Files — classification view shows all matching types across all folders, sorted by date
  const displayedFiles = (() => {
    if (classificationView) {
      const matched = classificationView === "Manual Entries"
        ? files.filter(f => f.file_type === "manual")
        : (() => {
            const types = CLASSIFICATION_FOLDER_MAP[classificationView] ?? []
            return files.filter(f => types.some(t => f.document_type?.includes(t) || t === f.document_type))
          })()
      if (classificationSort === "date-desc") return [...matched].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      if (classificationSort === "date-asc")  return [...matched].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      return [...matched].sort((a, b) => a.filename.localeCompare(b.filename))
    }
    return files.filter(f =>
      (f.folder_id ?? null) === (currentFolderId === "root" ? null : currentFolderId)
    )
  })()

  // Canvas folder being hovered during a file drag (position-based hit test)
  const hoveredFolderId = (() => {
    if (!draggingId || !dragGhostPos || !files.some(f => f.id === draggingId)) return null
    const cx = dragGhostPos.x + (CELL_W - 6) / 2
    const cy = dragGhostPos.y + CELL_H / 2
    for (const folder of currentSubfolders) {
      const pos = itemPositions[folder.id]
      if (!pos) continue
      const fl = GRID_PAD + pos.col * CELL_W, ft = GRID_PAD + pos.row * CELL_H
      if (cx >= fl && cx <= fl + CELL_W - 6 && cy >= ft && cy <= ft + CELL_H) return folder.id
    }
    return null
  })()

  const maxRow = Object.keys(itemPositions).length > 0
    ? Math.max(...Object.values(itemPositions).map(p => p.row))
    : 0

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!sessionLoaded) return null
  if (!session) return <AuthGuardModal isVisible={true} />

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">

          {/* LEFT PANE ─────────────────────────────────────────────────────── */}
          <aside className="hidden md:flex w-[15%] min-w-[180px] flex-col border-r border-border bg-card overflow-hidden">
            {/* Documents section — user folder tree */}
            <div className="flex-[0.6] overflow-y-auto border-b border-border p-2">
              {/* Processing indicator */}
              <div className="mb-2 flex justify-end px-2">
                <ProcessingIndicator active={isProcessing} />
              </div>

              {/* Documents tree — mirrors workspace structure */}
              <LeftFolderItem
                name="Documents"
                isOpen={docsOpen}
                isSelected={selectedLeftFolder === "Documents"}
                onSelect={() => { setSelectedLeftFolder("Documents"); setCurrentFolderId("root"); setBreadcrumb([{ id: "root", name: "Documents" }]); setClassificationView(null) }}
                onToggle={() => setDocsOpen(!docsOpen)}
                level={0}
              >
                <LeftFolderItem
                  name="Unclassified"
                  isSelected={selectedLeftFolder === "Unclassified"}
                  onSelect={() => setSelectedLeftFolder("Unclassified")}
                  level={1}
                />
                {folders.filter((f) => f.parentId === null).map((folder) => (
                  <div
                    key={folder.id}
                    ref={(el) => { if (el) leftFolderRefs.current.set(folder.id, el); else leftFolderRefs.current.delete(folder.id) }}
                    className={`rounded transition-colors ${hoveredLeftFolderId === folder.id ? "ring-2 ring-primary bg-primary/10" : ""}`}
                  >
                    <LeftFolderItem
                      name={folder.name}
                      isSelected={selectedLeftFolder === folder.name}
                      onSelect={() => {
                        setSelectedLeftFolder(folder.name)
                        setClassificationView(null)
                        openFolder(folder)
                      }}
                      level={1}
                      onRename={() => startRename(folder)}
                      onDelete={async () => {
                        await supabase.from("folders").delete().eq("id", folder.id)
                        setFolders(prev => prev.filter(f => f.id !== folder.id))
                        if (currentFolderId === folder.id) {
                          setCurrentFolderId("root")
                          setBreadcrumb([{ id: "root", name: "Documents" }])
                          setSelectedLeftFolder("Documents")
                        }
                      }}
                    />
                  </div>
                ))}
              </LeftFolderItem>
            </div>

            {/* Classification section — system detected, read only */}
            <div className="flex-[0.4] overflow-y-auto p-2">
              <div className="mb-1 px-2">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Classification
                </span>
              </div>
              <div className="space-y-0.5">
                {/* Manual Entries — always shown */}
                <button
                  onClick={() => { setSelectedLeftFolder("Manual Entries"); setClassificationView("Manual Entries") }}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${
                    classificationView === "Manual Entries" ? "bg-muted text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <PenLine className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Manual Entries</span>
                  </div>
                  {manualEntriesCount > 0 && <span className="text-[10px] text-muted-foreground/60 shrink-0">{manualEntriesCount}</span>}
                </button>
                {/* Detected document type folders */}
                {visibleClassificationFolders.map((name) => {
                  const count = (CLASSIFICATION_FOLDER_MAP[name] ?? []).reduce(
                    (n, t) => n + files.filter(f => f.document_type === t).length, 0
                  )
                  return (
                    <button
                      key={name}
                      onClick={() => { setSelectedLeftFolder(name); setClassificationView(name) }}
                      className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${
                        classificationView === name ? "bg-muted text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Folder className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{name}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground/60 shrink-0">{count}</span>
                    </button>
                  )
                })}
                {visibleClassificationFolders.length === 0 && manualEntriesCount === 0 && (
                  <p className="px-2 text-[11px] text-muted-foreground/50">Detected types appear here</p>
                )}
              </div>
            </div>
          </aside>

          {/* CENTER PANE ────────────────────────────────────────────────────── */}
          <div
            className={`relative flex w-full md:w-[65%] flex-col overflow-hidden bg-background transition-colors ${isDragOver ? "bg-primary/5" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => { setContextMenu(null); setSelectedFiles(new Set()) }}
          >
            {/* Toolbar */}
            <div className="flex h-10 items-center gap-2 border-b border-border bg-card/50 px-4">
              {/* Mobile nav trigger */}
              <button
                className="flex md:hidden h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setMobileNavOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </button>

              {/* Breadcrumb / classification header */}
              <div className="flex flex-1 items-center gap-1 text-sm overflow-hidden">
                {classificationView ? (
                  <>
                    <button
                      onClick={() => { setClassificationView(null); setSelectedLeftFolder("Documents") }}
                      className="text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted"
                    >Classification</button>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground px-1">{classificationView}</span>
                    <span className="hidden sm:inline ml-2 text-[10px] text-muted-foreground/60 italic">read-only view · files not moved</span>
                  </>
                ) : (
                  breadcrumb.map((crumb, index) => (
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
                  ))
                )}
              </div>

              {/* Selected file actions */}
              {selectedFiles.size > 0 && (
                <div className="flex items-center gap-1 border-r border-border pr-2 mr-1">
                  <span className="text-xs text-muted-foreground">{selectedFiles.size} selected</span>
                  <button
                    onClick={() => {
                      const fileId = [...selectedFiles][0]
                      const file = files.find(f => f.id === fileId)
                      if (file) { setRenamingFileId(fileId); setRenameFileValue(file.filename) }
                    }}
                    className="flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                    Rename
                  </button>
                  <button
                    onClick={() => { selectedFiles.forEach(id => handleDeleteFile(id)); setSelectedFiles(new Set()) }}
                    className="flex h-6 items-center gap-1 rounded px-2 text-xs text-destructive transition-colors hover:bg-destructive/10"
                  >
                    <X className="h-3 w-3" />
                    Delete
                  </button>
                </div>
              )}

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
                {!classificationView && (<>
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
                  <button
                    onClick={() => setManualEntryOpen(true)}
                    className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    Add Entry
                  </button>
                </>)}
                {classificationView && (
                  <select
                    value={classificationSort}
                    onChange={(e) => setClassificationSort(e.target.value as typeof classificationSort)}
                    className="h-7 rounded border border-border bg-card px-2 text-xs text-muted-foreground focus:outline-none"
                  >
                    <option value="date-desc">Newest first</option>
                    <option value="date-asc">Oldest first</option>
                    <option value="name">Name A–Z</option>
                  </select>
                )}
                {/* Mobile reports trigger */}
                <button
                  className="flex md:hidden h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  onClick={() => setMobileReportsOpen(true)}
                  title="Reports"
                >
                  <BarChart2 className="h-4 w-4" />
                </button>

                {/* View toggle */}
                <div className="flex items-center rounded border border-border">
                  <button
                    onClick={() => setViewMode("list")}
                    className={`flex h-6 w-6 items-center justify-center rounded-l text-xs transition-colors ${viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                      <line x1="4" y1="4" x2="14" y2="4"/><line x1="4" y1="8" x2="14" y2="8"/><line x1="4" y1="12" x2="14" y2="12"/>
                      <rect x="1" y="3" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                      <rect x="1" y="7" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                      <rect x="1" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
                    </svg>
                  </button>
                  <button
                    onClick={() => setViewMode("grid")}
                    className={`flex h-6 w-6 items-center justify-center rounded-r text-xs transition-colors ${viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                      <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
                      <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
                    </svg>
                  </button>
                </div>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,image/*,application/pdf" className="hidden" onChange={(e) => e.target.files && handleUpload(e.target.files)} />
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
              {(viewMode === "list" || classificationView) && (currentSubfolders.length > 0 || displayedFiles.length > 0) && (
                <div className="mb-1 grid grid-cols-[1fr_120px_140px_80px] gap-2 px-3 py-1 text-xs text-muted-foreground">
                  <span>Name</span>
                  <span>Type</span>
                  <span>Modified</span>
                  <span className="text-right">Size</span>
                </div>
              )}

              {/* Subfolders */}
              {viewMode === "list" && currentSubfolders.map((folder) => (
                <div
                  key={folder.id}
                  onDoubleClick={() => openFolder(folder)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, fileId: folder.id, filename: folder.name })
                  }}
                  className="group grid cursor-pointer grid-cols-[1fr_120px_140px_80px] items-center gap-2 rounded px-3 py-1 text-sm transition-colors hover:bg-muted"
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
                      <span className="text-muted-foreground">—</span>
                    </>
                  )}
                </div>
              ))}

              {/* Canvas — draggable snap-to-grid view */}
              {viewMode === "grid" && !classificationView && (
                <div
                  ref={canvasRef}
                  className="relative w-full"
                  style={{ minHeight: `${Math.max(480, (maxRow + 3) * CELL_H + GRID_PAD * 2)}px` }}
                >
                  {currentSubfolders.map((folder) => {
                    const pos = itemPositions[folder.id]
                    if (!pos) return null
                    const isDragging = draggingId === folder.id
                    const isDropTarget = hoveredFolderId === folder.id
                    const left = isDragging && dragGhostPos ? dragGhostPos.x : GRID_PAD + pos.col * CELL_W
                    const top  = isDragging && dragGhostPos ? dragGhostPos.y : GRID_PAD + pos.row * CELL_H
                    return (
                      <div
                        key={folder.id}
                        style={{ position: "absolute", left, top, width: CELL_W - 6, zIndex: isDragging ? 50 : 1 }}
                        className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 select-none transition-colors ${
                          isDragging ? "opacity-90 shadow-xl ring-1 ring-primary/30 cursor-grabbing"
                          : isDropTarget ? "bg-primary/15 ring-2 ring-primary cursor-grab"
                          : "hover:bg-muted cursor-grab"
                        }`}
                        onPointerDown={(e) => handleCanvasPointerDown(e, folder.id)}
                        onPointerMove={(e) => handleCanvasPointerMove(e, folder.id)}
                        onPointerUp={(e) => handleCanvasPointerUp(e, folder.id, hoveredFolderId)}
                        onDoubleClick={() => openFolder(folder)}
                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, fileId: folder.id, filename: folder.name }) }}
                      >
                        <Folder className={`h-10 w-10 ${isDropTarget ? "text-primary" : isDragging ? "text-primary" : "text-primary/70"}`} />
                        {renamingId === folder.id ? (
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") confirmRename(); if (e.key === "Escape") setRenamingId(null) }}
                            onBlur={confirmRename}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full rounded border border-primary bg-background px-1 py-0.5 text-center text-[11px] text-foreground focus:outline-none"
                          />
                        ) : (
                          <span className="w-full truncate text-center text-[11px] text-foreground leading-tight">{folder.name}</span>
                        )}
                      </div>
                    )
                  })}

                  {/* Canvas empty state */}
                  {currentSubfolders.length === 0 && displayedFiles.length === 0 && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none select-none">
                      <div className="flex items-end justify-center gap-2 opacity-10">
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
                      <p className="text-sm text-muted-foreground/40">Drop files here or click Upload</p>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {["PDF", "JPG", "PNG", "WEBP", "HEIC"].map((ext) => (
                          <span key={ext} className="text-xs text-muted-foreground/25">{ext}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {displayedFiles.map((file) => {
                    const pos = itemPositions[file.id]
                    if (!pos) return null
                    const isDragging = draggingId === file.id
                    const left = isDragging && dragGhostPos ? dragGhostPos.x : GRID_PAD + pos.col * CELL_W
                    const top  = isDragging && dragGhostPos ? dragGhostPos.y : GRID_PAD + pos.row * CELL_H
                    return (
                      <div
                        key={file.id}
                        style={{ position: "absolute", left, top, width: CELL_W - 6, zIndex: isDragging ? 50 : 1 }}
                        className={`flex flex-col items-center gap-1 rounded-lg px-1 py-2 select-none ${
                          isDragging
                            ? "opacity-90 shadow-xl ring-1 ring-primary/30 cursor-grabbing"
                            : selectedFiles.has(file.id)
                            ? "bg-primary/10 ring-1 ring-primary/30 cursor-grab"
                            : "hover:bg-muted cursor-grab"
                        }`}
                        onPointerDown={(e) => { if (renamingFileId === file.id) return; handleCanvasPointerDown(e, file.id) }}
                        onPointerMove={(e) => handleCanvasPointerMove(e, file.id)}
                        onPointerUp={(e) => handleCanvasPointerUp(e, file.id, hoveredFolderId)}
                        onClick={(e) => { if (!draggingId) handleFileClick(file.id, e) }}
                        onContextMenu={(e) => handleFileRightClick(e, file.id, file.filename)}
                      >
                        <div className="flex h-10 w-10 items-center justify-center">
                          {file.file_type === "application/pdf"
                            ? <FileText className="h-9 w-9 text-primary/60" />
                            : file.file_type.startsWith("image/")
                            ? <ImageIcon className="h-9 w-9 text-blue-400/70" />
                            : <File className="h-9 w-9 text-muted-foreground" />
                          }
                        </div>
                        {renamingFileId === file.id ? (
                          <input
                            autoFocus
                            value={renameFileValue}
                            onChange={(e) => setRenameFileValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") handleRenameFile(file.id, renameFileValue); if (e.key === "Escape") setRenamingFileId(null) }}
                            onBlur={() => handleRenameFile(file.id, renameFileValue)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-full rounded border border-primary bg-background px-1 py-0.5 text-center text-[11px] text-foreground focus:outline-none"
                          />
                        ) : (
                          <span className="w-full truncate text-center text-[11px] text-foreground leading-tight">{file.filename}</span>
                        )}
                        <span className="w-full truncate text-center text-[10px] text-muted-foreground/60 capitalize leading-tight">
                          {file.document_type === "unknown" ? "Processing…" : file.document_type.replace(/_/g, " ")}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Files — list view (or classification view) */}
              {(viewMode === "list" || classificationView) && displayedFiles.map((file) => (
                <div
                  key={file.id}
                  onClick={(e) => handleFileClick(file.id, e)}
                  onContextMenu={(e) => handleFileRightClick(e, file.id, file.filename)}
                  className={`grid grid-cols-[1fr_120px_140px_80px] items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors cursor-pointer select-none ${
                    selectedFiles.has(file.id) ? "bg-primary/10 text-foreground" : "hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {fileIcon(file.file_type)}
                    {renamingFileId === file.id ? (
                      <input
                        autoFocus
                        value={renameFileValue}
                        onChange={(e) => setRenameFileValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleRenameFile(file.id, renameFileValue)
                          if (e.key === "Escape") setRenamingFileId(null)
                        }}
                        onBlur={() => handleRenameFile(file.id, renameFileValue)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 rounded border border-primary bg-background px-2 py-0.5 text-sm text-foreground focus:outline-none"
                      />
                    ) : (
                      <span className="truncate text-foreground">{file.filename}</span>
                    )}
                  </div>
                  <span className="truncate text-muted-foreground capitalize">
                    {file.document_type === "unknown" ? "Processing…" : file.document_type.replace(/_/g, " ")}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(file.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" })}
                    {" "}
                    <span className="text-muted-foreground/60">
                      {new Date(file.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <span className="text-right text-muted-foreground">{formatBytes(file.file_size)}</span>
                </div>
              ))}

              {/* Context menu — files and folders */}
              {contextMenu && (
                <div
                  className="fixed z-50 min-w-[160px] rounded-xl border border-border bg-card py-1 shadow-xl"
                  style={{ left: contextMenu.x, top: contextMenu.y }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Check if it's a folder */}
                  {folders.some(f => f.id === contextMenu.fileId) ? (
                    <>
                      <button
                        onClick={() => { startRename(folders.find(f => f.id === contextMenu.fileId)!); setContextMenu(null) }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        Rename
                      </button>
                      <div className="my-1 h-px bg-border" />
                      <button
                        onClick={async () => {
                          await supabase.from("folders").delete().eq("id", contextMenu.fileId)
                          setFolders(prev => prev.filter(f => f.id !== contextMenu.fileId))
                          setContextMenu(null)
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <X className="h-3.5 w-3.5" />
                        Delete folder
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setRenamingFileId(contextMenu.fileId); setRenameFileValue(contextMenu.filename); setContextMenu(null) }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        Rename
                      </button>
                      {files.find(f => f.id === contextMenu.fileId)?.folder_id && (() => {
                        const fileFolderId = files.find(f => f.id === contextMenu.fileId)!.folder_id!
                        const parentFolderId = folders.find(f => f.id === fileFolderId)?.parentId ?? null
                        return (
                          <>
                            <div className="my-1 h-px bg-border" />
                            <button
                              onClick={() => { moveFileToFolder(contextMenu.fileId, parentFolderId); setContextMenu(null) }}
                              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                            >
                              <FolderOutput className="h-3.5 w-3.5 text-muted-foreground" />
                              Move up
                            </button>
                          </>
                        )
                      })()}
                      <div className="my-1 h-px bg-border" />
                      <button
                        onClick={() => { setReclassifyTarget({ fileId: contextMenu.fileId, filename: contextMenu.filename }); setContextMenu(null) }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                        Reclassify
                      </button>
                      <div className="my-1 h-px bg-border" />
                      <button
                        onClick={() => { handleDownloadFile(contextMenu.fileId); setContextMenu(null) }}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-foreground transition-colors hover:bg-muted"
                      >
                        <Download className="h-3.5 w-3.5 text-muted-foreground" />
                        Download
                      </button>
                      <div className="my-1 h-px bg-border" />
                      <button
                        onClick={() => handleDeleteFile(contextMenu.fileId)}
                        className="flex w-full items-center gap-2 px-4 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
                      >
                        <X className="h-3.5 w-3.5" />
                        Delete file
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Empty state */}
              {currentSubfolders.length === 0 && displayedFiles.length === 0 && !isCreatingFolder && viewMode === "list" && (
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
          <aside className="hidden md:flex w-[20%] min-w-[180px] flex-col border-l border-border bg-card overflow-hidden">
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
                onClick={() => {
                  if (selectedReport && REPORT_ROUTES[selectedReport]) {
                    router.push(REPORT_ROUTES[selectedReport])
                  }
                }}
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

      {/* MOBILE — Left nav sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col gap-0">
          {/* Documents section */}
          <div className="flex-[0.6] overflow-y-auto border-b border-border p-2">
            <div className="mb-2 flex justify-end px-2">
              <ProcessingIndicator active={isProcessing} />
            </div>
            <LeftFolderItem
              name="Documents"
              isOpen={docsOpen}
              isSelected={selectedLeftFolder === "Documents"}
              onSelect={() => { setSelectedLeftFolder("Documents"); setCurrentFolderId("root"); setBreadcrumb([{ id: "root", name: "Documents" }]); setClassificationView(null); setMobileNavOpen(false) }}
              onToggle={() => setDocsOpen(!docsOpen)}
              level={0}
            >
              <LeftFolderItem
                name="Unclassified"
                isSelected={selectedLeftFolder === "Unclassified"}
                onSelect={() => { setSelectedLeftFolder("Unclassified"); setMobileNavOpen(false) }}
                level={1}
              />
              {folders.filter((f) => f.parentId === null).map((folder) => (
                <div
                  key={folder.id}
                  className={`rounded transition-colors ${hoveredLeftFolderId === folder.id ? "ring-2 ring-primary bg-primary/10" : ""}`}
                >
                  <LeftFolderItem
                    name={folder.name}
                    isSelected={selectedLeftFolder === folder.name}
                    onSelect={() => { setSelectedLeftFolder(folder.name); setClassificationView(null); openFolder(folder); setMobileNavOpen(false) }}
                    level={1}
                    onRename={() => { startRename(folder); setMobileNavOpen(false) }}
                    onDelete={async () => {
                      await supabase.from("folders").delete().eq("id", folder.id)
                      setFolders(prev => prev.filter(f => f.id !== folder.id))
                      if (currentFolderId === folder.id) {
                        setCurrentFolderId("root")
                        setBreadcrumb([{ id: "root", name: "Documents" }])
                        setSelectedLeftFolder("Documents")
                      }
                      setMobileNavOpen(false)
                    }}
                  />
                </div>
              ))}
            </LeftFolderItem>
          </div>

          {/* Classification section */}
          <div className="flex-[0.4] overflow-y-auto p-2">
            <div className="mb-1 px-2">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Classification</span>
            </div>
            <div className="space-y-0.5">
              <button
                onClick={() => { setSelectedLeftFolder("Manual Entries"); setClassificationView("Manual Entries"); setMobileNavOpen(false) }}
                className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${classificationView === "Manual Entries" ? "bg-muted text-foreground" : "text-muted-foreground"}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PenLine className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Manual Entries</span>
                </div>
                {manualEntriesCount > 0 && <span className="text-[10px] text-muted-foreground/60 shrink-0">{manualEntriesCount}</span>}
              </button>
              {visibleClassificationFolders.map((name) => {
                const count = (CLASSIFICATION_FOLDER_MAP[name] ?? []).reduce(
                  (n, t) => n + files.filter(f => f.document_type === t).length, 0
                )
                return (
                  <button
                    key={name}
                    onClick={() => { setSelectedLeftFolder(name); setClassificationView(name); setMobileNavOpen(false) }}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-muted ${classificationView === name ? "bg-muted text-foreground" : "text-muted-foreground"}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Folder className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* MOBILE — Reports sheet */}
      <Sheet open={mobileReportsOpen} onOpenChange={setMobileReportsOpen}>
        <SheetContent side="right" className="w-72 p-0 flex flex-col gap-0">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Reports</h2>
          </div>
          <div className="flex flex-col gap-3 p-3">
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
              onClick={() => {
                if (selectedReport && REPORT_ROUTES[selectedReport]) {
                  router.push(REPORT_ROUTES[selectedReport])
                }
                setMobileReportsOpen(false)
              }}
            >
              Generate Report
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3">
            <div className="space-y-0.5">
              {REPORTS.map((report) => {
                const enabled = report.coreEnabled && (reportAvailability[report.id] ?? false)
                const isSelected = selectedReport === report.id
                return (
                  <button
                    key={report.id}
                    disabled={!enabled}
                    onClick={() => { enabled && setSelectedReport(report.id) }}
                    className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                      isSelected ? "bg-primary/10 text-primary" : enabled ? "text-foreground hover:bg-muted" : "cursor-not-allowed text-muted-foreground/35"
                    }`}
                  >
                    {report.label}
                  </button>
                )
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Manual Entry Modal */}
      <ManualEntryModal
        isOpen={manualEntryOpen}
        userId={session?.user?.id ?? ""}
        onClose={() => setManualEntryOpen(false)}
        onCreated={(file) => {
          setFiles(prev => [file as any, ...prev])
          setManualEntryOpen(false)
        }}
      />

      {/* Reclassify Modal */}
      <ReclassifyModal
        isOpen={reclassifyTarget !== null}
        fileId={reclassifyTarget?.fileId ?? null}
        filename={reclassifyTarget?.filename ?? ""}
        onClose={() => setReclassifyTarget(null)}
        onSaved={(fileId, newType) => {
          setFiles(prev => prev.map(f => f.id === fileId ? { ...f, document_type: newType } : f))
          setReclassifyTarget(null)
        }}
      />

    </div>
  )
}