import { NextRequest, NextResponse } from "next/server"
import { authorizeReportRequest, claimReportExport } from "@/lib/report-auth"
import { checkRateLimit } from "@/lib/rate-limit"
import { getReport, type ReportFilters } from "@/lib/report-engine"
import { createReportQueryContext } from "@/lib/report-query-context-server"
import { getReportSection } from "@/lib/report-sections"
import type { ReportSectionResult } from "@/lib/report-sections"
import { rowsToCsv } from "@/lib/report-row-csv"

const CSV_REPORTS = new Set(["tax-bundle", "business-expense", "profit-loss", "income-summary", "expense-summary"])
type EngineCsvResult = { rows: unknown[] } | { expenses: unknown[] }
type CsvResult = EngineCsvResult | ReportSectionResult

function csvRows(result: CsvResult): unknown[] {
  if ("rows" in result) return result.rows
  if ("expenses" in result) return result.expenses
  if ("income" in result) return result.income
  if ("incomeRows" in result) return [...result.incomeRows, ...result.expenseRows]
  if ("contracts" in result) throw new Error("Contract summary does not support row CSV.")
  if ("docs" in result) throw new Error("Key terms does not support row CSV.")
  const exhaustive: never = result
  return exhaustive
}

function filters(req: NextRequest): ReportFilters {
  const params = new URL(req.url).searchParams
  return { dateFrom: params.get("dateFrom") ?? "", dateTo: params.get("dateTo") ?? "", targetFolder: params.get("targetFolder") ?? "" }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params
  const auth = await authorizeReportRequest(req, report, null)
  if ("error" in auth) return auth.error
  if (!CSV_REPORTS.has(report)) return NextResponse.json({ error: "Row CSV is not available for this report." }, { status: 404 })
  const allowed = await checkRateLimit("reports", auth.user.id, 60, 30)
  if (!allowed) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  const claim = await claimReportExport(report, auth.user.id, auth.ent)
  if ("error" in claim) return claim.error
  try {
    const selected = filters(req)
    const result = report === "tax-bundle" || report === "business-expense"
      ? await getReport(auth.user.id, auth.ent, report, selected)
      : await getReportSection(report, auth.user.id, await createReportQueryContext(auth.user.id, selected), selected)
    const rows = csvRows(result)
    const csv = rowsToCsv(rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object"))
    return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${report}-rows.csv"`, "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("report row CSV generation failed", { report, userId: auth.user.id, error })
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to generate CSV." }, { status: 500 })
  }
}
