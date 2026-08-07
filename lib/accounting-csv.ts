export interface AccountingExportRow {
  document_date?: string | null
  vendor_name?: string | null
  expense_category?: string | null
  total_amount?: number | null
  currency?: string | null
  filename?: string | null
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function normalizedDate(value: string | null | undefined): string {
  return value?.slice(0, 10) ?? ""
}

function normalizedVendor(value: string | null | undefined): string {
  return value?.trim() || "Unknown vendor"
}

function normalizedCategory(value: string | null | undefined): string {
  return value?.trim() || "Uncategorized"
}

function normalizedAmount(value: number | null | undefined): string {
  return (value ?? 0).toFixed(2)
}

function normalizedCurrency(value: string | null | undefined): string {
  return (value?.trim() || "USD").toUpperCase()
}

function orderedRows(rows: AccountingExportRow[]): AccountingExportRow[] {
  return [...rows].sort((a, b) => normalizedDate(a.document_date).localeCompare(normalizedDate(b.document_date)))
}

export function generateQuickBooksCSV(rows: AccountingExportRow[]): string {
  const lines = ["Date,Vendor,Category,Amount,Description,Currency"]
  for (const row of orderedRows(rows)) {
    lines.push([
      normalizedDate(row.document_date),
      csvCell(normalizedVendor(row.vendor_name)),
      csvCell(normalizedCategory(row.expense_category)),
      normalizedAmount(row.total_amount),
      csvCell(row.filename?.trim() || "Document expense"),
      normalizedCurrency(row.currency),
    ].join(","))
  }
  return lines.join("\n")
}

export function generateXeroCSV(rows: AccountingExportRow[]): string {
  const lines = ["Date,Amount,Payee,Description,Category,AccountCode,TaxType,Currency"]
  for (const row of orderedRows(rows)) {
    lines.push([
      normalizedDate(row.document_date),
      normalizedAmount(row.total_amount),
      csvCell(normalizedVendor(row.vendor_name)),
      csvCell(row.filename?.trim() || "Document expense"),
      csvCell(normalizedCategory(row.expense_category)),
      "",
      "",
      normalizedCurrency(row.currency),
    ].join(","))
  }
  return lines.join("\n")
}
