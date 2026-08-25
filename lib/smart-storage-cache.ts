import { supabase } from "@/lib/supabase"
import { PROCESSING_ACTIVITY_WINDOW_MS, REPORTS, type UploadedFile, type VirtualFolder } from "@/lib/smart-storage"

export const SMART_STORAGE_PAGE_SIZE = 100
const SMART_STORAGE_CACHE_TTL_MS = 5 * 60 * 1000

type ProcessingJobSummary = NonNullable<UploadedFile["processing_job"]>

export type SmartStorageFilesPage = {
  files: UploadedFile[]
  hasMoreFiles: boolean
}

export type SmartStorageProcessingState = {
  isProcessing: boolean
  activeJobs: Array<{ status: string | null; created_at: string | null }>
}

export type SmartStorageWarmData = SmartStorageFilesPage & {
  folders: VirtualFolder[]
  isProcessing: boolean
  activeJobs: SmartStorageProcessingState["activeJobs"]
  reportAvailability: Record<string, boolean>
}

export type SmartStorageLaunchData = Omit<SmartStorageWarmData, "reportAvailability">

const cache = new Map<string, { expiresAt: number; fetchedAt: number; data: SmartStorageWarmData }>()
const launchCache = new Map<string, { expiresAt: number; fetchedAt: number; data: SmartStorageLaunchData }>()
const inFlight = new Map<string, Promise<SmartStorageWarmData>>()
const launchInFlight = new Map<string, Promise<SmartStorageLaunchData>>()

function cacheKey(userId: string) {
  return `smart-storage:${userId}`
}

export function getCachedSmartStorageData(userId: string): SmartStorageWarmData | null {
  const cached = cache.get(cacheKey(userId))
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    cache.delete(cacheKey(userId))
    return null
  }
  return cached.data
}

export function getCachedSmartStorageLaunchData(userId: string): SmartStorageLaunchData | null {
  const cached = launchCache.get(cacheKey(userId))
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    launchCache.delete(cacheKey(userId))
    return null
  }
  return cached.data
}

export function getSmartStorageCacheAgeMs(userId: string): number | null {
  const cached = cache.get(cacheKey(userId))
  if (!cached) return null
  return Date.now() - cached.fetchedAt
}

export function invalidateSmartStorageCache(userId: string) {
  const key = cacheKey(userId)
  cache.delete(key)
  launchCache.delete(key)
}

export function setCachedSmartStorageLaunchData(
  userId: string,
  data: SmartStorageLaunchData,
  options?: { preserveFetchedAt?: boolean },
) {
  const key = cacheKey(userId)
  const previous = launchCache.get(key)
  launchCache.set(key, {
    data,
    fetchedAt: options?.preserveFetchedAt && previous ? previous.fetchedAt : Date.now(),
    expiresAt: Date.now() + SMART_STORAGE_CACHE_TTL_MS,
  })
}

export function setCachedSmartStorageData(
  userId: string,
  data: SmartStorageWarmData,
  options?: { preserveFetchedAt?: boolean },
) {
  const key = cacheKey(userId)
  const previous = cache.get(key)
  cache.set(key, {
    data,
    fetchedAt: options?.preserveFetchedAt && previous ? previous.fetchedAt : Date.now(),
    expiresAt: Date.now() + SMART_STORAGE_CACHE_TTL_MS,
  })
  setCachedSmartStorageLaunchData(userId, data, options)
}

async function enrichFiles(files: any[]): Promise<UploadedFile[]> {
  const fileIds = files.map((file) => file.id)
  const latestJobByFileId = new Map<string, ProcessingJobSummary>()
  const documentFieldCountByFileId = new Map<string, number>()

  if (fileIds.length > 0) {
    const [{ data: jobs }, { data: documentFields }] = await Promise.all([
      supabase
        .from("processing_jobs")
        .select("file_id, status, created_at, error_message")
        .in("file_id", fileIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("document_fields")
        .select("file_id")
        .in("file_id", fileIds),
    ])

    for (const job of jobs ?? []) {
      if (!latestJobByFileId.has(job.file_id)) {
        latestJobByFileId.set(job.file_id, {
          status: job.status,
          created_at: job.created_at,
          error_message: job.error_message,
        })
      }
    }
    for (const field of documentFields ?? []) {
      documentFieldCountByFileId.set(field.file_id, (documentFieldCountByFileId.get(field.file_id) ?? 0) + 1)
    }
  }

  return files.map((file) => ({
    ...file,
    document_fields_count: documentFieldCountByFileId.get(file.id) ?? 0,
    processing_job: latestJobByFileId.get(file.id) ?? null,
  }))
}

export async function fetchSmartStorageFilesPage(userId: string, offset = 0, limit = SMART_STORAGE_PAGE_SIZE): Promise<SmartStorageFilesPage> {
  const { data, error } = await supabase
    .from("files")
    .select("id, filename, file_type, file_size, document_type, created_at, storage_path, folder_id, upload_status, scan_reason, analysis_json, analyzed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw new Error(error.message)

  return {
    files: await enrichFiles(data ?? []),
    hasMoreFiles: (data?.length ?? 0) === limit,
  }
}

export async function fetchSmartStorageFilesByIds(userId: string, fileIds: string[]): Promise<UploadedFile[]> {
  if (fileIds.length === 0) return []
  const { data, error } = await supabase
    .from("files")
    .select("id, filename, file_type, file_size, document_type, created_at, storage_path, folder_id, upload_status, scan_reason, analysis_json, analyzed_at")
    .eq("user_id", userId)
    .in("id", fileIds)
    .order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return enrichFiles(data ?? [])
}

export async function fetchSmartStorageFolders(userId: string): Promise<VirtualFolder[]> {
  const { data, error } = await supabase
    .from("folders")
    .select("id, name, parent_id, user_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((folder) => ({
    id: folder.id,
    name: folder.name,
    parentId: folder.parent_id,
  }))
}

export async function fetchSmartStorageProcessingState(userId: string): Promise<SmartStorageProcessingState> {
  const activeCutoff = new Date(Date.now() - PROCESSING_ACTIVITY_WINDOW_MS).toISOString()
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("status, created_at, files!inner(user_id)")
    .eq("files.user_id", userId)
    .in("status", ["uploaded", "pending_scan", "scanning", "processing"])
    .gte("created_at", activeCutoff)
    .limit(100)
  if (error) throw new Error(error.message)
  return {
    isProcessing: (data?.length ?? 0) > 0,
    activeJobs: (data ?? []).map((job) => ({ status: job.status, created_at: job.created_at })),
  }
}

export async function fetchSmartStorageReportAvailability(userId: string): Promise<Record<string, boolean>> {
  const { count: fileCount, error: filesError } = await supabase
    .from("files")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
  if (filesError) throw new Error(filesError.message)

  const availability: Record<string, boolean> = {}
  if (!fileCount) {
    REPORTS.forEach((report) => { availability[report.id] = false })
    return availability
  }

  const { data: fields, error: fieldsError } = await supabase
    .from("document_fields")
    .select("file_id, total_amount, gross_income, net_income, vendor_name, employer_name, counterparty_name, files!inner(document_type, user_id)")
    .eq("files.user_id", userId)
    .neq("normalization_status", "excluded")
  if (fieldsError) throw new Error(fieldsError.message)

  const rows = fields ?? []
  const documentTypeFor = (row: any) => {
    const file = Array.isArray(row.files) ? row.files[0] : row.files
    return file?.document_type ?? ""
  }
  const isExpense = (row: any) => ["receipt", "invoice"].includes(documentTypeFor(row))
  const isIncome = (row: any) => ["payslip", "income_statement"].includes(documentTypeFor(row))
  const isContract = (row: any) => ["contract", "agreement"].includes(documentTypeFor(row))
  const hasExpense = rows.some((row) => isExpense(row) && row.total_amount != null)
  const hasIncome = rows.some((row) => isIncome(row) && (row.gross_income != null || row.net_income != null || row.total_amount != null))

  for (const report of REPORTS) {
    if (!report.coreEnabled) {
      availability[report.id] = false
      continue
    }
    switch (report.requires) {
      case "any_file":           availability[report.id] = fileCount > 0; break
      case "expense_amount":     availability[report.id] = hasExpense; break
      case "income_amount":      availability[report.id] = hasIncome; break
      case "expense_or_income":  availability[report.id] = hasExpense || hasIncome; break
      case "income_and_expense": availability[report.id] = hasIncome && hasExpense; break
      case "contract_fields":    availability[report.id] = rows.some((row) => isContract(row) && (row.vendor_name || row.employer_name || row.counterparty_name)); break
    }
  }

  return availability
}

export async function fetchSmartStorageLaunchData(userId: string): Promise<SmartStorageLaunchData> {
  const [filesPage, folders, processing] = await Promise.all([
    fetchSmartStorageFilesPage(userId),
    fetchSmartStorageFolders(userId),
    fetchSmartStorageProcessingState(userId),
  ])

  return {
    ...filesPage,
    folders,
    isProcessing: processing.isProcessing,
    activeJobs: processing.activeJobs,
  }
}

export async function refreshSmartStorageLaunchData(userId: string): Promise<SmartStorageLaunchData> {
  const key = cacheKey(userId)
  const existing = launchInFlight.get(key)
  if (existing) return existing

  const request = fetchSmartStorageLaunchData(userId).then((data) => {
    setCachedSmartStorageLaunchData(userId, data)
    return data
  }).finally(() => {
    launchInFlight.delete(key)
  })

  launchInFlight.set(key, request)
  return request
}

export async function refreshSmartStorageData(userId: string): Promise<SmartStorageWarmData> {
  const key = cacheKey(userId)
  const existing = inFlight.get(key)
  if (existing) return existing

  const request = Promise.all([
    refreshSmartStorageLaunchData(userId),
    fetchSmartStorageReportAvailability(userId),
  ]).then(([launchData, reportAvailability]) => {
    const data: SmartStorageWarmData = {
      ...launchData,
      reportAvailability,
    }
    setCachedSmartStorageData(userId, data)
    return data
  }).finally(() => {
    inFlight.delete(key)
  })

  inFlight.set(key, request)
  return request
}

export async function prefetchSmartStorageData(userId: string): Promise<SmartStorageWarmData> {
  const cached = getCachedSmartStorageData(userId)
  if (cached) return cached
  return refreshSmartStorageData(userId)
}

export async function prefetchSmartStorageLaunchData(userId: string): Promise<SmartStorageLaunchData> {
  const cached = getCachedSmartStorageLaunchData(userId)
  if (cached) return cached
  return refreshSmartStorageLaunchData(userId)
}
