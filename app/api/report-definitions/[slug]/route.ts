import { NextRequest, NextResponse } from "next/server"

import { authorizeReportDefinitionRequest } from "@/lib/report-definition-auth"
import { serverError } from "@/lib/api-error"
import { archiveReportDefinition, getReportDefinition, ReportDefinitionConflictError, ReportDefinitionNotFoundError, updateReportDefinition } from "@/lib/report-definition-store"

function failure(error: unknown, userId: string) {
  if (error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 })
  if (error instanceof ReportDefinitionNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
  if (error instanceof ReportDefinitionConflictError) return NextResponse.json({ error: error.message }, { status: 409 })
  return serverError(error, { route: "report-definitions/[slug]", stage: "request", userId })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeReportDefinitionRequest(request)
  if ("error" in auth) return auth.error
  try { return NextResponse.json({ definition: await getReportDefinition(auth.user.id, (await params).slug) }) } catch (error) { return failure(error, auth.user.id) }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeReportDefinitionRequest(request)
  if ("error" in auth) return auth.error
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 })
  const expectedVersion = Number((body as Record<string, unknown>).expectedVersion)
  try { return NextResponse.json({ definition: await updateReportDefinition(auth.user.id, (await params).slug, body, expectedVersion, "user") }) } catch (error) { return failure(error, auth.user.id) }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeReportDefinitionRequest(request)
  if ("error" in auth) return auth.error
  try { return NextResponse.json({ definition: await archiveReportDefinition(auth.user.id, (await params).slug) }) } catch (error) { return failure(error, auth.user.id) }
}
