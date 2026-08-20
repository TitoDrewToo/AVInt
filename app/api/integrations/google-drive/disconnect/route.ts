import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { error: deleteError } = await supabaseAdmin.from("google_drive_connections").delete().eq("user_id", user.id)
  if (deleteError) return NextResponse.json({ error: "Could not disconnect Google Drive" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
