import type { getReport } from "@/lib/report-engine"
import type { TaxBundleSummary } from "@/lib/tax-bundle"

export const MCP_REPORT_ROW_SAMPLE_LIMIT = 20

type ReportResult = Awaited<ReturnType<typeof getReport>>

function mapToObject(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(map.entries())
}

function compactSummary(summary: TaxBundleSummary) {
  const {
    incomeRows,
    expenseRows,
    wageRows,
    selfEmploymentRows,
    otherIncomeRows,
    uncategorizedItems,
    reviewItems,
    excludedNonUsdRows,
    excludedNonUsdByCurrency,
    scheduleC,
    otherIncomeByType,
    incomeByEmployer,
    ...scalars
  } = summary

  return {
    ...scalars,
    counts: {
      incomeRows: incomeRows.length,
      expenseRows: expenseRows.length,
      wageRows: wageRows.length,
      selfEmploymentRows: selfEmploymentRows.length,
      otherIncomeRows: otherIncomeRows.length,
      uncategorizedItems: uncategorizedItems.length,
      reviewItems: reviewItems.length,
      excludedNonUsdRows: excludedNonUsdRows.length,
    },
    scheduleC: scheduleC.map(({ items: _items, ...line }) => line),
    otherIncomeByType: Object.fromEntries(otherIncomeByType.entries()),
    incomeByEmployer: Object.fromEntries(incomeByEmployer.entries()),
    excludedNonUsdByCurrency: mapToObject(excludedNonUsdByCurrency),
  }
}

export function shapeMcpReportResult(result: ReportResult, includeRows = false) {
  const summaryValue = "summary" in result ? result.summary : null
  const summary = summaryValue ? compactSummary(summaryValue) : null
  const sourceRows = "rows" in result ? (result.rows ?? []) : (result.expenses ?? [])
  const rows = includeRows ? sourceRows : sourceRows.slice(0, MCP_REPORT_ROW_SAMPLE_LIMIT)
  const omittedCount = Math.max(0, sourceRows.length - rows.length)

  return {
    summary,
    totalOwnedDocs: "totalOwnedDocs" in result ? result.totalOwnedDocs : null,
    detectedYears: "detectedYears" in result ? result.detectedYears : [],
    defaultYear: "defaultYear" in result ? result.defaultYear : null,
    rowCount: sourceRows.length,
    currency: summary?.primaryCurrency ?? null,
    currencies: summary?.currencies ?? [],
    excludedNonUsd: summary ? {
      rowCount: summary.counts.excludedNonUsdRows,
      rawTotal: summary.excludedNonUsdRaw,
      byCurrency: summary.excludedNonUsdByCurrency,
    } : null,
    rows,
    omittedCount,
    truncated: omittedCount > 0,
  }
}
