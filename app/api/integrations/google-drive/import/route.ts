import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { supabaseAdmin, entitlementForUser } from "@/lib/mcp-auth"
import { downloadGoogleDriveSelection } from "@/lib/google-drive"
import { ingestFiles } from "@/lib/smart-storage-ingest"
import { checkRateLimit } from "@/lib/rate-limit"

const requestSchema = z.object({ fileIds: z.array(z.string().min(1).max(200)).min(1).max(25) })

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await checkRateLimit("google-drive-import", user.id, 10, 60))) return NextResponse.json({ error: "Too many Drive import requests" }, { status: 429 })
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Choose at least one Drive file or folder" }, { status: 400 })
  try {
    const downloaded = await downloadGoogleDriveSelection(user.id, parsed.data.fileIds)
    if (!downloaded.length) return NextResponse.json({ error: "No supported files were found in that Drive selection" }, { status: 400 })
    const entitlement = await entitlementForUser(user.id)
    const results = await ingestFiles(user.id, entitlement, downloaded.map(({ file, data, mimeType }) => ({ name: file.name, mimeType, data, source: { provider: "google_drive" as const, fileId: file.id, url: file.webViewLink, modifiedAt: file.modifiedTime } })))
    return NextResponse.json({ results })
  } catch (error) {
    console.error("Google Drive import failed", { userId: user.id, reason: error instanceof Error ? error.message : "unknown" })
    return NextResponse.json({ error: "Google Drive import could not be completed" }, { status: 502 })
  }
}
