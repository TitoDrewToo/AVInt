import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { listGoogleDriveFiles } from "@/lib/google-drive"

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try { return NextResponse.json(await listGoogleDriveFiles(user.id, request.nextUrl.searchParams.get("parentId") ?? undefined)) } catch { return NextResponse.json({ error: "Could not load Google Drive files" }, { status: 502 }) }
}
