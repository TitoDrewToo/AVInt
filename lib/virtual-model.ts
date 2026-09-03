import { supabaseAdmin } from "@/lib/mcp-auth"

const MAX_ROWS = 40

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&")
}

export type VirtualModelQuery = {
  search?: string
  // records.status is a lifecycle state, not the former normalization_status enum.
  status?: "derived" | "reviewed" | "superseded"
  documentType?: string
  fieldKey?: string
  customOnly?: boolean
}

type RecordAttribute = {
  id: string
  record_id: string
  field_key: string
  value: unknown
  value_type: string
  confidence: number | null
  is_custom: boolean
  source_evidence: Record<string, unknown>
}

export async function readVirtualModel(userId: string, query: VirtualModelQuery = {}) {
  let filesQuery = supabaseAdmin.from("files").select("id, filename, document_type, upload_status").eq("user_id", userId)
  if (query.documentType) filesQuery = filesQuery.eq("document_type", query.documentType)
  if (query.search?.trim()) filesQuery = filesQuery.ilike("filename", `%${query.search.trim()}%`)
  const { data: files, error: filesError } = await filesQuery
  if (filesError) throw new Error(filesError.message)

  const ownedFiles = files ?? []
  const fileIds = ownedFiles.map((file) => file.id)
  if (!fileIds.length) return { files: [], records: [], fields: [], catalog: [], truncated: false }

  let matchingRecordIds: string[] | null = null
  if (query.fieldKey || query.customOnly) {
    let matchingFieldsQuery = supabaseAdmin.from("record_attributes").select("record_id").eq("user_id", userId)
    if (query.fieldKey) matchingFieldsQuery = matchingFieldsQuery.eq("field_key", query.fieldKey)
    if (query.customOnly) matchingFieldsQuery = matchingFieldsQuery.eq("is_custom", true)
    const { data: matchingFields, error } = await matchingFieldsQuery
    if (error) throw new Error(error.message)
    matchingRecordIds = [...new Set((matchingFields ?? []).map((field) => field.record_id))]
    if (!matchingRecordIds.length) return { files: ownedFiles, records: [], fields: [], catalog: [], truncated: false }
  }

  let recordsQuery = supabaseAdmin
    .from("records")
    .select("id, file_id, source_key, parent_record_id, record_type, document_type, occurred_on, period_start, period_end, amount, amount_base, currency, fx_rate, fx_rate_date, direction, counterparty, counterparty_normalized, category, description, is_recurring, confidence, field_confidence, needs_review, has_user_edits, excluded_at, status, created_at, updated_at, files!inner(filename, document_type, upload_status)", { count: "exact" })
    .eq("user_id", userId)
    .in("file_id", fileIds)
    .order("updated_at", { ascending: false })
    .limit(MAX_ROWS)
  if (matchingRecordIds) recordsQuery = recordsQuery.in("id", matchingRecordIds)
  if (query.status) recordsQuery = recordsQuery.eq("status", query.status)
  if (query.documentType) recordsQuery = recordsQuery.eq("document_type", query.documentType)
  if (query.search?.trim()) {
    const like = `%${escapeLike(query.search.trim())}%`
    recordsQuery = recordsQuery.or(`record_type.ilike.${like},document_type.ilike.${like},counterparty.ilike.${like},category.ilike.${like},description.ilike.${like}`)
  }
  const { data: records, error: recordsError, count } = await recordsQuery
  if (recordsError) throw new Error(recordsError.message)

  const recordIds = (records ?? []).map((record) => record.id)
  let fields: RecordAttribute[] = []
  if (recordIds.length) {
    let fieldsQuery = supabaseAdmin
      .from("record_attributes")
      .select("id, record_id, field_key, value, value_type, confidence, is_custom, source_evidence")
      .eq("user_id", userId)
      .in("record_id", recordIds)
    if (query.fieldKey) fieldsQuery = fieldsQuery.eq("field_key", query.fieldKey)
    if (query.customOnly) fieldsQuery = fieldsQuery.eq("is_custom", true)
    const { data, error } = await fieldsQuery
    if (error) throw new Error(error.message)
    fields = (data ?? []) as RecordAttribute[]
  }

  const { data: allAttributes, error: catalogError } = await supabaseAdmin
    .from("record_attributes")
    .select("field_key, value_type, is_custom, source_evidence")
    .eq("user_id", userId)
  if (catalogError) throw new Error(catalogError.message)
  const catalogMap = new Map<string, { field_key: string; value_types: Set<string>; occurrence_count: number; is_custom: boolean; source_kinds: Set<string> }>()
  for (const attribute of allAttributes ?? []) {
    if (query.customOnly && !attribute.is_custom) continue
    const entry = catalogMap.get(attribute.field_key) ?? { field_key: attribute.field_key, value_types: new Set(), occurrence_count: 0, is_custom: false, source_kinds: new Set() }
    entry.value_types.add(attribute.value_type)
    entry.occurrence_count += 1
    entry.is_custom ||= attribute.is_custom
    entry.source_kinds.add(typeof attribute.source_evidence?.source_kind === "string" ? attribute.source_evidence.source_kind : "record")
    catalogMap.set(attribute.field_key, entry)
  }
  const catalog = [...catalogMap.values()]
    .sort((a, b) => b.occurrence_count - a.occurrence_count || a.field_key.localeCompare(b.field_key))
    .map((entry) => ({ ...entry, value_types: [...entry.value_types], source_kinds: [...entry.source_kinds] }))

  return { files: ownedFiles, records: records ?? [], fields, catalog, truncated: (count ?? 0) > MAX_ROWS }
}
