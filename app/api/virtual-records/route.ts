import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"

const MAX_PAGE_SIZE = 100
const VALID_STATUSES = new Set(["raw", "normalized", "manual", "failed"])
const EMPTY_STATUS_COUNTS = { raw: 0, normalized: 0, manual: 0, failed: 0 }

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&")
}

function bearerToken(request: NextRequest) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
}

export async function GET(request: NextRequest) {
  const token = bearerToken(request)
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params = request.nextUrl.searchParams
  const page = Math.max(0, Number.parseInt(params.get("page") ?? "0", 10) || 0)
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.parseInt(params.get("page_size") ?? "40", 10) || 40))
  const status = params.get("status")
  const documentType = params.get("document_type")
  const fieldKey = params.get("field_key")
  const customOnly = params.get("custom_only") === "true"
  const search = (params.get("search") ?? "").trim().toLowerCase()

  if (status && !VALID_STATUSES.has(status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 })

  let fileQuery = supabaseAdmin.from("files").select("id, filename, document_type, upload_status").eq("user_id", auth.user.id)
  if (documentType) fileQuery = fileQuery.eq("document_type", documentType)
  const { data: files, error: filesError } = await fileQuery
  if (filesError) return NextResponse.json({ error: filesError.message }, { status: 500 })

  const fileIds = (files ?? []).map((file) => file.id)
  if (fileIds.length === 0) return NextResponse.json({ records: [], fields: [], catalog: [], page, page_size: pageSize, total: 0, status_counts: EMPTY_STATUS_COUNTS, has_more: false, next_page: null })

  let matchingRecordIds: string[] | null = null
  if (fieldKey || customOnly) {
    let matchingFieldsQuery = supabaseAdmin
      .from("virtual_record_fields")
      .select("virtual_record_id")
      .eq("user_id", auth.user.id)
    if (fieldKey) matchingFieldsQuery = matchingFieldsQuery.eq("field_key", fieldKey)
    if (customOnly) matchingFieldsQuery = matchingFieldsQuery.eq("is_custom", true)
    const { data: matchingFields, error: matchingFieldsError } = await matchingFieldsQuery
    if (matchingFieldsError) return NextResponse.json({ error: matchingFieldsError.message }, { status: 500 })
    matchingRecordIds = [...new Set((matchingFields ?? []).map((field) => field.virtual_record_id))]
    if (matchingRecordIds.length === 0) return NextResponse.json({ records: [], fields: [], catalog: [], files: files ?? [], page, page_size: pageSize, total: 0, status_counts: EMPTY_STATUS_COUNTS, has_more: false, next_page: null })
  }

  if (search) {
    const likeSearch = escapeLike(search)
    const searchIds = new Set<string>()
    const filenameFileIds = new Set((files ?? []).filter((file) => file.filename.toLowerCase().includes(search)).map((file) => file.id))
    if (filenameFileIds.size) {
      const { data: filenameRecords, error: filenameRecordsError } = await supabaseAdmin
        .from("virtual_records")
        .select("id")
        .eq("user_id", auth.user.id)
        .in("file_id", [...filenameFileIds])
      if (filenameRecordsError) return NextResponse.json({ error: filenameRecordsError.message }, { status: 500 })
      for (const record of filenameRecords ?? []) searchIds.add(record.id)
    }
    const { data: matchingRecords, error: matchingRecordsError } = await supabaseAdmin
      .from("virtual_records")
      .select("id")
      .eq("user_id", auth.user.id)
      .in("file_id", fileIds)
      .ilike("record_type", `%${likeSearch}%`)
    if (matchingRecordsError) return NextResponse.json({ error: matchingRecordsError.message }, { status: 500 })
    for (const record of matchingRecords ?? []) searchIds.add(record.id)
    const { data: matchingFields, error: matchingFieldsError } = await supabaseAdmin
      .from("virtual_record_fields")
      .select("virtual_record_id")
      .eq("user_id", auth.user.id)
      .ilike("field_key", `%${likeSearch}%`)
    if (matchingFieldsError) return NextResponse.json({ error: matchingFieldsError.message }, { status: 500 })
    for (const field of matchingFields ?? []) searchIds.add(field.virtual_record_id)
    matchingRecordIds = matchingRecordIds ? matchingRecordIds.filter((id) => searchIds.has(id)) : [...searchIds]
    if (matchingRecordIds.length === 0) return NextResponse.json({ records: [], fields: [], catalog: [], files: files ?? [], page, page_size: pageSize, total: 0, status_counts: EMPTY_STATUS_COUNTS, has_more: false, next_page: null })
  }

  let recordQuery = supabaseAdmin
    .from("virtual_records")
    .select("id, file_id, document_type, record_type, status, normalization_version, created_at, updated_at", { count: "exact" })
    .eq("user_id", auth.user.id)
    .in("file_id", fileIds)
    .order("updated_at", { ascending: false })
    .range(page * pageSize, (page + 1) * pageSize - 1)
  if (matchingRecordIds) recordQuery = recordQuery.in("id", matchingRecordIds)
  if (status) recordQuery = recordQuery.eq("status", status)
  if (documentType) recordQuery = recordQuery.eq("document_type", documentType)

  const { data: records, error: recordsError, count } = await recordQuery
  if (recordsError) return NextResponse.json({ error: recordsError.message }, { status: 500 })
  const recordIds = (records ?? []).map((record) => record.id)

  let statusCountQuery = supabaseAdmin
    .from("virtual_records")
    .select("status")
    .eq("user_id", auth.user.id)
    .in("file_id", fileIds)
  if (matchingRecordIds) statusCountQuery = statusCountQuery.in("id", matchingRecordIds)
  if (status) statusCountQuery = statusCountQuery.eq("status", status)
  if (documentType) statusCountQuery = statusCountQuery.eq("document_type", documentType)
  const { data: statusRows, error: statusCountError } = await statusCountQuery
  if (statusCountError) return NextResponse.json({ error: statusCountError.message }, { status: 500 })
  const statusCounts = { ...EMPTY_STATUS_COUNTS }
  for (const row of statusRows ?? []) {
    if (row.status in statusCounts) statusCounts[row.status as keyof typeof statusCounts] += 1
  }

  let fields: any[] = []
  if (recordIds.length > 0) {
    let fieldsQuery = supabaseAdmin
      .from("virtual_record_fields")
      .select("id, virtual_record_id, field_key, value, value_type, confidence, is_custom, source_evidence")
      .eq("user_id", auth.user.id)
      .in("virtual_record_id", recordIds)
    if (fieldKey) fieldsQuery = fieldsQuery.eq("field_key", fieldKey)
    if (customOnly) fieldsQuery = fieldsQuery.eq("is_custom", true)
    const { data, error } = await fieldsQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    fields = data ?? []
  }

  const { data: catalog, error: catalogError } = await supabaseAdmin
    .from("virtual_field_catalog")
    .select("field_key, label, value_types, occurrence_count, is_custom, source_kinds")
    .eq("user_id", auth.user.id)
    .order("occurrence_count", { ascending: false })
  if (catalogError) return NextResponse.json({ error: catalogError.message }, { status: 500 })

  const total = count ?? 0
  const hasMore = (page + 1) * pageSize < total
  return NextResponse.json({
    records: records ?? [],
    fields,
    catalog: (catalog ?? []).filter((field) => !customOnly || field.is_custom),
    files: files ?? [],
    page,
    page_size: pageSize,
    total,
    status_counts: statusCounts,
    has_more: hasMore,
    next_page: hasMore ? page + 1 : null,
  })
}
