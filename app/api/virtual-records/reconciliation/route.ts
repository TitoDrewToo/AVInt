import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"

function bearerToken(request: NextRequest) {
  return request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
}

export async function GET(request: NextRequest) {
  const token = bearerToken(request)
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const [{ data: files, error: filesError }, { data: records, error: recordsError }] = await Promise.all([
    supabaseAdmin.from("files").select("id, filename, document_type, upload_status, normalization_status").eq("user_id", auth.user.id),
    supabaseAdmin.from("virtual_records").select("id, file_id, document_type, record_type, status, normalization_version, updated_at").eq("user_id", auth.user.id).order("updated_at", { ascending: false }),
  ])
  if (filesError) return NextResponse.json({ error: filesError.message }, { status: 500 })
  if (recordsError) return NextResponse.json({ error: recordsError.message }, { status: 500 })

  const fileIds = new Set((files ?? []).map((file) => file.id))
  const representedFileIds = new Set((records ?? []).map((record) => record.file_id))
  const unrepresentedFiles = (files ?? []).filter((file) => !representedFileIds.has(file.id)).map((file) => ({
    id: file.id,
    filename: file.filename,
    document_type: file.document_type,
    upload_status: file.upload_status,
    normalization_status: file.normalization_status,
  }))
  const attentionRecords = (records ?? []).filter((record) => record.status === "failed" || record.status === "raw").map((record) => ({
    id: record.id,
    file_id: record.file_id,
    document_type: record.document_type,
    record_type: record.record_type,
    status: record.status,
    normalization_version: record.normalization_version,
    updated_at: record.updated_at,
  }))

  const { data: customFields, error: customFieldsError } = await supabaseAdmin
    .from("virtual_field_catalog")
    .select("field_key, label, value_types, occurrence_count, source_kinds")
    .eq("user_id", auth.user.id)
    .eq("is_custom", true)
    .order("occurrence_count", { ascending: false })
  if (customFieldsError) return NextResponse.json({ error: customFieldsError.message }, { status: 500 })

  return NextResponse.json({
    summary: {
      source_files: fileIds.size,
      represented_files: representedFileIds.size,
      files_without_records: unrepresentedFiles.length,
      records: records?.length ?? 0,
      records_in_progress: records?.filter((record) => record.status === "raw").length ?? 0,
      records_needing_attention: records?.filter((record) => record.status === "failed").length ?? 0,
      custom_fields: customFields?.length ?? 0,
    },
    unrepresented_files: unrepresentedFiles,
    attention_records: attentionRecords,
    custom_fields: customFields ?? [],
  })
}
