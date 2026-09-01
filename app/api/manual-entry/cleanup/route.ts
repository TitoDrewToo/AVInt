import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"

type CleanupFailure = { stage: string; message: string }

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const fileId = typeof body?.file_id === "string" ? body.file_id : ""
  if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 })

  const { data: file, error: fileError } = await supabaseAdmin
    .from("files")
    .select("id, user_id, file_type")
    .eq("id", fileId)
    .maybeSingle()
  if (fileError) return NextResponse.json({ error: fileError.message }, { status: 500 })
  if (!file || file.user_id !== auth.user.id || file.file_type !== "manual") {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }

  const failures: CleanupFailure[] = []
  const attempt = async (stage: string, operation: () => Promise<{ error: { message: string } | null }>) => {
    try {
      const { error } = await operation()
      if (error) failures.push({ stage, message: error.message })
    } catch (error) {
      failures.push({ stage, message: error instanceof Error ? error.message : String(error) })
    }
  }

  const { data: records, error: recordsReadError } = await supabaseAdmin
    .from("records")
    .select("id")
    .eq("file_id", fileId)
  if (recordsReadError) failures.push({ stage: "read_records", message: recordsReadError.message })

  const recordIds = (records ?? []).map((record) => record.id)
  if (recordIds.length > 0) {
    await attempt("delete_record_attributes", async () => await supabaseAdmin.from("record_attributes").delete().in("record_id", recordIds))
  }
  await attempt("delete_records", async () => await supabaseAdmin.from("records").delete().eq("file_id", fileId))
  await attempt("delete_extractions", async () => await supabaseAdmin.from("extractions").delete().eq("file_id", fileId))
  await attempt("delete_document_fields", async () => await supabaseAdmin.from("document_fields").delete().eq("file_id", fileId))
  await attempt("delete_file", async () => await supabaseAdmin.from("files").delete().eq("id", fileId))

  if (failures.length > 0) {
    console.error("Manual entry cleanup failed", { fileId, userId: auth.user.id, failures })
    return NextResponse.json({ error: "Manual entry cleanup failed", failures }, { status: 500 })
  }

  return NextResponse.json({ cleaned: true, file_id: fileId })
}
