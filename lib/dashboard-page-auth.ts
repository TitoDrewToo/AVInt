import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"
import { checkRateLimit } from "@/lib/rate-limit"

export async function authorizeDashboardPageRequest(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { data: auth, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !auth.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  if (!(await checkRateLimit("reports", `dashboard-pages:${auth.user.id}`, 60, 120))) return { error: NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }) }
  return { user: auth.user }
}
