import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { createGoogleDriveAuthorizationUrl, setGoogleDriveStateCookie } from "@/lib/google-drive"
import { checkRateLimit } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await checkRateLimit("google-drive-connect", user.id, 10, 60))) return NextResponse.json({ error: "Too many connection attempts" }, { status: 429 })
  try {
    const { url, nonce } = createGoogleDriveAuthorizationUrl(user.id)
    await setGoogleDriveStateCookie(nonce)
    return NextResponse.json({ url })
  } catch {
    return NextResponse.json({ error: "Google Drive import is being configured." }, { status: 503 })
  }
}
