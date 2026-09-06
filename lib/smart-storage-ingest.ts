import { randomUUID } from "node:crypto"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { type Entitlement } from "@/lib/entitlement"
import { isIngestComplete, isTerminalExtractionFailure, type IngestCompletionSnapshot } from "@/lib/ingest-completion"
import { PLAN_LIMITS, usageWindowForTier } from "@/supabase/functions/_shared/plan-limits"

export type IngestFile = { name: string; mimeType: string; data: string; source?: { provider: "google_drive"; fileId: string; url?: string; modifiedAt?: string } }
export type IngestOptions = {
  waitForNormalization?: boolean
  onFileCreated?: (fileId: string) => Promise<void>
}
const POLL_MS = 1000
const TIMEOUT_MS = 60_000
const MAX_FILE_BYTES = 15 * 1024 * 1024   // per-file cap for the synchronous MCP ingest path
const EMPTY_COUNTS = { record_count: 0, parent_count: 0, line_item_count: 0 }

function decode(file: IngestFile) {
  const match = file.data.match(/^data:[^;]+;base64,(.+)$/)
  return Buffer.from(match?.[1] ?? file.data, "base64")
}

async function runPrescan(userId: string, file: { id: string; filename: string }) {
  const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/prescan-document`
  const prescan = await fetch(edgeUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }, body: JSON.stringify({ file_id: file.id, user_id: userId }) })
  const payload = await prescan.json().catch(() => null) as { quarantined?: boolean; reason?: string; message?: string } | null
  if (!prescan.ok) throw new Error(`prescan-document failed: ${payload?.message ?? payload?.reason ?? prescan.statusText}`)
  if (payload?.quarantined) {
    return {
      file_id: file.id,
      filename: file.filename,
      status: "rejected",
      message: payload.message ?? "The file did not pass the Smart Storage safety scan.",
      reason: payload.reason ?? "prescan_rejected",
      ...EMPTY_COUNTS,
      records: [],
    }
  }
  return null
}

async function claimDocumentProcessing(userId: string, fileId: string, entitlement: Entitlement) {
  const window = usageWindowForTier(entitlement.tier, new Date(), entitlement.expiresAt)
  const limit = PLAN_LIMITS[entitlement.tier].documents
  const { data, error } = await supabaseAdmin.rpc("avint_claim_document_processing", {
    p_user_id: userId,
    p_file_id: fileId,
    p_period_start: window.start,
    p_period_end: window.end,
    p_limit: limit,
    p_soft_cap: PLAN_LIMITS[entitlement.tier].softCap,
  })
  if (error) throw new Error(error.message)
  return { claim: data, limit }
}

export async function resumeIngestFile(userId: string, fileId: string, entitlement: Entitlement) {
  const { data: file, error } = await supabaseAdmin
    .from("files")
    .select("id, user_id, filename, upload_status")
    .eq("id", fileId)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!file) throw new Error("The resumable upload no longer exists.")

  if (file.upload_status === "quarantined") {
    return { file_id: file.id, filename: file.filename, status: "rejected", ...EMPTY_COUNTS, records: [] }
  }
  if (file.upload_status === "done" || file.upload_status === "normalized") {
    return { file_id: file.id, filename: file.filename, status: "normalized", ...EMPTY_COUNTS, records: [] }
  }
  if (file.upload_status === "uploaded" || file.upload_status === "pending_scan") {
    const { claim, limit } = await claimDocumentProcessing(userId, file.id, entitlement)
    if (!claim?.[0]?.allowed) {
      return { file_id: file.id, filename: file.filename, status: "saved_at_cap", message: `You've hit your ${entitlement.tier} document limit (${limit}).`, ...EMPTY_COUNTS, records: [] }
    }
    const rejected = await runPrescan(userId, file)
    if (rejected) return rejected
  }
  return { file_id: file.id, filename: file.filename, status: "processing", ...EMPTY_COUNTS, records: [] }
}

export async function ingestFiles(userId: string, entitlement: Entitlement, files: IngestFile[], options: IngestOptions = {}) {
  const results: any[] = []
  for (const input of files) {
    const bytes = decode(input)
    if (bytes.length > MAX_FILE_BYTES) {
      results.push({ filename: input.name, status: "rejected", message: `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MB per-file limit.`, ...EMPTY_COUNTS, records: [] })
      continue
    }
    const storagePath = `${userId}/_inbox/${randomUUID()}-${input.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const { error: uploadError } = await supabaseAdmin.storage.from("documents").upload(storagePath, bytes, { contentType: input.mimeType, upsert: false })
    if (uploadError) throw new Error(uploadError.message)
    let file: { id: string; filename: string; storage_path: string } | null = null
    try {
      const { data: fileRecord, error: fileError } = await supabaseAdmin.from("files").insert({ user_id: userId, filename: input.name, storage_path: storagePath, file_type: input.mimeType, file_size: bytes.length, document_type: "unknown", upload_status: "pending_scan", source_provider: input.source?.provider ?? null, source_file_id: input.source?.fileId ?? null, source_url: input.source?.url ?? null, source_modified_at: input.source?.modifiedAt ?? null }).select("id, filename, storage_path").single()
      if (fileError || !fileRecord) throw new Error(fileError?.message ?? "Could not create file record")
      file = fileRecord
      const { error: jobError } = await supabaseAdmin.from("processing_jobs").insert({ file_id: file.id, status: "uploaded" })
      if (jobError) throw new Error(jobError.message)
      await options.onFileCreated?.(file.id)
    } catch (metadataError) {
      if (file) await supabaseAdmin.from("files").delete().eq("id", file.id)
      const { error: cleanupError } = await supabaseAdmin.storage.from("documents").remove([storagePath])
      if (cleanupError) console.error("MCP ingest inbox cleanup failed:", cleanupError)
      throw metadataError
    }
    if (!file) throw new Error("Could not create file record")
    const { claim, limit } = await claimDocumentProcessing(userId, file.id, entitlement)
    if (!claim?.[0]?.allowed) {
      results.push({ file_id: file.id, filename: file.filename, status: "saved_at_cap", message: `You've hit your ${entitlement.tier} document limit (${limit}). Upgrade at ${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.avintph.com/pricing"}; your records are saved.`, ...EMPTY_COUNTS, records: [] })
      continue
    }
    const rejected = await runPrescan(userId, file)
    if (rejected) { results.push(rejected); continue }
    if (options.waitForNormalization === false) {
      results.push({ file_id: file.id, filename: file.filename, status: "processing", ...EMPTY_COUNTS, fair_use_warning: Boolean(claim?.[0]?.fair_use_warning), records: [] })
      continue
    }
    const deadline = Date.now() + TIMEOUT_MS
    let records: any[] = []
    let counts = EMPTY_COUNTS
    let terminalFailure: string | null = null
    let normalizationComplete = false
    while (Date.now() < deadline) {
      const { data: extractionRows } = await supabaseAdmin
        .from("extractions")
        .select("id, status")
        .eq("file_id", file.id)
      const failedExtraction = (extractionRows ?? []).find((extraction) => isTerminalExtractionFailure(extraction.status))
      if (failedExtraction) {
        terminalFailure = `Extraction ended with status ${failedExtraction.status}.`
        break
      }

      const [{ data: recordRows, count: recordCount }, { count: parentCount }, { count: lineItemCount }, { data: fileState }] = await Promise.all([
        supabaseAdmin.from("records").select("*, record_attributes(*)", { count: "exact" }).eq("file_id", file.id),
        supabaseAdmin.from("records").select("id", { count: "exact", head: true }).eq("file_id", file.id).is("parent_record_id", null),
        supabaseAdmin.from("records").select("id", { count: "exact", head: true }).eq("file_id", file.id).not("parent_record_id", "is", null),
        supabaseAdmin.from("files").select("upload_status").eq("id", file.id).maybeSingle(),
      ])
      records = recordRows ?? []
      counts = { record_count: recordCount ?? 0, parent_count: parentCount ?? 0, line_item_count: lineItemCount ?? 0 }
      const currentSnapshot: IngestCompletionSnapshot = {
        uploadStatus: fileState?.upload_status ?? null,
        records: records.map((record) => ({ id: record.id, parent_record_id: record.parent_record_id, extraction_id: record.extraction_id })),
        extractionStatuses: (extractionRows ?? []).map((extraction) => extraction.status),
      }
      if (isIngestComplete(currentSnapshot)) {
        normalizationComplete = true
        break
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
    results.push({
      file_id: file.id,
      filename: file.filename,
      status: terminalFailure ? "failed" : normalizationComplete ? "normalized" : "processing",
      ...(terminalFailure ? { message: terminalFailure } : {}),
      ...counts,
      fair_use_warning: Boolean(claim?.[0]?.fair_use_warning),
      records: records.map(({ record_attributes, ...record }) => ({ ...record, fields: record_attributes ?? [] })),
    })
  }
  return results
}
