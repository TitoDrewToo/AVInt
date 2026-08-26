import { createClient } from "@supabase/supabase-js"
import { syncVirtualRecord } from "../supabase/functions/_shared/virtual-records"

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

  const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const batchSize = 100
  const { data: rows, error: rowsError } = await supabase
    .from("document_fields")
    .select("*")
    .neq("normalization_status", "excluded")
    .order("created_at", { ascending: true })
  if (rowsError) throw new Error(`document_fields query failed: ${rowsError.message}`)

  const fileIds = [...new Set((rows ?? []).map((row) => row.file_id))]
  const fileById = new Map<string, any>()
  for (let index = 0; index < fileIds.length; index += batchSize) {
    const { data: files, error } = await supabase.from("files").select("id, user_id, document_type").in("id", fileIds.slice(index, index + batchSize))
    if (error) throw new Error(`files query failed: ${error.message}`)
    for (const file of files ?? []) fileById.set(file.id, file)
  }

  let synced = 0
  let skipped = 0
  for (const row of rows ?? []) {
    const file = fileById.get(row.file_id)
    if (!file) { skipped += 1; continue }
    await syncVirtualRecord(supabase, row, file)
    synced += 1
    if (synced % batchSize === 0) console.log(`Synced ${synced}/${rows?.length ?? 0}`)
  }
  console.log(JSON.stringify({ scanned: rows?.length ?? 0, synced, skipped }, null, 2))
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  },
)
