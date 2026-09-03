import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"

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
    .select("id, user_id, file_type, upload_status")
    .eq("id", fileId)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .maybeSingle()
  if (fileError) return NextResponse.json({ error: fileError.message }, { status: 500 })
  if (!file || file.user_id !== auth.user.id || file.file_type !== "manual") {
    return NextResponse.json({ error: "File not found" }, { status: 404 })
  }

  const { data: extraction, error: extractionError } = await supabaseAdmin
    .from("extractions")
    .select("id, status")
    .eq("file_id", fileId)
    .order("attempt_number", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (extractionError) return NextResponse.json({ error: extractionError.message }, { status: 500 })
  if (extraction?.status === "succeeded" || ["done", "normalized"].includes(file.upload_status ?? "")) {
    return NextResponse.json({ error: "File processing completed" }, { status: 409 })
  }

  // All file children use ON DELETE CASCADE (except nullable audit links that
  // use SET NULL), so deleting the narrowly verified parent is sufficient.
  const { error: deleteError } = await supabaseAdmin.from("files").delete().eq("id", fileId)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ cleaned: true, file_id: fileId })
}
