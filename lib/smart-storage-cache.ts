import { supabase } from "@/lib/supabase"
import {
  PROCESSING_ACTIVITY_WINDOW_MS,
  isStalledUpload,
  REPORTS,
  type SmartStorageAttentionState,
  type UploadedFile,
  type VirtualFolder,
} from "@/lib/smart-storage"

export const SMART_STORAGE_PAGE_SIZE = 100
const SMART_STORAGE_CACHE_TTL_MS = 5 * 60 * 1000

type ProcessingJobSummary = NonNullable<UploadedFile["processing_job"]>

export type SmartStorageFilesPage = {
  files: UploadedFile[]
  hasMoreFiles: boolean
}

export type SmartStorageProcessingState = {
  isProcessing: boolean
  activeJobs: Array<{ fileId: string; filename: string; status: string | null; created_at: string | null }>
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
  const recordCountByFileId = new Map<string, number>()
  const normalizedFileIds = new Set<string>()
  const extractionFileIds = new Set<string>()

  if (fileIds.length > 0) {
    const [{ data: jobs }, { data: records }, { data: extractions }] = await Promise.all([
      supabase
        .from("processing_jobs")
        .select("file_id, status, created_at, error_message")
        .in("file_id", fileIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("records")
        .select("file_id")
        .in("file_id", fileIds)
        .is("excluded_at", null),
      supabase.from("extractions").select("file_id").in("file_id", fileIds),
    ])
    for (const extraction of extractions ?? []) extractionFileIds.add(extraction.file_id)

    for (const job of jobs ?? []) {
      if (!latestJobByFileId.has(job.file_id)) {
        latestJobByFileId.set(job.file_id, {
          status: job.status,
          created_at: job.created_at,
          error_message: job.error_message,
        })
      }
    }
    for (const record of records ?? []) {
      recordCountByFileId.set(record.file_id, (recordCountByFileId.get(record.file_id) ?? 0) + 1)
      normalizedFileIds.add(record.file_id)
    }
  }

  return files.map((file) => {
    const job = latestJobByFileId.get(file.id) ?? null
    const fieldsCount = recordCountByFileId.get(file.id) ?? 0
    const isQuarantined = file.upload_status === "quarantined"
    const ageMs = job?.created_at ? Date.now() - Date.parse(job.created_at) : 0
    const isActive = ["uploaded", "pending_scan", "scanning", "processing"].includes(job?.status ?? "")
      || ["uploaded", "pending_scan", "scanning", "approved", "processing"].includes(file.upload_status ?? "")
    const isSlow = ageMs > PROCESSING_ACTIVITY_WINDOW_MS && isActive
    const stalled = isStalledUpload({
      uploadStatus: file.upload_status,
      jobStatus: job?.status,
      createdAt: job?.created_at ?? file.created_at,
      hasExtraction: extractionFileIds.has(file.id),
    })
    let attentionState: SmartStorageAttentionState = null
    if (!isQuarantined) {
      if (job?.status === "failed" && fieldsCount > 0) attentionState = "normalization_failed"
      else if (stalled || (job?.status === "failed" && fieldsCount === 0)) attentionState = "extraction_failed"
      else if (isSlow) attentionState = "processing_slow"
      else if (!isActive && (!file.document_type || file.document_type === "unknown")) attentionState = "classification_required"
    }

    let pipelineStage: UploadedFile["pipeline_stage"] = "unknown"
    if (isQuarantined) pipelineStage = "quarantined"
    else if (attentionState) pipelineStage = "attention"
    else if (normalizedFileIds.has(file.id)) pipelineStage = "ready"
    else if (["pending_scan", "scanning"].includes(file.upload_status ?? "") || job?.status === "scanning") pipelineStage = "scanning"
    else if (["uploaded", "processing"].includes(file.upload_status ?? "") || job?.status === "processing") pipelineStage = "extracting"
    else if (file.upload_status === "normalized") pipelineStage = "ready"

    return {
      ...file,
      document_fields_count: fieldsCount,
      processing_job: stalled ? { ...(job ?? { created_at: file.created_at }), status: "failed" } : job,
      upload_status: stalled ? "failed" : file.upload_status,
      stalled_from_status: stalled ? (file.upload_status ?? job?.status ?? null) : null,
      attention_state: attentionState,
      normalization_status: normalizedFileIds.has(file.id) ? "normalized" : null,
      normalization_error: null,
      pipeline_stage: pipelineStage,
    }
  })
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
    .select("file_id, status, created_at, files!inner(user_id, filename)")
    .eq("files.user_id", userId)
    .in("status", ["uploaded", "pending_scan", "scanning", "processing"])
    .gte("created_at", activeCutoff)
    .limit(100)
  if (error) throw new Error(error.message)
  return {
    isProcessing: (data?.length ?? 0) > 0,
    activeJobs: (data ?? []).map((job: any) => ({
      fileId: job.file_id,
      filename: Array.isArray(job.files) ? job.files[0]?.filename ?? "Unnamed file" : job.files?.filename ?? "Unnamed file",
      status: job.status,
      created_at: job.created_at,
    })),
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

  const { data: records, error: recordsError } = await supabase
    .from("records")
    .select("id, file_id, document_type, amount, category, files!inner(document_type, user_id)")
    .eq("user_id", userId)
    .is("parent_record_id", null)
    .is("excluded_at", null)
  if (recordsError) throw new Error(recordsError.message)
  const recordRows = records ?? []
  const { data: attributes, error: attributesError } = recordRows.length === 0
    ? { data: [], error: null }
    : await supabase
      .from("record_attributes")
      .select("record_id, field_key, value")
      .in("record_id", recordRows.map((row) => row.id))
      .in("field_key", ["vendor_name", "employer_name", "counterparty_name"])
  if (attributesError) throw new Error(attributesError.message)
  const attributesByRecord = new Map<string, Map<string, unknown>>()
  for (const attribute of attributes ?? []) {
    const fields = attributesByRecord.get(attribute.record_id) ?? new Map<string, unknown>()
    fields.set(attribute.field_key, attribute.value)
    attributesByRecord.set(attribute.record_id, fields)
  }
  const documentTypeFor = (row: any) => row.document_type ?? (Array.isArray(row.files) ? row.files[0]?.document_type : row.files?.document_type) ?? ""
  const isExpense = (row: any) => ["receipt", "invoice"].includes(documentTypeFor(row))
  const isIncome = (row: any) => ["payslip", "income_statement"].includes(documentTypeFor(row))
  const isContract = (row: any) => ["contract", "agreement"].includes(documentTypeFor(row))
  const hasExpense = recordRows.some((row) => isExpense(row) && row.amount != null)
  const hasIncome = recordRows.some((row) => isIncome(row) && row.amount != null)

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
      case "contract_fields":    availability[report.id] = recordRows.some((row) => { const fields = attributesByRecord.get(row.id); return isContract(row) && Boolean(fields?.get("vendor_name") || fields?.get("employer_name") || fields?.get("counterparty_name")) }); break
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
