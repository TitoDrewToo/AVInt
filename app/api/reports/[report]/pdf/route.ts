import { NextRequest, NextResponse } from "next/server"

import { authorizeReportRequest, claimReportExport } from "@/lib/report-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getReport, type ReportFilters } from "@/lib/report-engine"
import { toReportDocument } from "@/lib/report-document"
import { renderReportPdf } from "@/lib/report-pdf"
import { createReportQueryContext } from "@/lib/report-query-context-server"
import { getReportSection } from "@/lib/report-sections"
import type { ReportKey } from "@/lib/report-document"

const PDF_GENERATION_LIMIT_MS = 8_000
const REPORT_KEYS = new Set<ReportKey>(["tax-bundle", "business-expense", "profit-loss", "income-summary", "expense-summary", "contract-summary", "key-terms"])

function reportRowCount(result: unknown): number {
  if (!result || typeof result !== "object") return 0
  if ("rows" in result && Array.isArray(result.rows)) return result.rows.length
  if ("expenses" in result && Array.isArray(result.expenses)) return result.expenses.length
  if ("income" in result && Array.isArray(result.income)) return result.income.length
  if ("incomeRows" in result && "expenseRows" in result && Array.isArray(result.incomeRows) && Array.isArray(result.expenseRows)) return result.incomeRows.length + result.expenseRows.length
  if ("contracts" in result && Array.isArray(result.contracts)) return result.contracts.length
  if ("docs" in result && Array.isArray(result.docs)) return result.docs.length
  return 0
}

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
  if (!REPORT_KEYS.has(report as ReportKey)) return NextResponse.json({ error: "Unknown report" }, { status: 404 })
  const reportKey = report as ReportKey

  const allowed = await checkRateLimit("reports", auth.user.id, 60, 30)
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  const claim = await claimReportExport(reportKey, auth.user.id, auth.ent)
  if ("error" in claim) return claim.error

  let filters: ReportFilters
  const startedAt = performance.now()
  try {
    filters = validFilters(await req.json())
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 })
  }

  try {
    const result = reportKey === "tax-bundle" || reportKey === "business-expense"
      ? await getReport(auth.user.id, auth.ent, reportKey, filters)
      : await getReportSection(reportKey, auth.user.id, await createReportQueryContext(auth.user.id, filters), filters)
    const document = toReportDocument(reportKey, result, filters)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("PDF generation timed out.")), PDF_GENERATION_LIMIT_MS)
    })
    try {
      const pdf = await Promise.race([renderReportPdf(document), timeout])
      const elapsedMs = Math.round(performance.now() - startedAt)
      console.info("report_pdf_generated", JSON.stringify({ report: reportKey, rowCount: reportRowCount(result), byteSize: pdf.length, elapsedMs, hitCap: elapsedMs >= PDF_GENERATION_LIMIT_MS }))
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
