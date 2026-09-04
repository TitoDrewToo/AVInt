import { NextRequest, NextResponse } from "next/server"

import { authorizeReportDefinitionRequest } from "@/lib/report-definition-auth"
import { serverError } from "@/lib/api-error"
import { runReportDefinition, ReportDefinitionExecutionError } from "@/lib/report-definition-engine"
import { getReportDefinition, ReportDefinitionNotFoundError } from "@/lib/report-definition-store"
import { claimReportExport } from "@/lib/report-auth"
import { renderReportPdf } from "@/lib/report-pdf"

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await authorizeReportDefinitionRequest(request)
  if ("error" in auth) return auth.error
  const { slug } = await params
  const body = await request.json().catch(() => ({})) as { format?: unknown }
  if (body.format !== undefined && body.format !== "json" && body.format !== "pdf") return NextResponse.json({ error: "format must be json or pdf" }, { status: 400 })
  try {
    const definition = await getReportDefinition(auth.user.id, slug)
    const document = await runReportDefinition(auth.user.id, definition)
    if (body.format !== "pdf") return NextResponse.json({ definition: { slug: definition.slug, version: definition.version }, document })
    const claim = await claimReportExport(`saved:${slug}`, auth.user.id, auth.ent)
    if ("error" in claim) return claim.error
    const pdf = await renderReportPdf(document)
    return new NextResponse(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${slug}.pdf"`, "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof ReportDefinitionNotFoundError) return NextResponse.json({ error: error.message }, { status: 404 })
    if (error instanceof ReportDefinitionExecutionError || error instanceof TypeError) return NextResponse.json({ error: error.message }, { status: 422 })
    return serverError(error, { route: "report-definitions/[slug]/run", stage: "run", userId: auth.user.id })
  }
}
