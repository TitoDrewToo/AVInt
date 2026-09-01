import assert from "node:assert/strict"
import { parseManualNumber, validateManualEntry } from "../lib/document-type-fields"

const base = {
  document_type: "receipt", document_date: "2026-01-01", currency: "USD",
  total_amount: "10", gross_income: "", net_income: "", tax_amount: "", discount_amount: "",
  period_start: "", period_end: "", vendor_name: "", employer_name: "", counterparty_name: "",
  invoice_number: "", description: "", notes: "",
}

assert.equal(parseManualNumber("1,234.56").value, 1234.56)
assert.equal(parseManualNumber("(45)").value, -45)
assert.ok(parseManualNumber("abc").error)
assert.ok(parseManualNumber("100.5", "JPY").error)
assert.ok(validateManualEntry({ ...base, document_date: "2026-02-31" }).some((issue) => issue.field === "document_date" && issue.severity === "error"))
assert.ok(validateManualEntry({ ...base, document_date: "2999-01-01" }, new Date("2026-01-01T00:00:00Z")).some((issue) => issue.field === "document_date" && issue.severity === "warning"))
assert.ok(validateManualEntry({ ...base, currency: "" }).some((issue) => issue.field === "currency" && issue.severity === "error"))
assert.equal(validateManualEntry({ ...base, document_type: "contract", total_amount: "", currency: "" }).length, 0)
assert.equal(validateManualEntry({ ...base, document_type: "contract", total_amount: "", currency: "" }).length, 0)
assert.ok(validateManualEntry({ ...base, document_type: "receipt", total_amount: "" }).some((issue) => issue.field === "total_amount" && issue.severity === "error"))
assert.ok(validateManualEntry({ ...base, document_type: "receipt", total_amount: "10", currency: "" }).some((issue) => issue.field === "currency" && issue.severity === "error"))

console.log("manual-entry validation fixtures: 11 passed; JPY fractional amounts are rejected")
