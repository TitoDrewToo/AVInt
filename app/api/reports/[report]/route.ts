import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { authorizeReportRequest, claimReportExport } from "@/lib/report-auth"
import { generateQuickBooksCSV, generateXeroCSV } from "@/lib/accounting-csv"
import { overlapsDateRange } from "@/lib/report-utils"
import { serverError } from "@/lib/api-error"
import { checkRateLimit } from "@/lib/rate-limit"
import { selectTaxBundleDefaultYear } from "@/lib/tax-bundle-default-year"
import { getExport, getReport } from "@/lib/report-engine"
import { InvalidReportFolderError } from "@/lib/report-folder-scope-server"
import { createReportQueryContext } from "@/lib/report-query-context-server"
import { accountingExportRows } from "@/lib/report-export-shaping"
import type { AccountingExportRow } from "@/lib/accounting-csv"
import { getReportSection } from "@/lib/report-sections"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function accountingCsvResponse(format: "quickbooks" | "xero", rows: AccountingExportRow[], filename: string, qbLayout: "3col" | "4col" = "3col") {
  const csv = format === "quickbooks" ? generateQuickBooksCSV(rows, qbLayout) : generateXeroCSV(rows)
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}

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

    switch (report) {
      case "business-expense": {
        const fileIds = await reportContext.fileIds(["receipt", "invoice"])
        if (fileIds.length === 0) {
          if (exportFormat) return accountingCsvResponse(exportFormat as "quickbooks" | "xero", [], `business-expense-${exportFormat}.csv`, qbLayout)
          return NextResponse.json({ expenses: [] })
        }

        let query = supabaseAdmin
          .from("document_fields")
          .select(`
            file_id, vendor_name, document_date, total_amount, currency,
            expense_category, payment_method, tax_amount, confidence_score,
            files!inner(filename, document_type)
          `)
          .in("file_id", fileIds)
          .neq("normalization_status", "excluded")
          .order("document_date", { ascending: false })

        if (dateFrom) query = query.gte("document_date", dateFrom)
        if (dateTo) query = query.lte("document_date", dateTo)

        const { data, error } = await query
        if (error) throw new Error(error.message)
        if (exportFormat) {
          const exportRows = (data ?? []).map((row) => ({
            document_date: row.document_date,
            vendor_name: row.vendor_name,
            expense_category: row.expense_category,
            total_amount: row.total_amount,
          }))
          return accountingCsvResponse(exportFormat as "quickbooks" | "xero", exportRows, `business-expense-${exportFormat}.csv`, qbLayout)
        }

        return NextResponse.json({ expenses: data ?? [] })
      }

      case "tax-bundle": {
        const fileIds = await reportContext.fileIds()
        const totalOwnedDocs = fileIds.length

        let detectedYears: number[] = []
        let defaultYear: number | null = null
        if (totalOwnedDocs > 0) {
          const { data: yearRows, error: yearErr } = await supabaseAdmin
            .from("document_fields")
            .select("period_start, period_end, document_date, files!inner(user_id, document_type)")
            .eq("files.user_id", user.id)
            .in("file_id", fileIds)
            .neq("normalization_status", "excluded")

          if (yearErr) throw new Error(yearErr.message)

          const years = new Set<number>()
          for (const row of yearRows ?? []) {
            const d = row.period_end ?? row.period_start ?? row.document_date
            if (d && d.length >= 4) years.add(parseInt(d.slice(0, 4), 10))
          }
          detectedYears = Array.from(years).filter((n) => !isNaN(n)).sort((a, b) => b - a)
          defaultYear = selectTaxBundleDefaultYear(
            detectedYears,
            (yearRows ?? []).map((row) => ({
              document_type: row.files?.[0]?.document_type,
              document_date: row.document_date,
              period_start: row.period_start,
              period_end: row.period_end,
            })),
          )
        }

        if (fileIds.length === 0) {
          if (exportFormat) return accountingCsvResponse(exportFormat as "quickbooks" | "xero", [], `tax-bundle-${exportFormat}.csv`, qbLayout)
          return NextResponse.json({ rows: [], totalOwnedDocs, detectedYears, defaultYear })
        }

        const query = supabaseAdmin
          .from("document_fields")
          .select(`
            file_id, vendor_name, vendor_normalized, employer_name, document_date,
            period_start, period_end,
            total_amount, gross_income, net_income, expense_category, currency,
            income_source, classification_rationale, jurisdiction,
            confidence_score,
            files!inner(filename, document_type, storage_path)
          `)
          .in("file_id", fileIds)
          .neq("normalization_status", "excluded")
          .order("document_date", { ascending: false })

        const { data, error } = await query
        if (error) throw new Error(error.message)

        const rows = (data ?? []).filter((row) =>
          overlapsDateRange(
            {
              document_date: row.document_date,
              period_start: row.period_start,
              period_end: row.period_end,
            },
            { dateFrom, dateTo },
          ),
        )

        if (exportFormat) {
          const exportRows = accountingExportRows(rows)
          return accountingCsvResponse(exportFormat as "quickbooks" | "xero", exportRows, `tax-bundle-${exportFormat}.csv`, qbLayout)
        }

        return NextResponse.json({
          rows,
          totalOwnedDocs,
          detectedYears,
          defaultYear,
        })
      }

      default:
        return NextResponse.json({ error: "Unknown report" }, { status: 404 })
    }
  } catch (error) {
    if (error instanceof InvalidReportFolderError) {
      return NextResponse.json({ error: error.message, code: "INVALID_REPORT_FOLDER" }, { status: 400 })
    }
    return serverError(error, { route: "reports/[report]", stage: report, userId: user.id })
  }
}
