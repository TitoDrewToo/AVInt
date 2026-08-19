import type { AccountingExportRow } from "@/lib/accounting-csv"
import { isExportableExpenseRow, isUsdRow } from "@/lib/document-classification"
export type AccountingSourceRow = {
  document_type?: unknown
  files?: { document_type?: unknown } | Array<{ document_type?: unknown }>
  document_date?: string | null
  vendor_name?: string | null
  expense_category?: string | null
  total_amount?: number | null
  currency?: string | null
}

function fileDocumentType(row: AccountingSourceRow): string | null {
  const file = Array.isArray(row.files) ? row.files[0] : row.files
  return typeof file?.document_type === "string" ? file.document_type : null
}

/** Shared domain-to-export adapter; report screens and exports use the same row policy. */
export function accountingExportRows(rows: AccountingSourceRow[]): AccountingExportRow[] {
  return rows
    .map((row) => ({ ...row, document_type: fileDocumentType(row) ?? row.document_type }))
    .filter((row) => isExportableExpenseRow(row) && isUsdRow(row))
    .map((row) => ({
      document_date: row.document_date,
      vendor_name: row.vendor_name,
      expense_category: row.expense_category,
      total_amount: row.total_amount,
    }))
}
