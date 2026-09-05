import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"
import { authorizeDashboardPageRequest } from "@/lib/dashboard-page-auth"
import { DashboardPageConflictError, reorderDashboardPages } from "@/lib/dashboard-pages"

export async function POST(request: NextRequest) {
  const auth = await authorizeDashboardPageRequest(request)
  if ("error" in auth) return auth.error
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 })
  try { return NextResponse.json(await reorderDashboardPages(auth.user.id, (body as Record<string, unknown>).pageIds)) }
  catch (error) {
    if (error instanceof DashboardPageConflictError) return NextResponse.json({ error: error.message }, { status: 409 })
    if (error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 })
    return serverError(error, { route: "dashboard-pages/reorder", stage: "reorder", userId: auth.user.id })
  }
}
