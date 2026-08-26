import { supabaseAdmin } from "@/lib/mcp-auth"

const MAX_ROWS = 40

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&")
}

export type VirtualModelQuery = {
  search?: string
  status?: "raw" | "normalized" | "manual" | "failed"
  documentType?: string
  fieldKey?: string
  customOnly?: boolean
}

export async function readVirtualModel(userId: string, query: VirtualModelQuery = {}) {
  let filesQuery = supabaseAdmin.from("files").select("id, filename, document_type, upload_status").eq("user_id", userId)
  if (query.documentType) filesQuery = filesQuery.eq("document_type", query.documentType)
  if (query.search?.trim()) filesQuery = filesQuery.ilike("filename", `%${query.search.trim()}%`)
  const { data: files, error: filesError } = await filesQuery
  if (filesError) throw new Error(filesError.message)

  const fileIds = (files ?? []).map((file) => file.id)
  if (!fileIds.length) return { files: [], records: [], fields: [], catalog: [], truncated: false }

  let matchingRecordIds: string[] | null = null
  if (query.fieldKey || query.customOnly) {
    let matchingFieldsQuery = supabaseAdmin
      .from("virtual_record_fields")
      .select("virtual_record_id")
      .eq("user_id", userId)
    if (query.fieldKey) matchingFieldsQuery = matchingFieldsQuery.eq("field_key", query.fieldKey)
    if (query.customOnly) matchingFieldsQuery = matchingFieldsQuery.eq("is_custom", true)
    const { data: matchingFields, error: matchingFieldsError } = await matchingFieldsQuery
    if (matchingFieldsError) throw new Error(matchingFieldsError.message)
    matchingRecordIds = [...new Set((matchingFields ?? []).map((field) => field.virtual_record_id))]
    if (!matchingRecordIds.length) return { files: files ?? [], records: [], fields: [], catalog: [], truncated: false }
  }

  if (query.search?.trim()) {
    const needle = query.search.trim()
    const likeNeedle = escapeLike(needle)
    const searchIds = new Set<string>()
    const filenameFileIds = new Set((files ?? []).filter((file) => file.filename.toLowerCase().includes(needle.toLowerCase())).map((file) => file.id))
    if (filenameFileIds.size) {
      const { data: filenameRecords, error: filenameRecordsError } = await supabaseAdmin
        .from("virtual_records")
        .select("id")
        .eq("user_id", userId)
        .in("file_id", [...filenameFileIds])
      if (filenameRecordsError) throw new Error(filenameRecordsError.message)
      for (const record of filenameRecords ?? []) searchIds.add(record.id)
    }
    const { data: matchingRecords, error: matchingRecordsError } = await supabaseAdmin
      .from("virtual_records")
      .select("id")
      .eq("user_id", userId)
      .in("file_id", fileIds)
      .ilike("record_type", `%${likeNeedle}%`)
    if (matchingRecordsError) throw new Error(matchingRecordsError.message)
    for (const record of matchingRecords ?? []) searchIds.add(record.id)
    const { data: matchingFields, error: matchingFieldsError } = await supabaseAdmin
      .from("virtual_record_fields")
      .select("virtual_record_id")
      .eq("user_id", userId)
      .ilike("field_key", `%${likeNeedle}%`)
    if (matchingFieldsError) throw new Error(matchingFieldsError.message)
    for (const field of matchingFields ?? []) searchIds.add(field.virtual_record_id)
    matchingRecordIds = matchingRecordIds ? matchingRecordIds.filter((id) => searchIds.has(id)) : [...searchIds]
    if (!matchingRecordIds.length) return { files: files ?? [], records: [], fields: [], catalog: [], truncated: false }
  }

  let recordsQuery = supabaseAdmin
    .from("virtual_records")
    .select("id, file_id, document_type, record_type, status, normalization_version, created_at, updated_at", { count: "exact" })
    .eq("user_id", userId)
    .in("file_id", fileIds)
    .order("updated_at", { ascending: false })
    .limit(MAX_ROWS)
  if (matchingRecordIds) recordsQuery = recordsQuery.in("id", matchingRecordIds)
  if (query.status) recordsQuery = recordsQuery.eq("status", query.status)
  if (query.documentType) recordsQuery = recordsQuery.eq("document_type", query.documentType)
  const { data: records, error: recordsError, count } = await recordsQuery
  if (recordsError) throw new Error(recordsError.message)

  const recordIds = (records ?? []).map((record) => record.id)
  let fields: any[] = []
  if (recordIds.length) {
    let fieldsQuery = supabaseAdmin
      .from("virtual_record_fields")
      .select("id, virtual_record_id, field_key, value, value_type, confidence, is_custom, source_evidence")
      .eq("user_id", userId)
      .in("virtual_record_id", recordIds)
    if (query.fieldKey) fieldsQuery = fieldsQuery.eq("field_key", query.fieldKey)
    if (query.customOnly) fieldsQuery = fieldsQuery.eq("is_custom", true)
    const { data, error } = await fieldsQuery
    if (error) throw new Error(error.message)
    fields = data ?? []
  }

  const { data: catalog, error: catalogError } = await supabaseAdmin
    .from("virtual_field_catalog")
    .select("field_key, label, value_types, occurrence_count, is_custom, source_kinds")
    .eq("user_id", userId)
    .order("occurrence_count", { ascending: false })
  if (catalogError) throw new Error(catalogError.message)

  return { files: files ?? [], records: records ?? [], fields, catalog: (catalog ?? []).filter((field) => !query.customOnly || field.is_custom), truncated: (count ?? 0) > MAX_ROWS }
}
