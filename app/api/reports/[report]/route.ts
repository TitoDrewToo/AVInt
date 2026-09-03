import { NextRequest, NextResponse } from "next/server"

import { authorizeReportRequest, claimReportExport } from "@/lib/report-auth"
import { serverError } from "@/lib/api-error"
import { checkRateLimit } from "@/lib/rate-limit"
import { getExport, getReport } from "@/lib/report-engine"
import { InvalidReportFolderError } from "@/lib/report-folder-scope-server"
import { createReportQueryContext } from "@/lib/report-query-context-server"
import { getReportSection } from "@/lib/report-sections"

function getFilters(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  return {
    dateFrom: searchParams.get("dateFrom") ?? "",
    dateTo: searchParams.get("dateTo") ?? "",
    targetFolder: searchParams.get("targetFolder") ?? "",
  }
}

function getExportFormat(req: NextRequest): string | null {
  return new URL(req.url).searchParams.get("export")
}

function getQuickBooksLayout(req: NextRequest): "3col" | "4col" {
  return new URL(req.url).searchParams.get("qbColumns") === "4" ? "4col" : "3col"
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ report: string }> },
) {
  const { report } = await params
  const exportFormat = getExportFormat(req)
  const qbLayout = getQuickBooksLayout(req)
  const auth = await authorizeReportRequest(req, report, exportFormat)
  if ("error" in auth) return auth.error

  const { user, ent } = auth

  // 30 reports / minute / user — expensive SQL, shouldn't fire on a loop.
  const allowed = await checkRateLimit("reports", user.id, 60, 30)
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })

  const { dateFrom, dateTo, targetFolder } = getFilters(req)

  try {
    const reportContext = await createReportQueryContext(user.id, { dateFrom, dateTo, targetFolder })
    if (exportFormat) {
      const claim = await claimReportExport(report, user.id, ent)
      if ("error" in claim) return claim.error
    }
    // Shared server engine used by both the JWT route and the MCP connector.
    // Keep the HTTP response format stable while the MCP layer consumes the
    // same user-scoped data and CSV generators.
    if (report === "business-expense" || report === "tax-bundle") {
      const reportKey = report as "business-expense" | "tax-bundle"
      if (exportFormat) {
        const target = exportFormat === "xero" ? "xero" : qbLayout === "4col" ? "quickbooks_4col" : "quickbooks_3col"
        const csv = await getExport(user.id, ent, reportKey, target, { dateFrom, dateTo, targetFolder })
        return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${report}-${exportFormat}.csv"`, "Cache-Control": "no-store" } })
      }
      return NextResponse.json(await getReport(user.id, ent, reportKey, { dateFrom, dateTo, targetFolder }))
    }

    if (["expense-summary", "income-summary", "profit-loss", "contract-summary", "key-terms"].includes(report)) {
      return NextResponse.json(await getReportSection(report, user.id, reportContext, { dateFrom, dateTo, targetFolder }))
    }

    return NextResponse.json({ error: "Unknown report" }, { status: 404 })
  } catch (error) {
    if (error instanceof InvalidReportFolderError) {
      return NextResponse.json({ error: error.message, code: "INVALID_REPORT_FOLDER" }, { status: 400 })
    }
    return serverError(error, { route: "reports/[report]", stage: report, userId: user.id })
  }
}
