"use client"

import { useState, useEffect, useCallback, useRef, useMemo } from "react"
import dynamic from "next/dynamic"
import { Navbar } from "@/components/navbar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"
import { Tip, TooltipProvider } from "@/components/ui/tip"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"
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
  PenLine,
  Menu,
  Loader2,
  HardDrive,
} from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { DateRangeSelector } from "@/components/smart-storage/date-range-selector"
import { LeftFolderItem } from "@/components/smart-storage/left-folder-item"
import { StorageItemMenu } from "@/components/smart-storage/storage-item-menu"
import { GoogleDriveImportModal } from "@/components/smart-storage/google-drive-import-modal"
import { useRouter } from "next/navigation"
import {
  formatStorageAllowance,
  formatStorageBytes,
  storageQuotaBytes,
  storageUsagePercent,
} from "@/lib/storage-quota"
import { collapseBreadcrumb } from "@/lib/breadcrumb"
import { trackActivationEvent } from "@/lib/analytics"
import {
  CLASSIFICATION_FOLDER_MAP,
  MAX_FILE_SIZE,
  PRESET_LABELS,
  REPORTS,
  REPORT_ROUTES,
  PROCESSING_ACTIVITY_WINDOW_MS,
  fileExtension,
  findFreeGridSlot,
  getDisplayedSmartStorageFiles,
  getOrderedDisplayedFiles,
  getPresetRange,
  isAllowedUploadFile,
  isUnclassifiedDocument,
  type ClassificationSort,
  type DateRange,
  type DocumentVirtualView,
  type GridPosition,
  type UploadedFile,
  type VirtualFolder,
  type ViewMode,
} from "@/lib/smart-storage"
import {
  fetchSmartStorageFilesByIds,
  fetchSmartStorageFilesPage,
  fetchSmartStorageProcessingState,
  fetchSmartStorageReportAvailability,
  getCachedSmartStorageLaunchData,
  getCachedSmartStorageData,
  getSmartStorageCacheAgeMs,
  prefetchSmartStorageLaunchData,
  refreshSmartStorageData,
  setCachedSmartStorageData,
  type SmartStorageLaunchData,
  type SmartStorageProcessingState,
  type SmartStorageWarmData,
} from "@/lib/smart-storage-cache"

const ManualEntryModal = dynamic(
  () => import("@/components/ui/document-modals").then((mod) => mod.ManualEntryModal),
  { ssr: false },
)
const ReclassifyModal = dynamic(
  () => import("@/components/ui/document-modals").then((mod) => mod.ReclassifyModal),
  { ssr: false },
)
const ReclassifySheetModal = dynamic(
  () => import("@/components/ui/reclassify-sheet-modal").then((mod) => mod.ReclassifySheetModal),
  { ssr: false },
)

const HOVER_PREVIEW_WIDTH = 208
const HOVER_PREVIEW_ESTIMATED_HEIGHT = 248
const HOVER_PREVIEW_CURSOR_GAP = 28
const HOVER_PREVIEW_VIEWPORT_PAD = 8
const SMART_STORAGE_BACKGROUND_REFRESH_AFTER_MS = 30 * 1000
const ACTIONABLE_JOB_WINDOW_MS = 60 * 60 * 1000
const SLOW_PROCESSING_STATUSES = ["uploaded", "processing"]
const CELL_W = 90
const CELL_H = 104
const GRID_PAD = 8
const TOUCH_LONG_PRESS_MS = 420
const TOUCH_MOVE_CANCEL_PX = 10

const REPORT_HINTS: Record<string, string> = {
  tax_bundle: "For self-employed / 1099 income — maps expenses to IRS Schedule C.",
  business_expense: "Itemized, categorized expense report for review or filing.",
  expense_summary: "Totals by category over the selected period.",
  income_summary: "Income totals and sources over the selected period.",
  profit_loss: "Income minus expenses for the period.",
  contract_summary: "Key parties, dates, and obligations pulled from contracts.",
  key_terms: "The important clauses and terms extracted from a document.",
}

type HoverPreviewState = {
  fileId: string
  url: string | null
  x: number
  y: number
}

type ProcessingBadgeState = "working_slow" | "failed"

const formatBytes = formatStorageBytes

function SmartStorageGridSkeleton() {
  return (
    <>
      {Array.from({ length: 10 }).map((_, index) => {
        const col = index % 5
        const row = Math.floor(index / 5)
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: GRID_PAD + col * CELL_W,
              top: GRID_PAD + row * CELL_H,
              width: CELL_W - 6,
            }}
            className="flex flex-col items-center gap-2 rounded-lg px-1 py-2"
          >
            <div className="h-10 w-10 animate-pulse rounded bg-muted" />
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-14 animate-pulse rounded bg-muted/70" />
          </div>
        )
      })}
    </>
  )
}

function SmartStorageListSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[1fr_120px_140px_80px] items-center gap-2 rounded-lg px-3 py-1.5"
        >
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-40 max-w-[70%] animate-pulse rounded bg-muted" />
          </div>
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="ml-auto h-4 w-12 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

function SmartStorageReportSkeleton() {
  return (
    <div className="space-y-1">
      {Array.from({ length: 7 }).map((_, index) => (
        <div key={index} className="rounded px-2 py-2">
          <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-3 w-full animate-pulse rounded bg-muted/70" />
          <div className="mt-1.5 h-3 w-3/4 animate-pulse rounded bg-muted/50" />
        </div>
      ))}
    </div>
  )
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  )
}

function fileIcon(fileType: string) {
  if (fileType === "manual") return <PenLine className="h-4 w-4 shrink-0 text-primary/70" />
  if (fileType.startsWith("image/")) return <ImageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
  if (fileType === "application/pdf") return <FileText className="h-4 w-4 shrink-0 text-primary/60" />
  return <File className="h-4 w-4 shrink-0 text-muted-foreground" />
}

function isSpreadsheetFile(file: { file_type?: string | null; filename?: string | null }): boolean {
  const mime = file.file_type ?? ""
  const name = file.filename ?? ""
  return (
    mime === "text/csv" ||
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    /\.(xlsx|csv)$/i.test(name)
  )
}

function processingBadgeState(file: UploadedFile): ProcessingBadgeState | null {
  const job = file.processing_job
  if (!job?.status || !job.created_at) return null
  const createdAt = Date.parse(job.created_at)
  if (!Number.isFinite(createdAt)) return null
  const ageMs = Date.now() - createdAt
  if (ageMs >= ACTIONABLE_JOB_WINDOW_MS) return null
  if (job.status === "failed") return "failed"
  if (SLOW_PROCESSING_STATUSES.includes(job.status) && ageMs > PROCESSING_ACTIVITY_WINDOW_MS) {
    return "working_slow"
  }
  return null
}

function fileDocumentTypeLabel(file: UploadedFile): { label: string; isFailed: boolean } {
  const documentFieldsCount = file.document_fields_count ?? file.field_count ?? 0
  if (documentFieldsCount > 0) {
    const documentType = file.document_type === "unknown"
      ? (isSpreadsheetFile(file) ? "csv_export" : "ready")
      : file.document_type
    return { label: documentType.replace(/_/g, " "), isFailed: false }
  }
  if (documentFieldsCount === 0 && file.processing_job?.status === "failed") return { label: "Failed", isFailed: true }
  if (file.document_type === "unknown") return { label: "Processing…", isFailed: false }
  return { label: file.document_type.replace(/_/g, " "), isFailed: false }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SmartStoragePage() {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const entitlement = useEntitlement(session)
  const isPro = entitlement.isActive
  const [isProcessing, setIsProcessing] = useState(false)

  // Folder/navigation state
  const [currentFolderId, setCurrentFolderId] = useState<string>("root")
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>([{ id: "root", name: "Documents" }])
  const [selectedLeftFolder, setSelectedLeftFolder] = useState<string>("Documents")
  const [documentVirtualView, setDocumentVirtualView] = useState<DocumentVirtualView | null>(null)
  const [docsOpen, setDocsOpen] = useState(true)
  // Classification view — null = normal folder view, string = active classification name
  const [classificationView, setClassificationView] = useState<string | null>(null)
  const [classificationSort, setClassificationSort] = useState<ClassificationSort>("date-desc")

  // Virtual folders (local state — DB-backed folders coming later)
  const [folders, setFolders] = useState<VirtualFolder[]>([

  ])
  const [newFolderName, setNewFolderName] = useState("")
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")

  // Files state
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [loadedFileCount, setLoadedFileCount] = useState(0)
  const [hasMoreFiles, setHasMoreFiles] = useState(false)
  const [isLoadingLaunchData, setIsLoadingLaunchData] = useState(true)
  const [isLoadingMoreFiles, setIsLoadingMoreFiles] = useState(false)
  const [detectedTypes, setDetectedTypes] = useState<string[]>([])
  const recentlyDeletedFileIdsRef = useRef<Set<string>>(new Set())
  const extractionTrackedFileIdsRef = useRef<Set<string>>(new Set())
  const processingExpiryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const checkProcessingStateRef = useRef<(() => Promise<boolean | undefined>) | null>(null)
  const openFileHandlerRef = useRef<(fileId: string) => Promise<void>>(async () => {})
  const deleteFileHandlerRef = useRef<(fileId: string) => Promise<void>>(async () => {})

  // Upload
  const [isUploading, setIsUploading] = useState(false)
  const [uploadNotice, setUploadNotice] = useState<string | null>(null)
  const [usageNotice, setUsageNotice] = useState<string | null>(null)
  const [isNavigatingReport, setIsNavigatingReport] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [viewMode, setViewMode] = useState<ViewMode>("grid")
  const [boxSelect, setBoxSelect] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null)
  const lastSelectedRef = useRef<string | null>(null)
  const canvasBoxSelectStart = useRef<{ x: number; y: number } | null>(null)
  const touchPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchPressRef = useRef<{
    fileId: string
    pointerId: number
    startX: number
    startY: number
    canceled: boolean
    longPressTriggered: boolean
  } | null>(null)
  const suppressFileClickUntilRef = useRef(0)
  const suppressTouchContextMenuUntilRef = useRef(0)

  // Preview (hover + double-click)
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null)
  const hoverPreviewCache = useRef<Map<string, string>>(new Map())
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hoverRequestRef = useRef(0)
  const lastClickRef = useRef<{ id: string; time: number } | null>(null)
  const [manualEntryOpen, setManualEntryOpen] = useState(false)
  const [reclassifyTarget, setReclassifyTarget] = useState<{ fileId: string; filename: string } | null>(null)
  const [reclassifySheetTarget, setReclassifySheetTarget] = useState<{ fileId: string; filename: string } | null>(null)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [renamingFileId, setRenamingFileId] = useState<string | null>(null)
  const [renameFileValue, setRenameFileValue] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const directoryInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!session?.user?.id) {
      setUsageNotice(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth.session?.access_token
      if (!token) return
      const res = await fetch("/api/usage", { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok || cancelled) return
      const usage = await res.json()
      if (!cancelled) setUsageNotice(typeof usage.message === "string" ? usage.message : null)
    })().catch(() => {})
    return () => { cancelled = true }
  }, [session, entitlement.tier, files.length])

  // Canvas drag state
  const canvasRef = useRef<HTMLDivElement>(null)
  const [itemPositions, setItemPositions] = useState<Record<string, GridPosition>>({})
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragSelectionIds, setDragSelectionIds] = useState<string[]>([])
  // Drag intent tracking — refs avoid stale closure issues in pointer handlers
  const hasDraggedRef = useRef(false)
  const pointerDownPosRef = useRef<{ x: number; y: number } | null>(null)
  const draggingIdRef = useRef<string | null>(null)  // mirrors draggingId state without stale closure
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [dragGhostPos, setDragGhostPos] = useState<{ x: number; y: number } | null>(null)
  const [hoveredLeftFolderId, setHoveredLeftFolderId] = useState<string | null>(null)
  const leftFolderRefs = useRef<Map<string, HTMLElement>>(new Map())

  // Reports
  const [selectedReport, setSelectedReport] = useState<string | null>(null)
  const [showDateRange, setShowDateRange] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>({ preset: "this_year", ...getPresetRange("this_year") })
  const [reportAvailability, setReportAvailability] = useState<Record<string, boolean>>({})
  const [isLoadingReportAvailability, setIsLoadingReportAvailability] = useState(true)
  const router = useRouter()
  const isTaxBundleSelected = selectedReport === "tax_bundle"

  function openReport(reportId: string, options?: { mode?: "schedule_c" | "employed" }) {
    if (!isPro) {
      router.push("/studio#studio-inquiry")
      return
    }

    const route = reportId === "tax_bundle" && options?.mode === "employed"
      ? "/tools/smart-storage/reports/tax-bundle/employed"
      : REPORT_ROUTES[reportId]
    if (!route) return

    setIsNavigatingReport(true)
    const params = new URLSearchParams()
    if (options?.mode && options.mode !== "employed") params.set("mode", options.mode)
    if (dateRange.from) params.set("dateFrom", dateRange.from)
    if (dateRange.to) params.set("dateTo", dateRange.to)
    if (!classificationView && !documentVirtualView && currentFolderId !== "root") {
      params.set("targetFolder", currentFolderId)
    }
    const queryString = params.toString()
    const url = queryString ? `${route}?${queryString}` : route
    window.open(url, "_blank", "noopener,noreferrer")
    window.setTimeout(() => setIsNavigatingReport(false), 600)
  }

  // ── Session ────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionLoaded(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setSessionLoaded(true) })
    return () => subscription.unsubscribe()
  }, [])

  const applyFiles = useCallback((nextFiles: UploadedFile[], nextHasMoreFiles: boolean) => {
    setFiles(nextFiles)
    setLoadedFileCount(nextFiles.length)
    setHasMoreFiles(nextHasMoreFiles)
    const types = [...new Set(nextFiles.map((file) => file.document_type).filter((type) => type !== "unknown"))]
    setDetectedTypes(types)
  }, [])

  const upsertLoadedFiles = useCallback((incomingFiles: UploadedFile[]) => {
    if (incomingFiles.length === 0) return
    setFiles((prev) => {
      const incomingIds = new Set(incomingFiles.map((file) => file.id))
      const nextFiles = [...incomingFiles, ...prev.filter((file) => !incomingIds.has(file.id))]
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      const types = [...new Set(nextFiles.map((file) => file.document_type).filter((type) => type !== "unknown"))]
      setLoadedFileCount(nextFiles.length)
      setDetectedTypes(types)
      return nextFiles
    })
  }, [])

  const applyProcessingState = useCallback((processing: SmartStorageProcessingState) => {
    if (processingExpiryTimeoutRef.current) {
      clearTimeout(processingExpiryTimeoutRef.current)
      processingExpiryTimeoutRef.current = null
    }
    setIsProcessing(processing.isProcessing)
    if (processing.isProcessing) {
      const now = Date.now()
      const delays = processing.activeJobs
        .map((job) => Date.parse(job.created_at ?? "") + PROCESSING_ACTIVITY_WINDOW_MS - now)
        .filter((delay) => Number.isFinite(delay) && delay > 0)
      if (delays.length > 0) {
        processingExpiryTimeoutRef.current = setTimeout(() => {
          void checkProcessingStateRef.current?.()
        }, Math.max(1000, Math.min(...delays) + 250))
      }
    }
  }, [])

  const applyLaunchData = useCallback((data: SmartStorageLaunchData) => {
    const recentlyDeletedIds = recentlyDeletedFileIdsRef.current
    const nextFiles = recentlyDeletedIds.size > 0
      ? data.files.filter((file) => !recentlyDeletedIds.has(file.id))
      : data.files
    applyFiles(nextFiles, data.hasMoreFiles)
    setFolders(data.folders)
    applyProcessingState({ isProcessing: data.isProcessing, activeJobs: data.activeJobs })
  }, [applyFiles, applyProcessingState])

  const applyWarmData = useCallback((data: SmartStorageWarmData) => {
    applyLaunchData(data)
    setReportAvailability(data.reportAvailability)
    setIsLoadingReportAvailability(false)
  }, [applyLaunchData])

  const updateWarmCache = useCallback((userId: string, updates: Partial<SmartStorageWarmData>) => {
    const current = getCachedSmartStorageData(userId)
    if (!current) return
    setCachedSmartStorageData(userId, { ...current, ...updates }, { preserveFetchedAt: true })
  }, [])

  // ── Processing indicator + realtime ───────────────────────────────────────
  const checkProcessingState = useCallback(async () => {
    if (!session?.user?.id) return
    const processing = await fetchSmartStorageProcessingState(session.user.id)
    applyProcessingState(processing)
    updateWarmCache(session.user.id, { isProcessing: processing.isProcessing, activeJobs: processing.activeJobs })
    return processing.isProcessing
  }, [applyProcessingState, session, updateWarmCache])

  useEffect(() => {
    checkProcessingStateRef.current = checkProcessingState
  }, [checkProcessingState])

  useEffect(() => {
    return () => {
      if (processingExpiryTimeoutRef.current) clearTimeout(processingExpiryTimeoutRef.current)
    }
  }, [])

  // ── Load files ─────────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    if (!session?.user?.id) return
    const page = await fetchSmartStorageFilesPage(session.user.id)
    applyFiles(page.files, page.hasMoreFiles)
    updateWarmCache(session.user.id, page)
  }, [applyFiles, session, updateWarmCache])

  const loadMoreFiles = useCallback(async () => {
    if (!session?.user?.id || isLoadingMoreFiles || !hasMoreFiles) return
    setIsLoadingMoreFiles(true)
    try {
      const page = await fetchSmartStorageFilesPage(session.user.id, loadedFileCount)
      const existingIds = new Set(files.map((file) => file.id))
      const nextFiles = [...files, ...page.files.filter((file) => !existingIds.has(file.id))]
      applyFiles(nextFiles, page.hasMoreFiles)
      updateWarmCache(session.user.id, { files: nextFiles, hasMoreFiles: page.hasMoreFiles })
    } finally {
      setIsLoadingMoreFiles(false)
    }
  }, [applyFiles, files, hasMoreFiles, isLoadingMoreFiles, loadedFileCount, session, updateWarmCache])

  const handleFilesScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const element = event.currentTarget
    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight
    if (remaining < 480) void loadMoreFiles()
  }, [loadMoreFiles])

  // ── Report availability ────────────────────────────────────────────────────
  const checkReportAvailability = useCallback(async () => {
    if (!session?.user?.id) return
    setIsLoadingReportAvailability(true)
    try {
      const availability = await fetchSmartStorageReportAvailability(session.user.id)
      setReportAvailability(availability)
      updateWarmCache(session.user.id, { reportAvailability: availability })
    } finally {
      setIsLoadingReportAvailability(false)
    }
  }, [session, updateWarmCache])

  useEffect(() => {
    if (!session?.user?.id) return
    const channel = supabase
      .channel(`processing-jobs-${session.user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "processing_jobs" },
        async (payload) => {
          const fileId = (payload.new as any)?.file_id ?? (payload.old as any)?.file_id
          if (!fileId) return
          if (recentlyDeletedFileIdsRef.current.has(fileId)) return
          const { data: ownsFile } = await supabase
            .from("files")
            .select("id")
            .eq("id", fileId)
            .eq("user_id", session.user.id)
            .maybeSingle()
          if (!ownsFile) return
          const stillActive = await checkProcessingState()
          if (!stillActive) {
            const refreshedFiles = await fetchSmartStorageFilesByIds(session.user.id, [fileId])
            upsertLoadedFiles(refreshedFiles)
            const completedJob = (payload.new as any)?.status === "completed"
            if (completedJob && !extractionTrackedFileIdsRef.current.has(fileId)) {
              extractionTrackedFileIdsRef.current.add(fileId)
              trackActivationEvent("extraction_completed", {
                document_type: refreshedFiles[0]?.document_type ?? "unknown",
              })
            }
            await checkReportAvailability()
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [session, checkProcessingState, upsertLoadedFiles, checkReportAvailability])

  useEffect(() => {
    if (!sessionLoaded) return
    if (!session?.user?.id) {
      setIsLoadingLaunchData(false)
      setIsLoadingReportAvailability(false)
      return
    }
    let active = true
    let idleHandle: number | null = null
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null
    const userId = session.user.id
    setIsLoadingLaunchData(true)
    setIsLoadingReportAvailability(true)

    const applyIfActive = (data: SmartStorageWarmData) => {
      if (active) applyWarmData(data)
    }
    const applyLaunchIfActive = (data: SmartStorageLaunchData) => {
      if (active) applyLaunchData(data)
    }
    const scheduleReportAvailability = (launchData: SmartStorageLaunchData) => {
      const refreshReports = () => {
        if (!active) return
        setIsLoadingReportAvailability(true)
        void fetchSmartStorageReportAvailability(userId)
          .then((reportAvailability) => {
            if (!active) return
            setReportAvailability(reportAvailability)
            setCachedSmartStorageData(userId, { ...launchData, reportAvailability })
          })
          .catch((error) => {
            console.error("smart storage report availability failed:", error)
          })
          .finally(() => {
            if (active) setIsLoadingReportAvailability(false)
          })
      }

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        idleHandle = window.requestIdleCallback(refreshReports, { timeout: 3000 })
      } else {
        refreshTimeout = setTimeout(refreshReports, 600)
      }
    }

    const cached = getCachedSmartStorageData(session.user.id)
    if (cached) {
      applyWarmData(cached)
      setIsLoadingLaunchData(false)
      setIsLoadingReportAvailability(false)
      const cacheAge = getSmartStorageCacheAgeMs(userId)
      if (cacheAge != null && cacheAge <= SMART_STORAGE_BACKGROUND_REFRESH_AFTER_MS) {
        return () => { active = false }
      }

      const refresh = () => {
        if (!active) return
        void refreshSmartStorageData(userId).then(applyIfActive).catch((error) => {
          console.error("smart storage background refresh failed:", error)
        })
      }

      if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        idleHandle = window.requestIdleCallback(refresh, { timeout: 1500 })
      } else {
        refreshTimeout = setTimeout(refresh, 250)
      }

      return () => {
        active = false
        if (idleHandle != null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle)
        if (refreshTimeout) clearTimeout(refreshTimeout)
      }
    }

    const cachedLaunch = getCachedSmartStorageLaunchData(userId)
    if (cachedLaunch) {
      applyLaunchData(cachedLaunch)
      setIsLoadingLaunchData(false)
      setIsLoadingReportAvailability(true)
      scheduleReportAvailability(cachedLaunch)
      return () => {
        active = false
        if (idleHandle != null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle)
        if (refreshTimeout) clearTimeout(refreshTimeout)
      }
    }

    void prefetchSmartStorageLaunchData(userId)
      .then((launchData) => {
        applyLaunchIfActive(launchData)
        if (active) setIsLoadingLaunchData(false)
        scheduleReportAvailability(launchData)
      })
      .catch((error) => {
        if (active) setIsLoadingLaunchData(false)
        if (active) setIsLoadingReportAvailability(false)
        console.error("smart storage initial load failed:", error)
      })
    return () => {
      active = false
      if (idleHandle != null && "cancelIdleCallback" in window) window.cancelIdleCallback(idleHandle)
      if (refreshTimeout) clearTimeout(refreshTimeout)
    }
  }, [applyLaunchData, applyWarmData, session, sessionLoaded])

  // Files — classification view shows all matching types across all folders, sorted by date
  // Declared here (before keyboard shortcut useEffect) to avoid TS2448 forward-reference error.
  const displayedFiles = getDisplayedSmartStorageFiles({
    files,
    currentFolderId,
    documentVirtualView,
    classificationView,
    classificationSort,
  })

  const orderedDisplayedFiles = useMemo(() => {
    return getOrderedDisplayedFiles({
      displayedFiles,
      viewMode,
      classificationView,
      documentVirtualView,
      itemPositions,
    })
  }, [classificationView, displayedFiles, documentVirtualView, itemPositions, viewMode])

  useEffect(() => {
    if (!directoryInputRef.current) return
    directoryInputRef.current.setAttribute("webkitdirectory", "")
    directoryInputRef.current.setAttribute("directory", "")
  }, [])

  const selectOnly = useCallback((ids: string[]) => {
    const next = new Set(ids)
    setSelectedFiles(next)
    lastSelectedRef.current = ids.at(-1) ?? null
  }, [])

  const toggleSelection = useCallback((fileId: string) => {
    setSelectedFiles(prev => {
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
    lastSelectedRef.current = fileId
  }, [])

  const clearTouchPressTimer = useCallback(() => {
    if (touchPressTimerRef.current) {
      clearTimeout(touchPressTimerRef.current)
      touchPressTimerRef.current = null
    }
  }, [])

  useEffect(() => clearTouchPressTimer, [clearTouchPressTimer])

  const toggleTouchSelection = useCallback((fileId: string) => {
    setSelectedFiles(prev => {
      if (prev.size === 0) return new Set([fileId])
      const next = new Set(prev)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
    lastSelectedRef.current = fileId
  }, [])

  const addTouchSelection = useCallback((fileId: string) => {
    setSelectedFiles(prev => {
      if (prev.has(fileId)) return prev
      return prev.size === 0 ? new Set([fileId]) : new Set([...prev, fileId])
    })
    lastSelectedRef.current = fileId
  }, [])

  const handleFileTouchPointerDown = useCallback((e: React.PointerEvent, fileId: string) => {
    if (e.pointerType !== "touch") return false
    e.stopPropagation()
    lastClickRef.current = null
    suppressTouchContextMenuUntilRef.current = Date.now() + 1200
    clearTouchPressTimer()
    touchPressRef.current = {
      fileId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      canceled: false,
      longPressTriggered: false,
    }
    touchPressTimerRef.current = setTimeout(() => {
      const press = touchPressRef.current
      if (!press || press.pointerId !== e.pointerId || press.fileId !== fileId || press.canceled) return
      press.longPressTriggered = true
      suppressFileClickUntilRef.current = Date.now() + 600
      addTouchSelection(fileId)
    }, TOUCH_LONG_PRESS_MS)
    return true
  }, [addTouchSelection, clearTouchPressTimer])

  const handleFileTouchPointerMove = useCallback((e: React.PointerEvent, fileId: string) => {
    if (e.pointerType !== "touch") return false
    const press = touchPressRef.current
    if (!press || press.fileId !== fileId || press.pointerId !== e.pointerId) return true
    const dx = e.clientX - press.startX
    const dy = e.clientY - press.startY
    if (Math.sqrt(dx * dx + dy * dy) > TOUCH_MOVE_CANCEL_PX) {
      press.canceled = true
      clearTouchPressTimer()
    }
    return true
  }, [clearTouchPressTimer])

  const handleFileTouchPointerUp = useCallback((e: React.PointerEvent, fileId: string) => {
    if (e.pointerType !== "touch") return false
    e.stopPropagation()
    const press = touchPressRef.current
    clearTouchPressTimer()
    touchPressRef.current = null
    if (!press || press.fileId !== fileId || press.pointerId !== e.pointerId) return true
    if (press.canceled) return true

    e.preventDefault()
    suppressFileClickUntilRef.current = Date.now() + 600
    if (!press.longPressTriggered) {
      toggleTouchSelection(fileId)
    }
    return true
  }, [clearTouchPressTimer, toggleTouchSelection])

  const handleFileTouchPointerCancel = useCallback((e: React.PointerEvent, fileId: string) => {
    if (e.pointerType !== "touch") return false
    const press = touchPressRef.current
    if (press?.fileId === fileId && press.pointerId === e.pointerId) {
      press.canceled = true
      touchPressRef.current = null
      clearTouchPressTimer()
    }
    return true
  }, [clearTouchPressTimer])

  const handleFileTouchContextMenu = useCallback((e: React.MouseEvent) => {
    if (Date.now() < suppressTouchContextMenuUntilRef.current) {
      e.preventDefault()
      e.stopPropagation()
    }
  }, [])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        e.preventDefault()
        setSelectedFiles(new Set(displayedFiles.map(f => f.id)))
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedFiles.size > 0) {
        e.preventDefault()
        void Promise.all([...selectedFiles].map((id) => deleteFileHandlerRef.current(id)))
        return
      }
      if (e.key === "Enter" && selectedFiles.size === 1) {
        e.preventDefault()
        void openFileHandlerRef.current([...selectedFiles][0])
        return
      }
      if (e.key === "Escape") {
        setSelectedFiles(new Set())
        return
      }
      if (orderedDisplayedFiles.length === 0) return
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        e.preventDefault()
        const ids = orderedDisplayedFiles.map(file => file.id)
        const currentId = lastSelectedRef.current && ids.includes(lastSelectedRef.current)
          ? lastSelectedRef.current
          : ids[0]
        const currentIndex = Math.max(ids.indexOf(currentId), 0)
        const step =
          e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? -1
            : 1
        const nextIndex = Math.min(Math.max(currentIndex + step, 0), ids.length - 1)
        selectOnly([ids[nextIndex]])
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [displayedFiles, orderedDisplayedFiles, selectOnly, selectedFiles])

  // ── Auto-assign canvas positions ───────────────────────────────────────────
  useEffect(() => {
    const subfolderIds = folders
      .filter(f => {
        if (documentVirtualView) return false
        return currentFolderId === "root" ? f.parentId === null : f.parentId === currentFolderId
      })
      .map(f => f.id)
    const visibleFileIds = files
      .filter(f => {
        if (documentVirtualView === "unclassified") return isUnclassifiedDocument(f)
        return (f.folder_id ?? null) === (currentFolderId === "root" ? null : currentFolderId)
      })
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
  }, [folders, files, currentFolderId, documentVirtualView])

  // ── Upload ─────────────────────────────────────────────────────────────────
  const handleUpload = async (uploadFiles: FileList | File[]) => {
    if (!session?.user?.id) return
    setIsUploading(true)
    setIsProcessing(true)
    setUploadNotice(null)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const folderCache = new Map<string, string | null>()
    const resolvedFolderPaths = new Map<string, string | null>()
    const currentParentId = currentFolderId === "root" ? null : currentFolderId
    const uploadList = Array.from(uploadFiles)
    const allowedByQuota = new Set<File>()
    const quotaBytes = storageQuotaBytes(entitlement)
    let projectedStorageBytes = files.reduce((sum, existing) => sum + (existing.file_size || 0), 0)

    for (const file of uploadList) {
      if (file.size > MAX_FILE_SIZE || !isAllowedUploadFile(file)) continue
      if (projectedStorageBytes + file.size > quotaBytes) {
        const message = `Storage quota reached. ${formatStorageAllowance(quotaBytes)} is included with your current plan.`
        console.error(`Skipped ${file.name}: ${message}`)
        setUploadNotice(message)
        continue
      }
      projectedStorageBytes += file.size
      allowedByQuota.add(file)
    }

    for (const folder of folders) {
      folderCache.set(`${folder.parentId ?? "root"}::${folder.name}`, folder.id)
    }

    const ensureFolderPath = async (segments: string[]) => {
      let parentId = currentParentId
      for (const rawSegment of segments) {
        const name = rawSegment.trim()
        if (!name) continue
        const cacheKey = `${parentId ?? "root"}::${name}`
        let existingId = folderCache.get(cacheKey)
        if (existingId == null) {
          const { data, error } = await supabase
            .from("folders")
            .insert({
              user_id: session.user.id,
              name,
              parent_id: parentId,
            })
            .select("id, name, parent_id")
            .single()
          if (error || !data) throw error ?? new Error(`Failed to create folder ${name}`)
          const createdId = data.id
          existingId = createdId
          folderCache.set(cacheKey, createdId)
          setFolders(prev => {
            if (prev.some(folder => folder.id === createdId)) return prev
            return [...prev, { id: data.id, name: data.name, parentId: data.parent_id }]
          })
        }
        parentId = existingId ?? null
      }
      return parentId
    }

    const uniqueFolderPaths = [...new Set(
      uploadList
        .map(file => file.webkitRelativePath?.split("/").filter(Boolean).slice(0, -1).join("/") ?? "")
        .filter(path => path.length > 0)
    )]

    for (const folderPath of uniqueFolderPaths) {
      const folderId = await ensureFolderPath(folderPath.split("/"))
      resolvedFolderPaths.set(folderPath, folderId)
    }

    const uploadOne = async (file: File) => {
      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        console.error(`Skipped ${file.name}: exceeds 60 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`)
        return
      }
      // Validate type
      const ext = fileExtension(file)
      if (!isAllowedUploadFile(file)) {
        console.error(`Skipped ${file.name}: unsupported file type (${file.type || ext})`)
        return
      }
      if (!allowedByQuota.has(file)) {
        return
      }
      const relativePath = file.webkitRelativePath?.split("/").filter(Boolean) ?? []
      const folderSegments = relativePath.slice(0, -1)
      const folderPath = folderSegments.join("/")
      const targetFolderId = folderPath.length > 0
        ? (resolvedFolderPaths.get(folderPath) ?? currentParentId)
        : currentParentId
      const uniqueName = `${crypto.randomUUID()}.${ext}`
      // Phase B: upload into _inbox/ landing zone. Prescan moves the file to
      // the canonical path (or _quarantine/) based on scan result.
      const storagePath = `${session.user.id}/_inbox/${uniqueName}`
      const { error: storageError } = await supabase.storage.from("documents").upload(storagePath, file)
      if (storageError) throw storageError
      let fileId: string | null = null
      try {
        const { data: fileRecord, error: fileError } = await supabase
          .from("files")
          .insert({
            user_id: session.user.id,
            filename: file.name,
            storage_path: storagePath,
            file_type: file.type,
            file_size: file.size,
            document_type: "unknown",
            upload_status: "pending_scan",
            folder_id: targetFolderId,
          })
          .select().single()
        if (fileError || !fileRecord) throw fileError ?? new Error("File record was not created")
        fileId = fileRecord.id
        const { data: jobRecord, error: jobError } = await supabase
          .from("processing_jobs")
          .insert({ file_id: fileRecord.id, status: "uploaded" })
          .select()
          .single()
        if (jobError || !jobRecord) throw jobError ?? new Error("Processing job was not created")

        // Trigger prescan — it will chain into process-document on approval.
        // Uses the user JWT so prescan can verify ownership.
        const userToken = (await supabase.auth.getSession()).data.session?.access_token
        const prescanResponse = await fetch(`${supabaseUrl}/functions/v1/prescan-document`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
          },
          body: JSON.stringify({ file_id: fileRecord.id }),
        })
        if (!prescanResponse.ok) {
          const detail = await prescanResponse.text().catch(() => "")
          throw new Error(detail || `Prescan failed (${prescanResponse.status})`)
        }

        return {
          ...fileRecord,
          document_fields_count: 0,
          processing_job: {
            status: jobRecord.status,
            created_at: jobRecord.created_at,
            error_message: jobRecord.error_message,
          },
        } as UploadedFile
      } catch (metadataError) {
        const cleanupToken = (await supabase.auth.getSession()).data.session?.access_token
        const cleanupResponse = await fetch("/api/uploads/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(cleanupToken ? { Authorization: `Bearer ${cleanupToken}` } : {}) },
          body: JSON.stringify({ storagePath, fileId }),
        }).catch(() => null)
        if (!cleanupResponse?.ok) console.error("upload inbox cleanup failed", { fileId, storagePath })
        throw metadataError
      }
    }

    // Upload all files, then prepend the new records instead of refetching the full file history.
    try {
      const results = await Promise.allSettled(uploadList.map(uploadOne))
      const uploadedFiles: UploadedFile[] = []
      let failedUploads = 0
      for (const r of results) {
        if (r.status === "rejected") {
          failedUploads += 1
          console.error("Upload failed:", r.reason)
        }
        if (r.status === "fulfilled" && r.value) uploadedFiles.push(r.value)
      }
      if (failedUploads > 0) {
        setUploadNotice(`${failedUploads} upload${failedUploads === 1 ? "" : "s"} could not be started for processing. Please retry the upload.`)
      }
      upsertLoadedFiles(uploadedFiles)
      for (const file of uploadedFiles) {
        trackActivationEvent("document_uploaded", {
          file_type: file.file_type ?? "unknown",
          size_bytes: file.file_size ?? 0,
        })
      }

      const stillActive = await checkProcessingState()
      if (!stillActive) setIsProcessing(false)
      await checkReportAvailability()
    } finally {
      setIsUploading(false)
    }
  }

  const handleRetryProcessing = useCallback(async (file: UploadedFile) => {
    if (!session?.user?.id) return
    const functionName =
      file.upload_status === "pending_scan"
        ? "prescan-document"
        : file.upload_status === "approved"
        ? "process-document"
        : null
    if (!functionName) return
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) return

    setIsProcessing(true)
    if (file.processing_job?.status === "failed") {
      const { error } = await supabase
        .from("processing_jobs")
        .insert({ file_id: file.id, status: "uploaded" })
      if (error) console.error("processing_jobs retry insert failed:", error)
    }
    const userToken = (await supabase.auth.getSession()).data.session?.access_token
    const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userToken ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
        "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
      },
      body: JSON.stringify({ file_id: file.id }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      console.error(`${functionName} retry failed:`, text || res.statusText)
    }
    await loadFiles()
    await checkProcessingState()
  }, [session, loadFiles, checkProcessingState])

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true) }
  const handleDragLeave = () => setIsDragOver(false)
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) await handleUpload(e.dataTransfer.files)
  }

  // ── Box select ────────────────────────────────────────────────────────────
  const handleCanvasBoxDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return
    if (e.target !== canvasRef.current) return
    // Capture pointer so move/up keep firing even when leaving the div
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    canvasBoxSelectStart.current = { x, y }
    setBoxSelect({ startX: x, startY: y, currentX: x, currentY: y })
    if (!e.shiftKey) setSelectedFiles(new Set())
  }

  const handleCanvasBoxMove = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return
    if (!canvasBoxSelectStart.current || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setBoxSelect(prev => prev ? { ...prev, currentX: x, currentY: y } : null)
  }

  const handleCanvasBoxUp = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return
    // Release pointer capture so browser doesn't hold it indefinitely
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    if (!boxSelect) return
    const selLeft   = Math.min(boxSelect.startX, boxSelect.currentX)
    const selTop    = Math.min(boxSelect.startY, boxSelect.currentY)
    const selRight  = Math.max(boxSelect.startX, boxSelect.currentX)
    const selBottom = Math.max(boxSelect.startY, boxSelect.currentY)
    if (selRight - selLeft > 6 || selBottom - selTop > 6) {
      const hit = displayedFiles.filter(file => {
        const pos = itemPositions[file.id]
        if (!pos) return false
        const fl = GRID_PAD + pos.col * CELL_W
        const ft = GRID_PAD + pos.row * CELL_H
        return fl < selRight && fl + CELL_W - 6 > selLeft && ft < selBottom && ft + CELL_H > selTop
      })
      if (hit.length > 0) {
        setSelectedFiles(prev => e.shiftKey ? new Set([...prev, ...hit.map(f => f.id)]) : new Set(hit.map(f => f.id)))
      }
    }
    canvasBoxSelectStart.current = null
    setBoxSelect(null)
  }

  // ── File selection ────────────────────────────────────────────────────────
  const handleFileClick = (fileId: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedRef.current) {
      // Shift+click: range select (additive — keeps existing selection and adds the range)
      const allIds = displayedFiles.map(f => f.id)
      const fromIdx = allIds.indexOf(lastSelectedRef.current)
      const toIdx = allIds.indexOf(fileId)
      if (fromIdx !== -1 && toIdx !== -1) {
        const [start, end] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
        setSelectedFiles(prev => new Set([...prev, ...allIds.slice(start, end + 1)]))
      }
    } else if (e.metaKey || e.ctrlKey) {
      toggleSelection(fileId)
    } else {
      selectOnly([fileId])
    }
  }

  const handleFileItemClick = (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (Date.now() < suppressFileClickUntilRef.current) {
      e.preventDefault()
      return
    }
    handleFileClick(fileId, e)
  }

  const handleFileContextIntent = (fileId: string) => {
    hideHoverPreview()
    if (!selectedFiles.has(fileId) || selectedFiles.size === 0) {
      selectOnly([fileId])
    }
  }

  // ── Hover preview ─────────────────────────────────────────────────────────
  const hideHoverPreview = useCallback(() => {
    hoverRequestRef.current += 1
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    setHoverPreview(null)
  }, [])

  const handleFileHoverEnter = useCallback(async (fileId: string, clientX: number, clientY: number) => {
    hoverRequestRef.current += 1
    const requestId = hoverRequestRef.current
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
    hoverTimerRef.current = setTimeout(async () => {
      const file = files.find(f => f.id === fileId)
      if (!file) return
      let url = hoverPreviewCache.current.get(fileId) ?? null
      if (!url && (file.file_type.startsWith("image/") || file.file_type === "application/pdf")) {
        const { data } = await supabase.storage.from("documents").createSignedUrl(file.storage_path, 300)
        if (data?.signedUrl) {
          url = data.signedUrl
          hoverPreviewCache.current.set(fileId, url)
        }
      }
      if (requestId !== hoverRequestRef.current) return
      setHoverPreview({ fileId, url, x: clientX, y: clientY })
    }, 450)
  }, [files])

  const handleFileHoverMove = useCallback((fileId: string, clientX: number, clientY: number) => {
    setHoverPreview(prev => prev?.fileId === fileId ? { ...prev, x: clientX, y: clientY } : prev)
  }, [])

  const handleFileHoverLeave = useCallback(() => {
    hideHoverPreview()
  }, [hideHoverPreview])

  const handleOpenFile = async (fileId: string) => {
    const file = files.find(f => f.id === fileId)
    if (!file) return
    const { data } = await supabase.storage.from("documents").createSignedUrl(file.storage_path, 60)
    if (!data?.signedUrl) return
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  const handleDownloadFile = async (fileId: string) => {
    const file = files.find(f => f.id === fileId)
    if (!file) return
    // Phase B: force attachment disposition so the browser saves the file
    // rather than handing it to a native viewer (Adobe Reader, Preview, etc.).
    // Keeps stored bytes out of any native handler chain.
    const { data } = await supabase.storage.from("documents").createSignedUrl(file.storage_path, 60, {
      download: file.filename,
    })
    if (!data?.signedUrl) return
    window.open(data.signedUrl, "_blank", "noopener,noreferrer")
  }

  const handleDeleteFile = async (fileId: string) => {
    const file = files.find(f => f.id === fileId)
    if (!file) return
    const userToken = (await supabase.auth.getSession()).data.session?.access_token
    recentlyDeletedFileIdsRef.current.add(fileId)
    const clearRecentlyDeleted = window.setTimeout(() => {
      recentlyDeletedFileIdsRef.current.delete(fileId)
    }, 5000)
    const res = await fetch("/api/delete-file", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${userToken ?? ""}`,
      },
      body: JSON.stringify({ file_id: fileId }),
    })

    if (!res.ok) {
      window.clearTimeout(clearRecentlyDeleted)
      recentlyDeletedFileIdsRef.current.delete(fileId)
      const payload = await res.json().catch(() => ({}))
      throw new Error(payload.error ?? "Failed to delete file")
    }

    setFiles(prev => {
      const nextFiles = prev.filter(f => f.id !== fileId)
      setLoadedFileCount(nextFiles.length)
      const types = [...new Set(nextFiles.map((file) => file.document_type).filter((type) => type !== "unknown"))]
      setDetectedTypes(types)
      return nextFiles
    })
    setSelectedFiles(prev => {
      const next = new Set(prev)
      next.delete(fileId)
      return next
    })
    setReportAvailability(() => {
      const next: Record<string, boolean> = {}
      for (const report of REPORTS) next[report.id] = false
      return next
    })
  }

  openFileHandlerRef.current = handleOpenFile
  deleteFileHandlerRef.current = handleDeleteFile

  const handleRenameFile = async (fileId: string, newName: string) => {
    if (!newName.trim()) return
    await supabase.from("files").update({ filename: newName.trim() }).eq("id", fileId)
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, filename: newName.trim() } : f))
    setRenamingFileId(null)
  }

  // ── Canvas helpers ─────────────────────────────────────────────────────────
  const moveFileToFolder = async (fileId: string, targetFolderId: string | null) => {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, folder_id: targetFolderId } : f))
    setItemPositions(prev => { const next = { ...prev }; delete next[fileId]; return next })
    await supabase.from("files").update({ folder_id: targetFolderId }).eq("id", fileId)
  }

  const moveFilesToFolder = async (fileIds: string[], targetFolderId: string | null) => {
    if (fileIds.length === 0) return
    setFiles(prev => prev.map(file => fileIds.includes(file.id) ? { ...file, folder_id: targetFolderId } : file))
    setItemPositions(prev => {
      const next = { ...prev }
      fileIds.forEach(id => { delete next[id] })
      return next
    })
    await supabase.from("files").update({ folder_id: targetFolderId }).in("id", fileIds)
  }

  const handleCanvasPointerDown = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === "touch") return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    hasDraggedRef.current = false
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY }
    draggingIdRef.current = id
    setDraggingId(id)
    if (files.some(file => file.id === id) && selectedFiles.has(id) && selectedFiles.size > 1) {
      setDragSelectionIds([...selectedFiles])
    } else if (files.some(file => file.id === id)) {
      setDragSelectionIds([id])
    } else {
      setDragSelectionIds([])
    }
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top })
    setDragGhostPos(null)
  }

  const handleCanvasPointerMove = (e: React.PointerEvent, id: string) => {
    if (e.pointerType === "touch") return
    if (draggingId !== id || !canvasRef.current) return
    // Only mark as a real drag after moving more than 6px from pointer-down position
    if (!hasDraggedRef.current && pointerDownPosRef.current) {
      const dx = e.clientX - pointerDownPosRef.current.x
      const dy = e.clientY - pointerDownPosRef.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 6) hasDraggedRef.current = true
    }
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
    if (e.pointerType === "touch") return
    if (draggingIdRef.current !== id) { draggingIdRef.current = null; setDraggingId(null); setDragGhostPos(null); setHoveredLeftFolderId(null); setDragSelectionIds([]); return }
    draggingIdRef.current = null
    const draggedFileIds = dragSelectionIds.length > 0 ? dragSelectionIds : [id]

    // No drag movement → treat as click or double-click
    if (!hasDraggedRef.current) {
      const now = Date.now()
      const isDoubleClick = lastClickRef.current?.id === id && now - lastClickRef.current.time < 350
      if (isDoubleClick) {
        lastClickRef.current = null
        void handleOpenFile(id)
      } else {
        lastClickRef.current = { id, time: now }
        handleFileClick(id, e as unknown as React.MouseEvent)
      }
      setDraggingId(null)
      setDragGhostPos(null)
      setDragSelectionIds([])
      return
    }

    const isFile = files.some(f => f.id === id)
    // Drop onto left pane folder
    if (isFile && hoveredLeftFolderId) {
      void moveFilesToFolder(draggedFileIds, hoveredLeftFolderId)
      setDraggingId(null); setDragGhostPos(null); setHoveredLeftFolderId(null); setDragSelectionIds([])
      return
    }
    // Drop onto canvas folder
    if (isFile && hoveredCanvasFolderId) {
      void moveFilesToFolder(draggedFileIds, hoveredCanvasFolderId)
      setDraggingId(null); setDragGhostPos(null); setDragSelectionIds([])
      return
    }
    if (!canvasRef.current) { setDraggingId(null); setDragGhostPos(null); setDragSelectionIds([]); return }
    // Snap to grid
    const cr = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - cr.left - dragOffset.x
    const y = e.clientY - cr.top - dragOffset.y
    const targetCol = Math.max(0, Math.round((x - GRID_PAD) / CELL_W))
    const targetRow = Math.max(0, Math.round((y - GRID_PAD) / CELL_H))
    const origin = itemPositions[id] ?? { col: 0, row: 0 }
    const deltaCol = targetCol - origin.col
    const deltaRow = targetRow - origin.row
    const occupied = new Set(
      Object.entries(itemPositions)
        .filter(([itemId]) => !draggedFileIds.includes(itemId) && itemId !== id)
        .map(([, p]) => `${p.col},${p.row}`)
    )
    setItemPositions(prev => {
      const next = { ...prev }
      if (isFile && draggedFileIds.length > 1) {
        draggedFileIds.forEach(fileId => {
          const current = prev[fileId]
          if (!current) return
          const proposedCol = Math.max(0, current.col + deltaCol)
          const proposedRow = Math.max(0, current.row + deltaRow)
          const slot = findFreeGridSlot(proposedCol, proposedRow, occupied)
          next[fileId] = slot
          occupied.add(`${slot.col},${slot.row}`)
        })
      } else {
        const slot = findFreeGridSlot(targetCol, targetRow, occupied)
        next[id] = slot
      }
      return next
    })
    setDraggingId(null); setDragGhostPos(null); setDragSelectionIds([])
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
    setDocumentVirtualView(null)
    setCurrentFolderId(folder.id)
    setBreadcrumb((prev) => {
      const existing = prev.findIndex((b) => b.id === folder.id)
      if (existing !== -1) return prev.slice(0, existing + 1)
      return [...prev, { id: folder.id, name: folder.name }]
    })
  }

  const navigateBreadcrumb = (id: string, name: string, index: number) => {
    setDocumentVirtualView(null)
    setCurrentFolderId(id)
    setBreadcrumb((prev) => prev.slice(0, index + 1))
  }

  const manualEntriesCount = files.filter(f => f.file_type === "manual").length

  // ── Dynamic classification folders ────────────────────────────────────────
  const visibleClassificationFolders = Object.entries(CLASSIFICATION_FOLDER_MAP)
    .filter(([, types]) => types.some((t) => detectedTypes.includes(t)))
    .map(([name]) => name)
  const usedStorageBytes = files.reduce((sum, file) => sum + (file.file_size || 0), 0)
  const includedStorageBytes = storageQuotaBytes(entitlement)
  const usedStoragePercent = storageUsagePercent(usedStorageBytes, includedStorageBytes)
  const selectedStorageBytes = useMemo(() => {
    if (selectedFiles.size === 0) return 0
    return files.reduce((sum, file) => selectedFiles.has(file.id) ? sum + (file.file_size || 0) : sum, 0)
  }, [files, selectedFiles])

  const currentSubfolders = classificationView || documentVirtualView ? [] : folders.filter((f) =>
    currentFolderId === "root" ? f.parentId === null : f.parentId === currentFolderId
  )

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
  const isShowingInitialFileSkeleton = isLoadingLaunchData && currentSubfolders.length === 0 && displayedFiles.length === 0 && !isCreatingFolder
  const hasReportAvailability = Object.keys(reportAvailability).length > 0
  const isShowingReportSkeleton = isLoadingReportAvailability && !hasReportAvailability

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (sessionLoaded && !session) return <AuthGuardModal isVisible={true} />

  const visibleBreadcrumb = collapseBreadcrumb(breadcrumb)

  const storageToolbar = (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-sm">
        {classificationView ? (
          <>
            <button
              onClick={() => { setClassificationView(null); setDocumentVirtualView(null); setSelectedLeftFolder("Documents") }}
              className="rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >Classification</button>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate px-1 font-medium text-foreground">{classificationView}</span>
          </>
        ) : documentVirtualView === "unclassified" ? (
          <>
            <button
              onClick={() => { setDocumentVirtualView(null); setSelectedLeftFolder("Documents") }}
              className="rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >Documents</button>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate px-1 font-medium text-foreground">Unclassified</span>
          </>
        ) : (
          visibleBreadcrumb.map((crumb, index) => {
            if (crumb === "ellipsis") {
              return (
                <span key="breadcrumb-ellipsis" className="flex shrink-0 items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="rounded px-1 py-0.5 text-muted-foreground">...</span>
                </span>
              )
            }

            const originalIndex = breadcrumb.findIndex((item) => item.id === crumb.id)
            return (
              <span key={crumb.id} className="flex min-w-0 items-center gap-1">
                {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
              <button
                onClick={() => navigateBreadcrumb(crumb.id, crumb.name, originalIndex)}
                className={`truncate rounded px-1 py-0.5 transition-colors hover:bg-muted ${
                  originalIndex === breadcrumb.length - 1 ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {crumb.name}
              </button>
            </span>
            )
          })
        )}
      </div>

      {selectedFiles.size > 0 && (
        <div className="flex shrink-0 items-center gap-1 border-r border-border pr-2">
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {selectedFiles.size} selected <span className="text-muted-foreground/50">·</span> {formatBytes(selectedStorageBytes)}
          </span>
          <button
            onClick={() => {
              const fileId = [...selectedFiles][0]
              const file = files.find(f => f.id === fileId)
              if (file) { setRenamingFileId(fileId); setRenameFileValue(file.filename) }
            }}
            disabled={selectedFiles.size !== 1}
            className="flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <Pencil className="h-3 w-3" />
            Rename
          </button>
          <button
            onClick={() => { void Promise.all([...selectedFiles].map(id => handleDeleteFile(id))) }}
            className="flex h-7 items-center gap-1 rounded px-2 text-xs text-destructive transition-colors hover:bg-destructive/10"
          >
            <X className="h-3 w-3" />
            Delete
          </button>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1">
        {breadcrumb.length > 1 && (
          <Tip text="Go up to the parent folder."><button
            onClick={() => { const prev = breadcrumb[breadcrumb.length - 2]; navigateBreadcrumb(prev.id, prev.name, breadcrumb.length - 2) }}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button></Tip>
        )}
        {!classificationView && !documentVirtualView && (<>
          <Tip text="Create a folder to organize documents your way."><button
            onClick={() => setIsCreatingFolder(true)}
            className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
            New folder
          </button></Tip>
          <DropdownMenu>
            <Tip text="Add receipts, invoices, payslips, or contracts — we scan each file, then auto-extract the key fields."><DropdownMenuTrigger asChild disabled={isUploading}>
              <button aria-label="Upload" className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50">
                {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {isUploading ? "Uploading..." : "Upload"}
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger></Tip>
              <DropdownMenuContent align="start" className="min-w-[176px] rounded-xl">
              <Tip text="Pick individual files — PDF, images, XLSX or CSV, up to 60 MB each."><DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" />
                Upload files
              </DropdownMenuItem></Tip>
              <Tip text="Import a whole folder; its subfolders are recreated here."><DropdownMenuItem onSelect={() => directoryInputRef.current?.click()}>
                <FolderOpen className="h-3.5 w-3.5" />
                Upload folder
              </DropdownMenuItem></Tip>
              </DropdownMenuContent>
          </DropdownMenu>
          <GoogleDriveImportModal session={session} onImported={() => { void loadFiles(); void checkProcessingState() }} />
          <Tip text="Enter a document by hand when you don't have a file to upload."><button
            onClick={() => setManualEntryOpen(true)}
            className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <PenLine className="h-3.5 w-3.5" />
            Add Entry
          </button></Tip>
        </>)}
        {(classificationView || documentVirtualView) && (
          <select
            value={classificationSort}
            onChange={(e) => setClassificationSort(e.target.value as typeof classificationSort)}
            className="h-7 rounded border border-border bg-card px-2 text-xs text-muted-foreground focus:outline-none"
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="name">Name A-Z</option>
          </select>
        )}
        <div className="flex items-center rounded border border-border">
          <Tip text="Show documents as a detailed list."><button
            onClick={() => setViewMode("list")}
            className={`flex h-6 w-6 items-center justify-center rounded-l text-xs transition-colors ${viewMode === "list" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            aria-label="List view"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
              <line x1="4" y1="4" x2="14" y2="4"/><line x1="4" y1="8" x2="14" y2="8"/><line x1="4" y1="12" x2="14" y2="12"/>
              <rect x="1" y="3" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
              <rect x="1" y="7" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
              <rect x="1" y="11" width="2" height="2" rx="0.5" fill="currentColor" stroke="none"/>
            </svg>
          </button></Tip>
          <Tip text="Show documents as icons you can arrange."><button
            onClick={() => setViewMode("grid")}
            className={`flex h-6 w-6 items-center justify-center rounded-r text-xs transition-colors ${viewMode === "grid" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
            aria-label="Grid view"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
              <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
              <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
            </svg>
          </button></Tip>
        </div>
      </div>
    </div>
  )

  const renderProcessingJobBadge = (file: UploadedFile) => {
    const badge = processingBadgeState(file)
    if (!badge) return null
    const title = badge === "failed"
      ? file.processing_job?.error_message ?? "Processing failed"
      : "Processing is taking longer than expected"
    const label = badge === "failed" ? "Failed - retry" : "Still working..."

    return (
      <Tip text="Click to retry processing">
        <span
          className={`inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] leading-none ${
            badge === "failed"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
          title={title}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="truncate text-left underline-offset-2 hover:underline"
            onClick={() => { void handleRetryProcessing(file) }}
          >
            {label}
          </button>
          {badge === "working_slow" && (
            <button
              type="button"
              className="shrink-0 underline-offset-2 hover:underline"
              onClick={() => { void handleRetryProcessing(file) }}
            >
              Retry
            </button>
          )}
        </span>
      </Tip>
    )
  }

  return (
    <TooltipProvider>
    <div className="flex min-h-screen flex-col">
      <Navbar wide toolSlot={storageToolbar} />

      <main className="flex min-h-0 flex-1 overflow-hidden">
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* LEFT PANE ─────────────────────────────────────────────────────── */}
          <aside className="hidden min-h-0 md:flex w-[15%] min-w-[180px] flex-col border-r border-border bg-card overflow-hidden">
            <div className="border-b border-border p-3">
              <div className="flex items-center gap-2 text-xs font-medium text-foreground">
                <HardDrive className="h-3.5 w-3.5 text-primary" />
                <span>Storage</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-300"
                  style={{ width: `${usedStoragePercent}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                {formatBytes(usedStorageBytes)} of {formatStorageAllowance(includedStorageBytes)}
              </p>
            </div>
            {/* Documents section — user folder tree */}
            <div className="flex-[0.6] overflow-y-auto border-b border-border p-2">
              {/* Processing indicator */}
              <div className="mb-2 flex justify-end px-2">
                <Tip text="Files being processed - usually completes in 1-3 minutes">
                  <span>
                    <ProcessingIndicator active={isProcessing} />
                  </span>
                </Tip>
              </div>

              {/* Documents tree — mirrors workspace structure */}
              <LeftFolderItem
                name="Documents"
                isOpen={docsOpen}
                isSelected={selectedLeftFolder === "Documents"}
                onSelect={() => { setSelectedLeftFolder("Documents"); setDocumentVirtualView(null); setCurrentFolderId("root"); setBreadcrumb([{ id: "root", name: "Documents" }]); setClassificationView(null) }}
                onToggle={() => setDocsOpen(!docsOpen)}
                level={0}
              >
                <LeftFolderItem
                  name="Unclassified"
                  isSelected={selectedLeftFolder === "Unclassified"}
                  onSelect={() => { setSelectedLeftFolder("Unclassified"); setDocumentVirtualView("unclassified"); setClassificationView(null); setCurrentFolderId("root"); setBreadcrumb([{ id: "root", name: "Documents" }]); setSelectedFiles(new Set()) }}
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
                        setDocumentVirtualView(null)
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
                  onClick={() => { setSelectedLeftFolder("Manual Entries"); setDocumentVirtualView(null); setClassificationView("Manual Entries") }}
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
                      onClick={() => { setSelectedLeftFolder(name); setDocumentVirtualView(null); setClassificationView(name) }}
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
            className={`relative flex min-h-0 w-full md:w-[65%] flex-col overflow-hidden bg-background transition-colors ${isDragOver ? "bg-primary/5" : ""}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            {/* Toolbar */}
            <div className="flex h-10 items-center gap-2 border-b border-border bg-card/50 px-4 md:hidden">
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
                      onClick={() => { setClassificationView(null); setDocumentVirtualView(null); setSelectedLeftFolder("Documents") }}
                      className="text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted"
                    >Classification</button>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground px-1">{classificationView}</span>
                    <span className="hidden sm:inline ml-2 text-[10px] text-muted-foreground/60 italic">read-only view · files not moved</span>
                  </>
                ) : documentVirtualView === "unclassified" ? (
                  <>
                    <button
                      onClick={() => { setDocumentVirtualView(null); setSelectedLeftFolder("Documents") }}
                      className="text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted"
                    >Documents</button>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium text-foreground px-1">Unclassified</span>
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
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {selectedFiles.size} selected <span className="text-muted-foreground/50">·</span> {formatBytes(selectedStorageBytes)}
                  </span>
                  <button
                    onClick={() => {
                      const fileId = [...selectedFiles][0]
                      const file = files.find(f => f.id === fileId)
                      if (file) { setRenamingFileId(fileId); setRenameFileValue(file.filename) }
                    }}
                    disabled={selectedFiles.size !== 1}
                    className="flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                    Rename
                  </button>
                  <button
                    onClick={() => { void Promise.all([...selectedFiles].map(id => handleDeleteFile(id))) }}
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
                {!classificationView && !documentVirtualView && (<>
                  <button
                    onClick={() => setIsCreatingFolder(true)}
                    className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New folder
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild disabled={isUploading}>
                      <button
                        className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
                      >
                        {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                        {isUploading ? "Uploading…" : "Upload"}
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-[176px] rounded-xl">
                      <DropdownMenuItem onSelect={() => fileInputRef.current?.click()}>
                        <Upload className="h-3.5 w-3.5" />
                        Upload files
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => directoryInputRef.current?.click()}>
                        <FolderOpen className="h-3.5 w-3.5" />
                        Upload folder
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    onClick={() => setManualEntryOpen(true)}
                    className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <PenLine className="h-3.5 w-3.5" />
                    Add Entry
                  </button>
                </>)}
                {uploadNotice && (
                  <span className="max-w-[240px] truncate text-xs text-destructive">
                    {uploadNotice}
                  </span>
                )}
                {usageNotice && !uploadNotice && (
                  <span className="max-w-[360px] truncate text-xs text-amber-600 dark:text-amber-400">
                    {usageNotice}
                  </span>
                )}
                {(classificationView || documentVirtualView) && (
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
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.csv,.xlsx,image/*,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => e.target.files && handleUpload(e.target.files)} />
                <input ref={directoryInputRef} type="file" multiple className="hidden" onChange={(e) => e.target.files && handleUpload(e.target.files)} />
              </div>
            </div>

            {/* File/folder list */}
            <div className="flex-1 overflow-y-auto p-4" onScroll={handleFilesScroll}>

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
                <StorageItemMenu
                  key={folder.id}
                  kind="folder"
                  filename={folder.name}
                  isMultiSelect={false}
                  multiSelectCount={0}
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
                >
                  <div
                    onDoubleClick={() => openFolder(folder)}
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
                </StorageItemMenu>
              ))}

              {/* Canvas — draggable snap-to-grid view */}
              {viewMode === "grid" && !classificationView && (
                <div
                  ref={canvasRef}
                  className="relative w-full"
                  style={{ minHeight: `${Math.max(480, (maxRow + 3) * CELL_H + GRID_PAD * 2)}px` }}
                  onPointerDown={handleCanvasBoxDown}
                  onPointerMove={handleCanvasBoxMove}
                  onPointerUp={handleCanvasBoxUp}
                >
                  {currentSubfolders.map((folder) => {
                    const pos = itemPositions[folder.id]
                    if (!pos) return null
                    const isDragging = draggingId === folder.id
                    const isDropTarget = hoveredFolderId === folder.id
                    const left = isDragging && dragGhostPos ? dragGhostPos.x : GRID_PAD + pos.col * CELL_W
                    const top  = isDragging && dragGhostPos ? dragGhostPos.y : GRID_PAD + pos.row * CELL_H
                    return (
                      <StorageItemMenu
                        key={folder.id}
                        kind="folder"
                        filename={folder.name}
                        isMultiSelect={false}
                        multiSelectCount={0}
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
                      >
                        <div
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
                      </StorageItemMenu>
                    )
                  })}

                  {/* Canvas empty state */}
                  {isShowingInitialFileSkeleton && <SmartStorageGridSkeleton />}

                  {currentSubfolders.length === 0 && displayedFiles.length === 0 && !isShowingInitialFileSkeleton && (
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
                      <p className="text-sm text-muted-foreground/40">
                        {documentVirtualView === "unclassified" ? "No unclassified documents" : "Drop files or folders here, or use Upload"}
                      </p>
                      {!documentVirtualView && (
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {["PDF", "JPG", "PNG", "WEBP", "HEIC"].map((ext) => (
                            <span key={ext} className="text-xs text-muted-foreground/25">{ext}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Box select visual */}
                  {boxSelect && (
                    <div
                      style={{
                        position: "absolute",
                        left:   Math.min(boxSelect.startX, boxSelect.currentX),
                        top:    Math.min(boxSelect.startY, boxSelect.currentY),
                        width:  Math.abs(boxSelect.currentX - boxSelect.startX),
                        height: Math.abs(boxSelect.currentY - boxSelect.startY),
                        border: "1px solid rgba(220,38,38,0.5)",
                        background: "rgba(220,38,38,0.06)",
                        borderRadius: 4,
                        pointerEvents: "none",
                        zIndex: 200,
                      }}
                    />
                  )}

                  {displayedFiles.map((file) => {
                    const pos = itemPositions[file.id]
                    if (!pos) return null
                    const isDragging = draggingId === file.id
                    const isSelected = selectedFiles.has(file.id)
                    const left = isDragging && dragGhostPos ? dragGhostPos.x : GRID_PAD + pos.col * CELL_W
                    const top  = isDragging && dragGhostPos ? dragGhostPos.y : GRID_PAD + pos.row * CELL_H
                    const dragCount = dragSelectionIds.includes(file.id) ? dragSelectionIds.length : 0
                    const documentTypeLabel = fileDocumentTypeLabel(file)
                    return (
                      <StorageItemMenu
                        key={file.id}
                        kind="file"
                        filename={file.filename}
                        isMultiSelect={selectedFiles.size > 1 && selectedFiles.has(file.id)}
                        multiSelectCount={selectedFiles.size}
                        canMoveUp={Boolean(file.folder_id)}
                        onRename={() => { setRenamingFileId(file.id); setRenameFileValue(file.filename) }}
                        onDelete={() => handleDeleteFile(file.id)}
                        onDownload={() => handleDownloadFile(file.id)}
                        onDownloadSelection={() => Promise.all([...selectedFiles].map(fid => handleDownloadFile(fid))).then(() => undefined)}
                        onDeleteSelection={() => Promise.all([...selectedFiles].map(fid => handleDeleteFile(fid))).then(() => undefined)}
                        disableTouchContextMenu
                        onMoveUp={() => {
                          const parentFolderId = folders.find(f => f.id === file.folder_id)?.parentId ?? null
                          return moveFileToFolder(file.id, parentFolderId)
                        }}
                        onReclassify={() => {
                          if (isSpreadsheetFile(file)) {
                            setReclassifySheetTarget({ fileId: file.id, filename: file.filename })
                          } else {
                            setReclassifyTarget({ fileId: file.id, filename: file.filename })
                          }
                        }}
                        onContextIntent={() => handleFileContextIntent(file.id)}
                      >
                        <div
                          style={{ position: "absolute", left, top, width: CELL_W - 6, zIndex: isDragging ? 50 : 1 }}
                          className={`group relative flex flex-col items-center gap-1 rounded-lg px-1 py-2 select-none ${
                            isDragging
                              ? "opacity-90 shadow-xl ring-1 ring-primary/30 cursor-grabbing"
                              : isSelected
                              ? "bg-primary/10 ring-1 ring-primary/30 cursor-grab"
                              : "hover:bg-muted cursor-grab"
                          }`}
                          onPointerDown={(e) => {
                            hideHoverPreview()
                            if (renamingFileId === file.id) return
                            if (handleFileTouchPointerDown(e, file.id)) return
                            handleCanvasPointerDown(e, file.id)
                          }}
                          onPointerMove={(e) => {
                            if (handleFileTouchPointerMove(e, file.id)) return
                            handleCanvasPointerMove(e, file.id)
                          }}
                          onPointerUp={(e) => {
                            if (handleFileTouchPointerUp(e, file.id)) return
                            handleCanvasPointerUp(e, file.id, hoveredFolderId)
                          }}
                          onPointerCancel={(e) => { handleFileTouchPointerCancel(e, file.id) }}
                          onClick={(e) => handleFileItemClick(file.id, e as unknown as React.MouseEvent)}
                          onContextMenuCapture={handleFileTouchContextMenu}
                          onMouseEnter={(e) => handleFileHoverEnter(file.id, e.clientX, e.clientY)}
                          onMouseMove={(e) => handleFileHoverMove(file.id, e.clientX, e.clientY)}
                          onMouseLeave={handleFileHoverLeave}
                        >
                          {/* Checkbox — visible on hover or when any file is selected */}
                          <div
                            className={`absolute left-1 top-1 transition-opacity ${
                              isSelected || selectedFiles.size > 0 ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                            }`}
                            onClick={(e) => { e.stopPropagation(); toggleSelection(file.id) }}
                          >
                            <div className={`flex h-4 w-4 items-center justify-center rounded border ${
                              isSelected ? "border-primary bg-primary" : "border-border bg-background/80"
                            }`}>
                              {isSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                            </div>
                          </div>
                          {dragCount > 1 && isDragging && (
                            <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground shadow-sm">
                              {dragCount}
                            </span>
                          )}
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
                          {file.upload_status === "quarantined" ? (
                            <span className="w-full truncate text-center text-[10px] text-red-600 leading-tight" title={file.scan_reason ?? "Blocked by security scan"}>
                              Blocked
                            </span>
                          ) : (
                            <span className={`w-full truncate text-center text-[10px] capitalize leading-tight ${
                              documentTypeLabel.isFailed ? "text-destructive" : "text-muted-foreground/60"
                            }`}>
                              {documentTypeLabel.label}
                            </span>
                          )}
                          {renderProcessingJobBadge(file)}
                        </div>
                      </StorageItemMenu>
                    )
                  })}
                </div>
              )}

              {/* Files — list view (or classification view) */}
              {(viewMode === "list" || classificationView) && isShowingInitialFileSkeleton && (
                <SmartStorageListSkeleton />
              )}

              {(viewMode === "list" || classificationView) && displayedFiles.map((file) => (
                <StorageItemMenu
                  key={file.id}
                  kind="file"
                  filename={file.filename}
                  isMultiSelect={selectedFiles.size > 1 && selectedFiles.has(file.id)}
                  multiSelectCount={selectedFiles.size}
                  canMoveUp={Boolean(file.folder_id)}
                  onRename={() => { setRenamingFileId(file.id); setRenameFileValue(file.filename) }}
                  onDelete={() => handleDeleteFile(file.id)}
                  onDownload={() => handleDownloadFile(file.id)}
                  onDownloadSelection={() => Promise.all([...selectedFiles].map(fid => handleDownloadFile(fid))).then(() => undefined)}
                  onDeleteSelection={() => Promise.all([...selectedFiles].map(fid => handleDeleteFile(fid))).then(() => undefined)}
                  disableTouchContextMenu
                  onMoveUp={() => {
                    const parentFolderId = folders.find(f => f.id === file.folder_id)?.parentId ?? null
                    return moveFileToFolder(file.id, parentFolderId)
                  }}
                  onReclassify={() => {
                    if (isSpreadsheetFile(file)) {
                      setReclassifySheetTarget({ fileId: file.id, filename: file.filename })
                    } else {
                      setReclassifyTarget({ fileId: file.id, filename: file.filename })
                    }
                  }}
                  onContextIntent={() => handleFileContextIntent(file.id)}
                >
                  <div
                    onPointerDown={(e) => {
                      hideHoverPreview()
                      handleFileTouchPointerDown(e, file.id)
                    }}
                    onPointerMove={(e) => { handleFileTouchPointerMove(e, file.id) }}
                    onPointerUp={(e) => { handleFileTouchPointerUp(e, file.id) }}
                    onPointerCancel={(e) => { handleFileTouchPointerCancel(e, file.id) }}
                    onClick={(e) => handleFileItemClick(file.id, e as unknown as React.MouseEvent)}
                    onContextMenuCapture={handleFileTouchContextMenu}
                    onDoubleClick={() => handleOpenFile(file.id)}
                    onMouseEnter={(e) => handleFileHoverEnter(file.id, e.clientX, e.clientY)}
                    onMouseMove={(e) => handleFileHoverMove(file.id, e.clientX, e.clientY)}
                    onMouseLeave={handleFileHoverLeave}
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
                    <span className="flex min-w-0 flex-col items-start gap-1">
                      {file.upload_status === "quarantined" ? (
                        <span className="max-w-full truncate text-red-600" title={file.scan_reason ?? "Blocked by security scan"}>
                          Blocked
                        </span>
                      ) : (
                        (() => {
                          const documentTypeLabel = fileDocumentTypeLabel(file)
                          return (
                            <span className={`max-w-full truncate capitalize ${
                              documentTypeLabel.isFailed ? "text-destructive" : "text-muted-foreground"
                            }`}>
                              {documentTypeLabel.label}
                            </span>
                          )
                        })()
                      )}
                      {renderProcessingJobBadge(file)}
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
                </StorageItemMenu>
              ))}


              {/* Empty state */}
              {currentSubfolders.length === 0 && displayedFiles.length === 0 && !isCreatingFolder && !isShowingInitialFileSkeleton && viewMode === "list" && (
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
                  <p className="text-sm text-muted-foreground">
                    {documentVirtualView === "unclassified" ? "No unclassified documents" : "Drop files or folders here, or use Upload"}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {["PDF", "JPG", "JPEG", "PNG", "WEBP", "HEIC"].map((ext) => (
                      <span key={ext} className="text-xs text-muted-foreground/50">{ext}</span>
                    ))}
                  </div>
                </div>
              )}

              {hasMoreFiles && (
                <div className="flex justify-center py-4">
                  <Tip text="Load older documents."><Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    disabled={isLoadingMoreFiles}
                    onClick={() => void loadMoreFiles()}
                  >
                    {isLoadingMoreFiles ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</> : "Load more"}
                  </Button></Tip>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANE ─────────────────────────────────────────────────────── */}
          <aside className="hidden min-h-0 md:flex w-[20%] min-w-[180px] flex-col border-l border-border bg-card overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Reports</h2>
            </div>

            <div className="flex flex-col gap-3 p-3">
              {/* Date range toggle */}
              <Tip text="Limit reports to a date range. Defaults to your most active tax year."><button
                onClick={() => setShowDateRange(!showDateRange)}
                className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {dateRange.preset === "custom" ? `${dateRange.from} – ${dateRange.to}` : PRESET_LABELS[dateRange.preset]}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDateRange ? "rotate-180" : ""}`} />
              </button></Tip>

              {showDateRange && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <DateRangeSelector dateRange={dateRange} onChange={setDateRange} />
                </div>
              )}

              {isTaxBundleSelected && isPro ? (
                <div className="space-y-2">
                  <p className="px-1 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Tax Bundle Mode
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Tip text="For self-employed / 1099 income — maps expenses to IRS Schedule C."><Button
                      className="rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                      disabled={isNavigatingReport || isLoadingReportAvailability || !reportAvailability.tax_bundle}
                      size="sm"
                      onClick={() => openReport("tax_bundle", { mode: "schedule_c" })}
                    >
                      {isNavigatingReport || isLoadingReportAvailability ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Loading…</> : "Self-Employed"}
                    </Button></Tip>
                    <Tip text="For W-2 wage earners — organizes payslips and withholdings."><Button
                      variant="outline"
                      className="rounded-lg border-primary/25 text-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                      disabled={isNavigatingReport || isLoadingReportAvailability || !reportAvailability.tax_bundle}
                      size="sm"
                      onClick={() => openReport("tax_bundle", { mode: "employed" })}
                    >
                      Employed
                    </Button></Tip>
                  </div>
                  <p className="px-1 text-[11px] leading-relaxed text-muted-foreground/75">
                    Choose the report path that matches the income documents you want to review.
                  </p>
                </div>
              ) : (
                <Tip text={!isPro ? "Upgrade to Pro to generate reports" : "Generate the selected report."}><Button
                  className="w-full rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={isPro && (!selectedReport || isLoadingReportAvailability || !reportAvailability[selectedReport] || isNavigatingReport)}
                  size="sm"
                  onClick={() => {
                    if (selectedReport) openReport(selectedReport)
                  }}
                  title={!isPro ? "Upgrade to Pro to generate reports" : undefined}
                >
                  {isNavigatingReport ? (
                    <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Generating…</>
                  ) : isPro ? "Generate Report" : "Upgrade to Pro"}
                </Button></Tip>
              )}
            </div>

            {/* Flat report list */}
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              <div className="space-y-0.5">
                {isShowingReportSkeleton ? (
                  <SmartStorageReportSkeleton />
                ) : REPORTS.map((report) => {
                  const enabled = report.coreEnabled && (reportAvailability[report.id] ?? false)
                  const locked = !isPro
                  const isSelected = selectedReport === report.id
                  const dimmed = !enabled || locked
                  return (
                    <Tip text={locked ? "Upgrade to Pro to generate reports" : REPORT_HINTS[report.id] ?? report.description}><button
                      key={report.id}
                      onClick={() => {
                        if (locked) { router.push("/studio#studio-inquiry"); return }
                        if (enabled) setSelectedReport(report.id)
                      }}
                      disabled={!locked && !enabled}
                      title={locked ? "Upgrade to Pro to generate reports" : undefined}
                      className={`w-full rounded px-2 py-2 text-left transition-colors ${
                        isSelected
                          ? "bg-primary/10 text-primary"
                          : dimmed
                          ? "text-muted-foreground/35 hover:bg-muted/40"
                          : "text-foreground hover:bg-muted"
                      } ${locked ? "cursor-pointer" : !enabled ? "cursor-not-allowed" : ""}`}
                    >
                      <span className="block text-sm font-medium">{report.label}</span>
                      <span className={`block text-xs leading-snug mt-0.5 ${isSelected ? "text-primary/70" : dimmed ? "text-muted-foreground/35" : "text-muted-foreground"}`}>{report.description}</span>
                    </button></Tip>
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
              <Tip text="Files being processed - usually completes in 1-3 minutes">
                <span>
                  <ProcessingIndicator active={isProcessing} />
                </span>
              </Tip>
            </div>
            <LeftFolderItem
              name="Documents"
              isOpen={docsOpen}
              isSelected={selectedLeftFolder === "Documents"}
              onSelect={() => { setSelectedLeftFolder("Documents"); setDocumentVirtualView(null); setCurrentFolderId("root"); setBreadcrumb([{ id: "root", name: "Documents" }]); setClassificationView(null); setMobileNavOpen(false) }}
              onToggle={() => setDocsOpen(!docsOpen)}
              level={0}
            >
              <LeftFolderItem
                name="Unclassified"
                isSelected={selectedLeftFolder === "Unclassified"}
                onSelect={() => { setSelectedLeftFolder("Unclassified"); setDocumentVirtualView("unclassified"); setClassificationView(null); setCurrentFolderId("root"); setBreadcrumb([{ id: "root", name: "Documents" }]); setSelectedFiles(new Set()); setMobileNavOpen(false) }}
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
                    onSelect={() => { setSelectedLeftFolder(folder.name); setDocumentVirtualView(null); setClassificationView(null); openFolder(folder); setMobileNavOpen(false) }}
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
                onClick={() => { setSelectedLeftFolder("Manual Entries"); setDocumentVirtualView(null); setClassificationView("Manual Entries"); setMobileNavOpen(false) }}
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
                    onClick={() => { setSelectedLeftFolder(name); setDocumentVirtualView(null); setClassificationView(name); setMobileNavOpen(false) }}
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

      {/* Manual Entry Modal */}
      {manualEntryOpen && (
        <ManualEntryModal
          isOpen={manualEntryOpen}
          userId={session?.user?.id ?? ""}
          onClose={() => setManualEntryOpen(false)}
          onCreated={(file) => {
            upsertLoadedFiles([file as UploadedFile])
            setManualEntryOpen(false)
          }}
        />
      )}

      {/* Reclassify Modal */}
      {reclassifyTarget && (
        <ReclassifyModal
          isOpen={true}
          fileId={reclassifyTarget.fileId}
          filename={reclassifyTarget.filename}
          onClose={() => setReclassifyTarget(null)}
          onSaved={(fileId, newType) => {
            setFiles(prev => prev.map(f => f.id === fileId ? { ...f, document_type: newType } : f))
            setReclassifyTarget(null)
          }}
        />
      )}

      {reclassifySheetTarget && (
        <ReclassifySheetModal
          isOpen={true}
          fileId={reclassifySheetTarget.fileId}
          filename={reclassifySheetTarget.filename}
          onClose={() => setReclassifySheetTarget(null)}
          onSaved={() => {
            void loadFiles()
            void checkReportAvailability()
          }}
        />
      )}

      {/* Hover preview card */}
      {hoverPreview && (() => {
        const file = files.find(f => f.id === hoverPreview.fileId)
        if (!file) return null
        const isImage = file.file_type.startsWith("image/")
        const documentTypeLabel = fileDocumentTypeLabel(file)
        const viewportWidth = typeof window === "undefined" ? 0 : window.innerWidth
        const viewportHeight = typeof window === "undefined" ? 0 : window.innerHeight
        const hasViewport = viewportWidth > 0 && viewportHeight > 0
        const rightX = hoverPreview.x + HOVER_PREVIEW_CURSOR_GAP
        const leftX = hoverPreview.x - HOVER_PREVIEW_WIDTH - HOVER_PREVIEW_CURSOR_GAP
        const bottomY = hoverPreview.y + HOVER_PREVIEW_CURSOR_GAP
        const topY = hoverPreview.y - HOVER_PREVIEW_ESTIMATED_HEIGHT - HOVER_PREVIEW_CURSOR_GAP
        const px = hasViewport && rightX + HOVER_PREVIEW_WIDTH > viewportWidth - HOVER_PREVIEW_VIEWPORT_PAD
          ? leftX
          : rightX
        const py = hasViewport && bottomY + HOVER_PREVIEW_ESTIMATED_HEIGHT > viewportHeight - HOVER_PREVIEW_VIEWPORT_PAD
          ? topY
          : bottomY
        const left = hasViewport
          ? Math.max(HOVER_PREVIEW_VIEWPORT_PAD, Math.min(px, viewportWidth - HOVER_PREVIEW_WIDTH - HOVER_PREVIEW_VIEWPORT_PAD))
          : rightX
        const top = hasViewport
          ? Math.max(HOVER_PREVIEW_VIEWPORT_PAD, Math.min(py, viewportHeight - HOVER_PREVIEW_ESTIMATED_HEIGHT - HOVER_PREVIEW_VIEWPORT_PAD))
          : bottomY
        return (
          <div
            className="pointer-events-none fixed z-40 w-52 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
            style={{ left, top }}
          >
            {isImage && hoverPreview.url ? (
              <img
                src={hoverPreview.url}
                alt={file.filename}
                className="w-full object-cover"
                style={{ maxHeight: 160 }}
              />
            ) : (
              <div className="flex h-20 items-center justify-center bg-muted">
                <FileText className="h-10 w-10 text-primary/40" />
              </div>
            )}
            <div className="px-3 py-2 space-y-0.5">
              <p className="truncate text-xs font-medium text-foreground">{file.filename}</p>
              <p className={`text-[11px] capitalize ${documentTypeLabel.isFailed ? "text-destructive" : "text-muted-foreground"}`}>
                {documentTypeLabel.label}
              </p>
              <p className="text-[11px] text-muted-foreground/60">{formatBytes(file.file_size)}</p>
              <p className="mt-1 text-[10px] text-primary/60">Double-click to open</p>
            </div>
          </div>
        )
      })()}

    </div>
    </TooltipProvider>
  )
}
