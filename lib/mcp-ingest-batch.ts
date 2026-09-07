import { logApiError } from "@/lib/api-error"
import { buildIngestBatchDescriptor, deriveIngestBatchStatus, type IngestBatchItemStatus } from "@/lib/ingest-batch-contract"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { ingestFiles, resumeIngestFile, type IngestFile } from "@/lib/smart-storage-ingest"
import type { Entitlement } from "@/lib/entitlement"

type ClaimedItem = {
  batch_id: string
  item_id: string
  item_index: number
  item_status: BatchItemStatus
  file_id: string | null
  lease_token: string | null
  claimed: boolean
}

type BatchItemStatus = IngestBatchItemStatus

type BatchItemResult = {
  item_id: string
  item_index: number
  filename: string
  file_id: string | null
  status: BatchItemStatus
  message?: string
  reason?: string
  existing_file?: { id: string; filename: string; created_at: string }
}

export class IngestBatchConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "IngestBatchConflictError"
  }
}

function resultStatus(status: unknown): BatchItemStatus {
  if (status === "normalized") return "normalized"
  if (status === "rejected") return "rejected"
  if (status === "saved_at_cap") return "saved_at_cap"
  if (status === "failed") return "failed"
  return "processing"
}

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/idempotency key/i.test(message)) return message
  if (/no longer exists/i.test(message)) return message
  return "This file could not be queued. Retry the same batch key to resume it."
}

async function updateClaimedItem(item: ClaimedItem, values: Record<string, unknown>) {
  if (!item.lease_token) throw new Error("Missing ingest item lease.")
  const { error } = await supabaseAdmin
    .from("ingest_batch_items")
    .update({ ...values, lease_expires_at: null })
    .eq("id", item.item_id)
    .eq("lease_token", item.lease_token)
  if (error) {
    if (/idempotency key/i.test(error.message)) throw new IngestBatchConflictError(error.message)
    throw new Error(error.message)
  }
}

async function processClaimedItem(userId: string, entitlement: Entitlement, input: IngestFile, item: ClaimedItem, options: { allowDuplicate?: boolean }): Promise<BatchItemResult> {
  try {
    const result = item.file_id
      ? await resumeIngestFile(userId, item.file_id, entitlement)
      : (await ingestFiles(userId, entitlement, [input], {
          waitForNormalization: false,
          allowDuplicate: options.allowDuplicate === true,
          onFileCreated: async (fileId) => {
            const { error } = await supabaseAdmin
              .from("ingest_batch_items")
              .update({ file_id: fileId, status: "processing" })
              .eq("id", item.item_id)
              .eq("lease_token", item.lease_token)
            if (error) throw new Error(error.message)
            item.file_id = fileId
          },
        }))[0]
    const status = resultStatus(result?.status)
    await updateClaimedItem(item, { status, file_id: result?.file_id ?? item.file_id, error_message: result?.message ?? null })
    return {
      item_id: item.item_id,
      item_index: item.item_index,
      filename: input.name,
      file_id: result?.file_id ?? item.file_id,
      status,
      ...(result?.message ? { message: result.message } : {}),
      ...(result?.reason ? { reason: result.reason } : {}),
      ...(result?.existing_file ? { existing_file: result.existing_file } : {}),
    }
  } catch (error) {
    logApiError(error, { route: "mcp", stage: "ingest_batch_item", userId, extra: { itemId: item.item_id } })
    const message = safeMessage(error)
    await updateClaimedItem(item, { status: "failed", file_id: item.file_id, error_message: message })
    return { item_id: item.item_id, item_index: item.item_index, filename: input.name, file_id: item.file_id, status: "failed", message }
  }
}

async function persistBatchStatus(batchId: string, status: "processing" | "completed" | "partial") {
  const { error } = await supabaseAdmin.from("ingest_batches").update({ status }).eq("id", batchId)
  if (error) throw new Error(error.message)
}

export async function ingestFileBatch(userId: string, entitlement: Entitlement, idempotencyKey: string, files: IngestFile[], options: { allowDuplicate?: boolean } = {}) {
  const descriptor = buildIngestBatchDescriptor(files, options.allowDuplicate === true)
  const { data, error } = await supabaseAdmin.rpc("avint_claim_ingest_batch", {
    p_user_id: userId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: descriptor.requestHash,
    p_items: descriptor.items,
  })
  if (error) throw new Error(error.message)
  const claimedItems = (data ?? []) as ClaimedItem[]
  if (claimedItems.length !== files.length) throw new Error("The ingest batch could not be claimed completely.")
  const batchId = claimedItems[0].batch_id

  const results = await Promise.all(claimedItems.map(async (item) => {
    const input = files[item.item_index]
    if (!input) throw new Error("The ingest batch item order is invalid.")
    if (item.claimed) return processClaimedItem(userId, entitlement, input, item, options)
    return {
      item_id: item.item_id,
      item_index: item.item_index,
      filename: input.name,
      file_id: item.file_id,
      status: item.item_status,
    }
  }))
  const status = deriveIngestBatchStatus(results)
  await persistBatchStatus(batchId, status)
  return { batch_id: batchId, idempotency_key: idempotencyKey, status, items: results }
}

export async function getIngestBatchStatus(userId: string, idempotencyKey: string) {
  const { data: batch, error } = await supabaseAdmin
    .from("ingest_batches")
    .select("id, idempotency_key, status, created_at, updated_at")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!batch) throw new Error("Ingest batch not found.")
  const { data: rows, error: itemsError } = await supabaseAdmin
    .from("ingest_batch_items")
    .select("id, item_index, filename, file_id, status, error_message, attempt_count, files(upload_status)")
    .eq("batch_id", batch.id)
    .eq("user_id", userId)
    .order("item_index")
  if (itemsError) throw new Error(itemsError.message)

  const stateChanges: Array<PromiseLike<unknown>> = []
  const items = (rows ?? []).map((row: any) => {
    const uploadStatus = Array.isArray(row.files) ? row.files[0]?.upload_status : row.files?.upload_status
    const status: BatchItemStatus = uploadStatus === "done" || uploadStatus === "normalized"
      ? "normalized"
      : uploadStatus === "quarantined"
        ? "rejected"
        : row.status
    if (status !== row.status) {
      stateChanges.push(supabaseAdmin.from("ingest_batch_items").update({ status, lease_expires_at: null }).eq("id", row.id).eq("user_id", userId))
    }
    return { item_id: row.id, item_index: row.item_index, filename: row.filename, file_id: row.file_id, status, attempt_count: row.attempt_count, message: row.error_message }
  })
  const persistedChanges: any[] = await Promise.all(stateChanges)
  const stateError = persistedChanges.find((result) => result.error)?.error
  if (stateError) throw new Error(stateError.message)
  const status = deriveIngestBatchStatus(items)
  if (status !== batch.status) await persistBatchStatus(batch.id, status)
  return { batch_id: batch.id, idempotency_key: batch.idempotency_key, status, created_at: batch.created_at, updated_at: batch.updated_at, items }
}
