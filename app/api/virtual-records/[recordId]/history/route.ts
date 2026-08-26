import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"

export async function GET(request: NextRequest, context: { params: Promise<{ recordId: string }> }) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { recordId } = await context.params
  if (!recordId) return NextResponse.json({ error: "recordId required" }, { status: 400 })

  const { data: record, error: recordError } = await supabaseAdmin
    .from("virtual_records")
    .select("id, user_id")
    .eq("id", recordId)
    .eq("user_id", auth.user.id)
    .maybeSingle()
  if (recordError) return NextResponse.json({ error: recordError.message }, { status: 500 })
  if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 })

  const { data: versions, error: versionsError } = await supabaseAdmin
    .from("virtual_record_versions")
    .select("id, version_number, document_type, record_type, status, normalization_version, change_reason, captured_at")
    .eq("virtual_record_id", record.id)
    .eq("user_id", auth.user.id)
    .order("version_number", { ascending: false })
  if (versionsError) return NextResponse.json({ error: versionsError.message }, { status: 500 })

  const versionIds = (versions ?? []).map((version) => version.id)
  const { data: fields, error: fieldsError } = versionIds.length
    ? await supabaseAdmin
      .from("virtual_record_version_fields")
      .select("version_id, field_key, value, value_type, confidence, is_custom, source_evidence")
      .eq("user_id", auth.user.id)
      .in("version_id", versionIds)
    : { data: [], error: null }
  if (fieldsError) return NextResponse.json({ error: fieldsError.message }, { status: 500 })

  return NextResponse.json({ versions: versions ?? [], fields: fields ?? [] })
}
