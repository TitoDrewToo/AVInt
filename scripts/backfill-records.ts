import { createClient } from "@supabase/supabase-js"
import { deriveRecords } from "../supabase/functions/_shared/derive-records"
import { persistDerived } from "../supabase/functions/_shared/persist-derived"

const PAGE_SIZE = 100
const dryRun = process.argv.includes("--dry-run")
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

function payloadFor(extraction: Record<string, unknown>): unknown {
  const payload = extraction.payload
  if (typeof payload === "string") {
    try { return JSON.parse(payload) } catch { return null }
  }
  return payload
}

async function fetchExtractions() {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("extractions")
      .select("*")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(`extractions query failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

async function fetchFiles(fileIds: string[]) {
  const files = new Map<string, { id: string; user_id: string; document_type: string | null }>()
  for (let from = 0; from < fileIds.length; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("files")
      .select("id, user_id, document_type")
      .in("id", fileIds.slice(from, from + PAGE_SIZE))
    if (error) throw new Error(`files query failed: ${error.message}`)
    for (const file of data ?? []) files.set(file.id, file)
  }
  return files
}

async function main() {
  const extractions = await fetchExtractions()
  const fileIds = [...new Set(extractions.map((row) => String(row.file_id)).filter(Boolean))]
  const files = await fetchFiles(fileIds)
  let parents = 0
  let children = 0
  let attributes = 0
  let needsReview = 0
  let processed = 0
  let skipped = 0

  for (const extraction of extractions) {
    const file = files.get(String(extraction.file_id))
    if (!file) { skipped += 1; continue }
    const derived = deriveRecords(payloadFor(extraction), file)
    const parentCount = derived.records.filter((record) => !record.parent_source_key).length
    const childCount = derived.records.length - parentCount
    parents += parentCount
    children += childCount
    attributes += derived.attributes.length
    needsReview += derived.records.filter((record) => record.needs_review).length
    processed += 1

    if (!dryRun) {
      await persistDerived(supabase, String(extraction.id), derived)
    }
  }

  console.log(JSON.stringify({
    dry_run: dryRun,
    extractions_processed: processed,
    parents,
    children,
    records: parents + children,
    attributes,
    needs_review: needsReview,
    skipped,
  }, null, 2))
}

main().then(
  () => process.exit(0),
  (error) => { console.error(error); process.exit(1) },
)
