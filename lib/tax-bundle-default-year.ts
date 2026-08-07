export const TAX_RELEVANT_DOCUMENT_TYPES = new Set([
  "receipt",
  "invoice",
  "payslip",
  "income_statement",
])

export interface TaxBundleYearRow {
  document_type?: string | null
  document_date?: string | null
  period_start?: string | null
  period_end?: string | null
}

function yearFromDate(date: string | null | undefined): number | null {
  if (!date || date.length < 4) return null
  const year = parseInt(date.slice(0, 4), 10)
  return Number.isNaN(year) ? null : year
}

export function selectTaxBundleDefaultYear(
  detectedYears: number[],
  rows: TaxBundleYearRow[],
): number | null {
  const counts = new Map<number, number>()

  for (const row of rows) {
    if (!TAX_RELEVANT_DOCUMENT_TYPES.has(row.document_type ?? "")) continue
    const year = yearFromDate(row.period_end ?? row.period_start ?? row.document_date)
    if (year !== null) counts.set(year, (counts.get(year) ?? 0) + 1)
  }

  const mostActive = Array.from(counts.entries()).sort(([yearA, countA], [yearB, countB]) =>
    countB - countA || yearB - yearA,
  )[0]?.[0]

  const fallbackYears = detectedYears.filter((year) => !Number.isNaN(year))
  return mostActive ?? (fallbackYears.length > 0 ? Math.max(...fallbackYears) : null)
}
