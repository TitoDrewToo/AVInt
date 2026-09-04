import { NextRequest, NextResponse } from "next/server"

import { authorizeReportDefinitionRequest } from "@/lib/report-definition-auth"
import { serverError } from "@/lib/api-error"
import { createReportDefinition, listReportDefinitions, ReportDefinitionConflictError } from "@/lib/report-definition-store"

export async function GET(request: NextRequest) {
  const auth = await authorizeReportDefinitionRequest(request)
  if ("error" in auth) return auth.error
  try {
    return NextResponse.json({ definitions: await listReportDefinitions(auth.user.id, request.nextUrl.searchParams.get("search") ?? undefined) })
  } catch (error) {
    return serverError(error, { route: "report-definitions", stage: "list", userId: auth.user.id })
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeReportDefinitionRequest(request)
  if ("error" in auth) return auth.error
  const body = await request.json().catch(() => null)
  if (body === null) return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 })
  try {
    return NextResponse.json({ definition: await createReportDefinition(auth.user.id, body, "user") }, { status: 201 })
  } catch (error) {
    if (error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 400 })
    if (error instanceof ReportDefinitionConflictError) return NextResponse.json({ error: error.message }, { status: 409 })
    return serverError(error, { route: "report-definitions", stage: "create", userId: auth.user.id })
  }
}
