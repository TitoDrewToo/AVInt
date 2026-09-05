import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"
import { ensureDefaultDashboardPages } from "@/lib/dashboard-pages"
import { listSavedDashboardWidgets } from "@/lib/dashboard-widget-store"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { checkRateLimit } from "@/lib/rate-limit"

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!(await checkRateLimit("reports", `dashboard-visuals:${auth.user.id}`, 60, 120))) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  const page = request.nextUrl.searchParams.get("page") ?? "personal"
  try {
    const pages = await ensureDefaultDashboardPages(auth.user.id)
    const selectedPage = pages.find((candidate) => candidate.slug === page)
    if (!selectedPage) return NextResponse.json({ error: "Dashboard page does not exist" }, { status: 404 })
    const visuals = await listSavedDashboardWidgets(auth.user.id, page, selectedPage.id)
    return NextResponse.json({ pages, visuals })
  } catch (error) {
    if (error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 })
    return serverError(error, { route: "dashboard-visuals", stage: "list", userId: auth.user.id })
  }
}
