import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { getGoogleDriveUser } from "@/lib/google-drive"

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json({ connected: Boolean(await getGoogleDriveUser(user.id)) }) } catch { return NextResponse.json({ error: "Could not check Google Drive connection" }, { status: 500 }) }
}
