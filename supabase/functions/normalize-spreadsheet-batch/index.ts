import { createClient, serve } from "../_shared/deps.ts"
import { spreadsheetFacts } from "../_shared/spreadsheet-facts.ts"
import { buildExtractionPayload } from "../_shared/extraction-payload.ts"
import { deriveRecords } from "../_shared/derive-records.ts"
import { persistDerived } from "../_shared/persist-derived.ts"
import { writeExtraction } from "../_shared/write-extraction.ts"
import { settleNormalizationRow } from "../_shared/normalization-batch.ts"

const URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

serve(async (req) => {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
  if (token !== SERVICE_KEY) return new Response(JSON.stringify({ error: "Service role required" }), { status: 401 })
  let body: any
  try { body = await req.json() } catch { return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 }) }
  const { file_id, rows } = body ?? {}
  if (typeof file_id !== "string" || !Array.isArray(rows) || rows.length === 0) {
    return new Response(JSON.stringify({ error: "file_id and a non-empty rows array are required" }), { status: 400 })
  }
  const supabase = createClient(URL, SERVICE_KEY)
  const { data: file, error: fileError } = await supabase.from("files").select("user_id, document_type").eq("id", file_id).single()
  if (fileError || !file) return new Response(JSON.stringify({ error: "File not found" }), { status: 404 })
  const failures: Array<{ source_key: string; cause: string }> = []
  for (const row of rows) {
    try {
      const facts = spreadsheetFacts(row) ?? {}
      const normalizedRow = {
        ...row,
        ...facts,
        normalization_status: "normalized",
        normalization_version: 4,
        normalized_at: new Date().toISOString(),
        normalization_error: null,
        normalization_attempts: 0,
      }
      const payload = buildExtractionPayload(normalizedRow, file.document_type ?? "csv_export")
      const extraction = await writeExtraction(supabase, {
        userId: file.user_id,
        fileId: file_id,
        documentType: file.document_type ?? "csv_export",
        provider: "deterministic",
        model: "spreadsheet-source-preservation-v1",
        payload,
        sourceRowCount: 1,
        attemptNumber: 1,
      })
      const derived = deriveRecords(payload, { id: file_id, user_id: file.user_id }, { sourceKey: row.source_key })
      if (derived.reason) throw new Error(`record derivation failed: ${derived.reason}`)
      await persistDerived(supabase, extraction, derived)
      await settleNormalizationRow(supabase, file_id, row.normalization_batch_id)
    } catch (cause) {
      failures.push({ source_key: String(row.source_key ?? "unknown"), cause: cause instanceof Error ? cause.message : String(cause) })
    }
  }
  return new Response(JSON.stringify({ file_id, processed: rows.length - failures.length, failed: failures.length, failures }), {
    headers: { "Content-Type": "application/json" },
    status: failures.length ? 207 : 200,
  })
})
