import { createClient } from "@supabase/supabase-js"
import { deriveRecords } from "../supabase/functions/_shared/derive-records"

const PAGE_SIZE = 100
const apply = process.argv.includes("--apply")
const sanitize = process.argv.includes("--sanitize")
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })

type RecordRow = { id: string; file_id: string; source_key: string; source_column_map: Record<string, string> | null; parent_record_id: string | null }
type FileRow = { id: string; user_id: string; document_type: string | null; source_rows_json: unknown }
type ExtractionRow = { id: string; file_id: string; payload: unknown; attempt_number: number | null }

function parsePayload(payload: unknown): unknown {
  if (typeof payload !== "string") return payload
  try { return JSON.parse(payload) } catch { return null }
}

function rowsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") {
    const value = payload as Record<string, unknown>
    if (Array.isArray(value.rows)) return value.rows
    if (Array.isArray(value.records)) return value.records
  }
  return [payload]
}

function hasMap(value: unknown): value is Record<string, string> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length)
}

function sanitizeMap(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter(([key, column]) => !(key === "currency" && /unit|price|cost|amount|total/i.test(column))))
}

function inferSourceMap(cells: Record<string, unknown>): Record<string, string> {
  const map: Record<string, string> = {}
  for (const header of Object.keys(cells)) {
    const lower = header.toLowerCase()
    if (/order[_ ]?date|document[_ ]?date|received[_ ]?on|(^|_)date($|_)/.test(lower) && !/due|period/.test(lower)) map.occurred_on = header
    else if (/(^|_)total($|_)|total[_ ]?(amount|price|cost)|amount($|_)|gross[_ ]?income/.test(lower) && !/unit|tax|discount|net/.test(lower)) map.amount = header
    else if (/currency|(^|_)(usd|php|eur|gbp|sgd|jpy)($|_)/.test(lower)) map.currency = header
    else if (/vendor|supplier|merchant|payee|customer|client|counterparty/.test(lower)) map.counterparty = header
    else if (/category|expense[_ ]?type|gl[_ ]?code/.test(lower)) map.category = header
    else if (/direction|debit[_ ]?credit|credit[_ ]?debit|transaction[_ ]?type/.test(lower)) map.direction = header
  }
  return map
}

async function fetchAll<T>(table: string, select: string, configure: (query: any) => any): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    let data: T[] | null = null
    let error: { message: string } | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const result = await configure(supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1))
        data = (result.data ?? null) as T[] | null
        error = result.error
      } catch (cause) {
        error = { message: cause instanceof Error ? cause.message : String(cause) }
      }
      if (!error) break
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
    if (error) throw new Error(`${table} query failed: ${error.message}`)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

async function main() {
  const records = await fetchAll<RecordRow>("records", "id, file_id, source_key, source_column_map, parent_record_id", (query) => query.is("parent_record_id", null))
  const targets = records.filter((record) => !hasMap(record.source_column_map) || sanitize)
  const fileIds = [...new Set(targets.map((record) => record.file_id))]
  if (!fileIds.length) {
    console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", records_scanned: records.length, records_needing_map: 0, maps_found: 0, unresolved: 0, written: 0 }, null, 2))
    return
  }
  const files = await fetchAll<FileRow>("files", "id, user_id, document_type, source_rows_json", (query) => query.in("id", fileIds))
  const filesById = new Map(files.map((file) => [file.id, file]))
  const extractions = await fetchAll<ExtractionRow>("extractions", "id, file_id, payload, attempt_number", (query) => query.in("file_id", fileIds).eq("status", "succeeded").order("attempt_number", { ascending: false }))

  const mapsBySource = new Map<string, Record<string, string>>()
  for (const extraction of extractions) {
    const fileId = extraction.file_id
    const file = filesById.get(fileId)
    if (!file) continue
    const payload = parsePayload(extraction.payload)
    const sourceIndex = payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)._source_index
      : undefined
    const sourceKey = sourceIndex !== undefined && sourceIndex !== null
      ? String(sourceIndex)
      : Number(extraction.attempt_number) >= 2 ? String(Number(extraction.attempt_number) - 2) : "root"
    const derived = deriveRecords(payload, file, { sourceKey })
    for (const record of derived.records) {
      if (!record.parent_source_key && hasMap(record.source_column_map)) mapsBySource.set(`${fileId}:${record.source_key}`, record.source_column_map)
    }
  }

  // Older spreadsheet ingests retain lossless source_rows_json on files even
  // when their extraction payload predates _field_evidence. Reconstruct only
  // the physical column links from headers; never rewrite record values.
  for (const file of files) {
    const sourceRows = Array.isArray(file.source_rows_json) ? file.source_rows_json : []
    for (const sourceRow of sourceRows) {
      if (!sourceRow || typeof sourceRow !== "object") continue
      const row = sourceRow as Record<string, unknown>
      const cells = row.cells
      if (!cells || typeof cells !== "object" || Array.isArray(cells)) continue
      const rowIndex = Number(row.row_index)
      if (!Number.isInteger(rowIndex)) continue
      const map = inferSourceMap(cells as Record<string, unknown>)
      if (Object.keys(map).length) mapsBySource.set(`${file.id}:${rowIndex - 2}`, map)
    }
  }

  let updated = 0
  let unresolved = 0
  for (const record of targets) {
    const existingMap = hasMap(record.source_column_map) ? sanitizeMap(record.source_column_map) : null
    const map = existingMap && Object.keys(existingMap).length
      ? existingMap
      : mapsBySource.get(`${record.file_id}:${record.source_key}`)
    if (!map) { unresolved += 1; continue }
    if (sanitize && existingMap && JSON.stringify(existingMap) === JSON.stringify(record.source_column_map)) continue
    updated += 1
    if (apply) {
      const { error } = await supabase.from("records").update({ source_column_map: map }).eq("id", record.id)
      if (error) throw new Error(`record ${record.id} update failed: ${error.message}`)
    }
  }

  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", records_scanned: records.length, records_needing_map: targets.length, maps_found: updated, unresolved, written: apply ? updated : 0 }, null, 2))
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1 })
