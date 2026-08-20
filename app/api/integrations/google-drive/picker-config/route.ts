import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { getGoogleDrivePickerConfig } from "@/lib/google-drive"

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json(await getGoogleDrivePickerConfig(user.id)) } catch { return NextResponse.json({ error: "Google Drive Picker is not configured" }, { status: 503 }) }
}
