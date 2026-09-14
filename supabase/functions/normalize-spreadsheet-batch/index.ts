import { createClient, serve } from "../_shared/deps.ts"
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
  const failures: Array<{ source_key: string; cause: string }> = []
  try {
    const { data: datasets, error: datasetsError } = await supabase.from("datasets").select("id").eq("file_id", file_id)
    if (datasetsError) throw new Error(`dataset lookup failed: ${datasetsError.message}`)
    const datasetIds = (datasets ?? []).map((dataset) => dataset.id)
    if (datasetIds.length) {
      const { error: rowsError } = await supabase
        .from("dataset_rows")
        .update({ normalization_status: "normalized", normalization_version: 4, normalized_at: new Date().toISOString(), normalization_error: null })
        .in("dataset_id", datasetIds)
      if (rowsError) throw new Error(`dataset row normalization update failed: ${rowsError.message}`)
    }
    await settleNormalizationRow(supabase, file_id, rows[0]?.normalization_batch_id, rows.length)
  } catch (cause) {
    failures.push({ source_key: "batch", cause: cause instanceof Error ? cause.message : String(cause) })
  }
  return new Response(JSON.stringify({ file_id, processed: rows.length - failures.length, failed: failures.length, failures }), {
    headers: { "Content-Type": "application/json" },
    status: failures.length ? 207 : 200,
  })
})
