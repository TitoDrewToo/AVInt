import assert from "node:assert/strict"
import { accountingExportRows } from "../lib/report-export-shaping"

const rows = [
  { file_id: "usd", document_type: "receipt", vendor_name: "Acme", document_date: "2025-01-01", total_amount: 10, currency: "USD", expense_category: "Office" },
  { file_id: "php", document_type: "receipt", vendor_name: "Local", document_date: "2025-01-02", total_amount: 20, currency: "PHP", expense_category: "Office" },
  { file_id: "income", document_type: "payslip", vendor_name: null, document_date: "2025-01-03", total_amount: null, currency: "USD", expense_category: null },
  { document_type: "legacy", files: [{ document_type: "receipt" }], vendor_name: "Nested receipt", document_date: "2025-01-04", total_amount: 12, currency: "USD", expense_category: "Office" },
]

assert.deepEqual(accountingExportRows(rows), [
  { document_date: "2025-01-01", vendor_name: "Acme", expense_category: "Office", total_amount: 10 },
  { document_date: "2025-01-04", vendor_name: "Nested receipt", expense_category: "Office", total_amount: 12 },
])

console.log("report export shaping tests: 2 passed")
