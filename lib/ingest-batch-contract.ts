import { createHash } from "node:crypto"

import type { IngestFile } from "@/lib/smart-storage-ingest"

export type IngestBatchDescriptorItem = {
  item_index: number
  input_hash: string
  filename: string
  mime_type: string
  byte_size: number
}

export type IngestBatchItemStatus = "pending" | "uploading" | "processing" | "normalized" | "rejected" | "saved_at_cap" | "failed"

const TERMINAL_ITEM_STATUSES = new Set<IngestBatchItemStatus>(["normalized", "rejected", "saved_at_cap"])

export function deriveIngestBatchStatus(items: Array<{ status: IngestBatchItemStatus }>) {
  if (items.length > 0 && items.every((item) => TERMINAL_ITEM_STATUSES.has(item.status))) return "completed" as const
  if (items.some((item) => item.status === "failed")) return "partial" as const
  return "processing" as const
}

function decodeData(data: string) {
  const match = data.match(/^data:[^;]+;base64,(.+)$/)
  return Buffer.from(match?.[1] ?? data, "base64")
}

export function buildIngestBatchDescriptor(files: IngestFile[], allowDuplicate = false) {
  const items: IngestBatchDescriptorItem[] = files.map((file, item_index) => {
    const bytes = decodeData(file.data)
    const input_hash = createHash("sha256")
      .update(file.name)
      .update("\0")
      .update(file.mimeType)
      .update("\0")
      .update(JSON.stringify(file.source ?? null))
      .update("\0")
      .update(bytes)
      .digest("hex")
    return { item_index, input_hash, filename: file.name, mime_type: file.mimeType, byte_size: bytes.length }
  })
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ allowDuplicate, items: items.map(({ item_index, input_hash }) => ({ item_index, input_hash })) }))
    .digest("hex")
  return { requestHash, items }
}
