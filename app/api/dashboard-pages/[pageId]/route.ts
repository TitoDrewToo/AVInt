import { NextRequest, NextResponse } from "next/server"

import { serverError } from "@/lib/api-error"
import { authorizeDashboardPageRequest } from "@/lib/dashboard-page-auth"
import { DashboardPageConflictError, DashboardPageNotFoundError, deleteDashboardPage, renameDashboardPage } from "@/lib/dashboard-pages"

function failure(error: unknown, userId: string) {
  if (error instanceof DashboardPageNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
  if (error instanceof DashboardPageConflictError) return NextResponse.json({ error: error.message }, { status: 409 })
  if (error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 })
  return serverError(error, { route: "dashboard-pages/[pageId]", stage: "mutation", userId })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const auth = await authorizeDashboardPageRequest(request)
  if ("error" in auth) return auth.error
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 })
  try { return NextResponse.json(await renameDashboardPage(auth.user.id, (await params).pageId, (body as Record<string, unknown>).name)) }
  catch (error) { return failure(error, auth.user.id) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ pageId: string }> }) {
  const auth = await authorizeDashboardPageRequest(request)
  if ("error" in auth) return auth.error
  try { return NextResponse.json(await deleteDashboardPage(auth.user.id, (await params).pageId)) }
  catch (error) { return failure(error, auth.user.id) }
}
