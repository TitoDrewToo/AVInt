import { supabaseAdmin } from "@/lib/mcp-auth"

const DEFAULT_PAGE_SIZE = 40
const MAX_PAGE_SIZE = 100

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
  page?: number
  pageSize?: number
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
  const page = Math.max(0, query.page ?? 0)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE))
  let filesQuery = supabaseAdmin.from("files").select("id, filename, file_type, file_size, storage_path, folder_id, document_type, upload_status, scan_reason, analysis_json, analyzed_at, source_rows_json, created_at").eq("user_id", userId)
  if (query.documentType) filesQuery = filesQuery.eq("document_type", query.documentType)
  const { data: files, error: filesError } = await filesQuery
  if (filesError) throw new Error(filesError.message)

  const ownedFiles = files ?? []
  const fileIds = ownedFiles.map((file) => file.id)
  if (!fileIds.length) return { files: [], records: [], fields: [], catalog: [], datasets: [], datasetColumns: [], page, pageSize, total: 0, hasMore: false, nextPage: null, statusCounts: {}, truncated: false }

  let matchingRecordIds: string[] | null = null
  if (query.fieldKey || query.customOnly) {
    let matchingFieldsQuery = supabaseAdmin.from("record_attributes").select("record_id").eq("user_id", userId)
    if (query.fieldKey) matchingFieldsQuery = matchingFieldsQuery.eq("field_key", query.fieldKey)
    if (query.customOnly) matchingFieldsQuery = matchingFieldsQuery.eq("is_custom", true)
    const { data: matchingFields, error } = await matchingFieldsQuery
    if (error) throw new Error(error.message)
    matchingRecordIds = [...new Set((matchingFields ?? []).map((field) => field.record_id))]
  }

  const needle = query.search?.trim()
  if (needle) {
    const like = `%${escapeLike(needle.replace(/[,()"']/g, " "))}%`
    const searchIds = new Set<string>()
    const filenameFileIds = ownedFiles
      .filter((file) => String(file.filename ?? "").toLowerCase().includes(needle.toLowerCase()))
      .map((file) => file.id)
    if (filenameFileIds.length) {
      const { data, error } = await supabaseAdmin.from("records").select("id").eq("user_id", userId).in("file_id", filenameFileIds)
      if (error) throw new Error(error.message)
      for (const row of data ?? []) searchIds.add(row.id)
    }
    const { data: directMatches, error: directError } = await supabaseAdmin
      .from("records")
      .select("id")
      .eq("user_id", userId)
      .in("file_id", fileIds)
      .or(`record_type.ilike.${like},document_type.ilike.${like},counterparty.ilike.${like},category.ilike.${like},description.ilike.${like}`)
    if (directError) throw new Error(directError.message)
    for (const row of directMatches ?? []) searchIds.add(row.id)
    const { data: fieldMatches, error: fieldError } = await supabaseAdmin
      .from("record_attributes")
      .select("record_id")
      .eq("user_id", userId)
      .ilike("field_key", like)
    if (fieldError) throw new Error(fieldError.message)
    for (const row of fieldMatches ?? []) searchIds.add(row.record_id)
    matchingRecordIds = matchingRecordIds
      ? matchingRecordIds.filter((id) => searchIds.has(id))
      : [...searchIds]
  }

  const emptyMatch = matchingRecordIds !== null && matchingRecordIds.length === 0

  let recordsQuery = supabaseAdmin
    .from("records")
    .select("id, file_id, source_key, parent_record_id, record_type, document_type, occurred_on, period_start, period_end, amount, amount_base, currency, fx_rate, fx_rate_date, direction, counterparty, counterparty_normalized, category, description, is_recurring, confidence, field_confidence, needs_review, has_user_edits, excluded_at, status, created_at, updated_at, files!inner(filename, document_type, upload_status)", { count: "exact" })
    .eq("user_id", userId)
    .in("file_id", fileIds)
    .order("updated_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (matchingRecordIds) recordsQuery = recordsQuery.in("id", matchingRecordIds)
  if (query.status) recordsQuery = recordsQuery.eq("status", query.status)
  if (query.documentType) recordsQuery = recordsQuery.eq("document_type", query.documentType)
  const { data: records, error: recordsError, count } = emptyMatch ? { data: [], error: null, count: 0 } : await recordsQuery
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

  let catalogQuery = supabaseAdmin
    .from("record_attributes")
    .select("field_key, value_type, is_custom, source_evidence")
    .eq("user_id", userId)
  if (query.fieldKey) catalogQuery = catalogQuery.eq("field_key", query.fieldKey)
  if (query.customOnly) catalogQuery = catalogQuery.eq("is_custom", true)
  const { data: allAttributes, error: catalogError } = await catalogQuery
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

  const { data: datasetRows, error: datasetsError } = await supabaseAdmin
    .from("datasets")
    .select("id, file_id, name, sheet_name, row_count, column_count, needs_review, created_at, updated_at")
    .eq("user_id", userId)
    .in("file_id", fileIds)
    .order("updated_at", { ascending: false })
  if (datasetsError) throw new Error(datasetsError.message)
  const datasetIds = (datasetRows ?? []).map((dataset) => dataset.id)
  let datasetColumns: Array<Record<string, unknown>> = []
  if (datasetIds.length) {
    const { data, error } = await supabaseAdmin
      .from("dataset_columns")
      .select("id, dataset_id, key, label, position, data_type, role, null_count, distinct_count, type_confidence, sample_values, needs_review, review_reason")
      .eq("user_id", userId)
      .in("dataset_id", datasetIds)
      .order("position", { ascending: true })
    if (error) throw new Error(error.message)
    datasetColumns = data ?? []
  }

  let statusQuery = supabaseAdmin.from("records").select("status").eq("user_id", userId).in("file_id", fileIds)
  if (matchingRecordIds && matchingRecordIds.length) statusQuery = statusQuery.in("id", matchingRecordIds)
  if (query.status) statusQuery = statusQuery.eq("status", query.status)
  if (query.documentType) statusQuery = statusQuery.eq("document_type", query.documentType)
  const { data: statusRows, error: statusError } = emptyMatch ? { data: [], error: null } : await statusQuery
  if (statusError) throw new Error(statusError.message)
  const statusCounts: Record<string, number> = {}
  for (const row of statusRows ?? []) statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1

  const total = count ?? 0
  const hasMore = (page + 1) * pageSize < total
  return {
    files: ownedFiles,
    records: records ?? [],
    fields,
    catalog,
    datasets: datasetRows ?? [],
    datasetColumns,
    page,
    pageSize,
    total,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
    statusCounts,
    truncated: hasMore,
  }
}
