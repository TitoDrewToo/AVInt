import { NextRequest, NextResponse } from "next/server"

import { authorizeReportRequest } from "@/lib/report-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getReport, type ReportFilters } from "@/lib/report-engine"
import { toReportDocument } from "@/lib/report-document"
import { renderReportPdf } from "@/lib/report-pdf"

const PDF_GENERATION_LIMIT_MS = 8_000

function validFilters(value: unknown): ReportFilters {
  if (!value || typeof value !== "object") return {}
  const body = value as Record<string, unknown>
  return {
    dateFrom: typeof body.dateFrom === "string" ? body.dateFrom : "",
    dateTo: typeof body.dateTo === "string" ? body.dateTo : "",
    targetFolder: typeof body.targetFolder === "string" ? body.targetFolder : "",
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ report: string }> },
) {
  const { report } = await params
  const auth = await authorizeReportRequest(req, report, null)
  if ("error" in auth) return auth.error

  const allowed = await checkRateLimit("reports", auth.user.id, 60, 30)
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

  if (report !== "tax-bundle" && report !== "business-expense") {
    return NextResponse.json({ error: "PDF export is not available for this report yet." }, { status: 404 })
  }

  let filters: ReportFilters
  try {
    filters = validFilters(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 })
  }

  try {
    const result = await getReport(auth.user.id, auth.ent, report, filters)
    const document = toReportDocument(report, result, filters)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("PDF generation timed out.")), PDF_GENERATION_LIMIT_MS)
    })
    try {
      const pdf = await Promise.race([renderReportPdf(document), timeout])
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${report}-report.pdf"`,
          "Cache-Control": "no-store",
        },
      })
    } finally {
      if (timer) clearTimeout(timer)
    }
  } catch (error) {
    console.error("report PDF generation failed", { report, userId: auth.user.id, error })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate PDF." }, { status: 500 })
  }
}
