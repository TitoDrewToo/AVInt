export interface AccountingExportRow {
  document_date?: string | null
  vendor_name?: string | null
  expense_category?: string | null
  total_amount?: number | null
  currency?: string | null
  filename?: string | null
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function normalizedDate(value: string | null | undefined): string {
  const match = value?.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? `${match[2]}/${match[3]}/${match[1]}` : ""
}

function normalizedVendor(value: string | null | undefined): string {
  return value?.trim() || "Unknown vendor"
}

function normalizedCategory(value: string | null | undefined): string {
  return value?.trim() || "Uncategorized"
}

function normalizedDescription(row: AccountingExportRow, separator = " — ", maxLength?: number): string {
  const description = `${normalizedVendor(row.vendor_name)}${separator}${normalizedCategory(row.expense_category)}`
  return maxLength === undefined ? description : description.slice(0, maxLength)
}

function normalizedAmount(value: number | null | undefined): string {
  const amount = Math.abs(value ?? 0)
  return amount === 0 ? "0.00" : `-${amount.toFixed(2)}`
}

function orderedRows(rows: AccountingExportRow[]): AccountingExportRow[] {
  return [...rows].sort((a, b) => normalizedDate(a.document_date).localeCompare(normalizedDate(b.document_date)))
}

export function generateQuickBooksCSV(rows: AccountingExportRow[], layout: "3col" | "4col" = "3col"): string {
  const lines = [layout === "4col" ? "Date,Description,Credit,Debit" : "Date,Description,Amount"]
  for (const row of orderedRows(rows)) {
    const date = normalizedDate(row.document_date)
    const description = csvCell(normalizedDescription(row))
    const amount = Math.abs(row.total_amount ?? 0)
    if (layout === "4col") {
      lines.push([date, description, "", amount === 0 ? "" : amount.toFixed(2)].join(","))
    } else {
      lines.push([date, description, amount === 0 ? "" : `-${amount.toFixed(2)}`].join(","))
    }
  }
  return lines.join("\n")
}

export function generateXeroCSV(rows: AccountingExportRow[]): string {
  const lines = ["Date,Description,Amount"]
  for (const row of orderedRows(rows)) {
    lines.push([
      normalizedDate(row.document_date),
      csvCell(normalizedDescription(row, " - ", 500)),
      normalizedAmount(row.total_amount),
    ].join(","))
  }
  return lines.join("\n")
}
