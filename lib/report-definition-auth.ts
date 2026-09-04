import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit } from "@/lib/rate-limit"
import { authorizeReportRequest } from "@/lib/report-auth"
import { supabaseAdmin } from "@/lib/mcp-auth"

export async function authorizeReportDefinitionRequest(request: NextRequest) {
  const auth = await authorizeReportRequest(request, "saved-definition", null)
  if ("error" in auth) return auth
  if (!auth.ent.isActive) return { error: NextResponse.json({ error: "Active report access is required" }, { status: 403 }) }
  if (!(await checkRateLimit("reports", `definitions:${auth.user.id}`, 60, 60))) return { error: NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }) }
  return auth
}

export { supabaseAdmin }
