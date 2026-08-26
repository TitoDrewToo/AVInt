import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"
import { syncVirtualRecord } from "@/lib/virtual-records"

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null)
  const fileId = typeof body?.file_id === "string" ? body.file_id : ""
  if (!fileId) return NextResponse.json({ error: "file_id required" }, { status: 400 })

  const [{ data: file, error: fileError }, { data: row, error: rowError }] = await Promise.all([
    supabaseAdmin.from("files").select("id, user_id, document_type").eq("id", fileId).maybeSingle(),
    supabaseAdmin.from("document_fields").select("*").eq("file_id", fileId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ])
  if (fileError || rowError) return NextResponse.json({ error: fileError?.message ?? rowError?.message }, { status: 500 })
  if (!file || file.user_id !== auth.user.id) return NextResponse.json({ error: "File not found" }, { status: 404 })
  if (!row) return NextResponse.json({ error: "Document fields not found" }, { status: 404 })

  try {
    await syncVirtualRecord(supabaseAdmin, row, file)
    return NextResponse.json({ synced: true, file_id: fileId, source_record_id: row.id })
  } catch (error) {
    console.error("virtual record sync failed", { fileId, userId: auth.user.id, error: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: "Virtual record sync failed" }, { status: 500 })
  }
}
