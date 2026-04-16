export interface CurrencyLikeRow {
  currency: string | null
  total_amount?: number | null
  gross_income?: number | null
}

export interface CurrencySummary {
  primaryCurrency: string
  currencies: string[]
  mixedCurrency: boolean
}

export function summarizeCurrencies(rows: CurrencyLikeRow[]): CurrencySummary {
  const weight: Record<string, number> = {}

  for (const row of rows) {
    const currency = (row.currency ?? "USD").toUpperCase()
    weight[currency] = (weight[currency] ?? 0) + Math.abs(row.gross_income ?? row.total_amount ?? 0)
  }

  const currencies = Object.keys(weight)

  return {
    primaryCurrency: Object.entries(weight).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "USD",
    currencies,
    mixedCurrency: currencies.length > 1,
  }
}

export interface DateRangeFilter {
  dateFrom: string
  dateTo: string
}

function getOverlapBounds(row: {
  document_date?: string | null
  period_start?: string | null
  period_end?: string | null
}) {
  const start = row.period_start ?? row.document_date ?? row.period_end ?? null
  const end = row.period_end ?? row.document_date ?? row.period_start ?? null
  return { start, end }
}

export function overlapsDateRange(
  row: { document_date?: string | null; period_start?: string | null; period_end?: string | null },
  filter: DateRangeFilter,
): boolean {
  const { dateFrom, dateTo } = filter
  if (!dateFrom && !dateTo) return true

  const { start, end } = getOverlapBounds(row)
  if (!start && !end) return false

  if (dateFrom && end && end < dateFrom) return false
  if (dateTo && start && start > dateTo) return false
  return true
}
