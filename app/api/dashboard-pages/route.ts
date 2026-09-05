import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"
import { authorizeDashboardPageRequest } from "@/lib/dashboard-page-auth"
import { createDashboardPage, DashboardPageConflictError, ensureDefaultDashboardPages } from "@/lib/dashboard-pages"

export async function GET(request: NextRequest) {
  const auth = await authorizeDashboardPageRequest(request)
  if ("error" in auth) return auth.error
  try { return NextResponse.json({ pages: await ensureDefaultDashboardPages(auth.user.id) }) }
  catch (error) { return serverError(error, { route: "dashboard-pages", stage: "list", userId: auth.user.id }) }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeDashboardPageRequest(request)
  if ("error" in auth) return auth.error
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 })
  try {
    const result = await createDashboardPage(auth.user.id, (body as Record<string, unknown>).name)
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    if (error instanceof DashboardPageConflictError) return NextResponse.json({ error: error.message }, { status: 409 })
    if (error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 })
    return serverError(error, { route: "dashboard-pages", stage: "create", userId: auth.user.id })
  }
}
