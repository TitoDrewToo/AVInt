import { randomUUID } from "node:crypto"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { type Entitlement } from "@/lib/entitlement"
import { PLAN_LIMITS, usageWindowForTier } from "@/supabase/functions/_shared/plan-limits"

export type IngestFile = { name: string; mimeType: string; data: string }
const POLL_MS = 1000
const TIMEOUT_MS = 60_000
const MAX_FILE_BYTES = 15 * 1024 * 1024   // per-file cap for the synchronous MCP ingest path

function decode(file: IngestFile) {
  const match = file.data.match(/^data:[^;]+;base64,(.+)$/)
  return Buffer.from(match?.[1] ?? file.data, "base64")
}

export async function ingestFiles(userId: string, entitlement: Entitlement, files: IngestFile[]) {
  const results: any[] = []
  const window = usageWindowForTier(entitlement.tier, new Date(), entitlement.expiresAt)
  const limit = PLAN_LIMITS[entitlement.tier].documents
  for (const input of files) {
    const bytes = decode(input)
    if (bytes.length > MAX_FILE_BYTES) {
      results.push({ filename: input.name, status: "rejected", message: `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MB per-file limit.` })
      continue
    }
    const storagePath = `${userId}/_inbox/${randomUUID()}-${input.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`
    const { error: uploadError } = await supabaseAdmin.storage.from("documents").upload(storagePath, bytes, { contentType: input.mimeType, upsert: false })
    if (uploadError) throw new Error(uploadError.message)
    const { data: file, error: fileError } = await supabaseAdmin.from("files").insert({ user_id: userId, filename: input.name, storage_path: storagePath, file_type: input.mimeType, file_size: bytes.length, document_type: "unknown", upload_status: "pending_scan" }).select("id, filename, storage_path").single()
    if (fileError || !file) throw new Error(fileError?.message ?? "Could not create file record")
    const { error: jobError } = await supabaseAdmin.from("processing_jobs").insert({ file_id: file.id, status: "uploaded" })
    if (jobError) throw new Error(jobError.message)
    const { data: claim, error: claimError } = await supabaseAdmin.rpc("avint_claim_document_processing", { p_user_id: userId, p_file_id: file.id, p_period_start: window.start, p_period_end: window.end, p_limit: limit, p_soft_cap: PLAN_LIMITS[entitlement.tier].softCap })
    if (claimError) throw new Error(claimError.message)
    if (!claim?.[0]?.allowed) {
      results.push({ file_id: file.id, filename: file.filename, status: "saved_at_cap", message: `You've hit your ${entitlement.tier} document limit (${limit}). Upgrade at ${process.env.NEXT_PUBLIC_APP_URL ?? "https://www.avintph.com/pricing"}; your records are saved.` })
      continue
    }
    const edgeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/prescan-document`
    const prescan = await fetch(edgeUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }, body: JSON.stringify({ file_id: file.id, user_id: userId }) })
    if (!prescan.ok) throw new Error(`prescan-document failed: ${await prescan.text()}`)
    const deadline = Date.now() + TIMEOUT_MS
    let fields: any[] = []
    while (Date.now() < deadline) {
      const { data } = await supabaseAdmin.from("document_fields").select("*").eq("file_id", file.id).neq("normalization_status", "excluded")
      fields = data ?? []
      if (fields.length > 0 && fields.every((field) => ["normalized", "manual"].includes(field.normalization_status))) break
      await new Promise((resolve) => setTimeout(resolve, POLL_MS))
    }
    results.push({ file_id: file.id, filename: file.filename, status: fields.length ? "normalized" : "processing", fair_use_warning: Boolean(claim?.[0]?.fair_use_warning), records: fields })
  }
  return results
}
