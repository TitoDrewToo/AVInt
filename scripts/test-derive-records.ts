import assert from "node:assert/strict"
import { deriveRecords } from "../supabase/functions/_shared/derive-records"
import { persistDerived } from "../supabase/functions/_shared/persist-derived"

const file = { id: "file-1", user_id: "user-1" }

function check(name: string, condition: boolean) {
  assert.equal(condition, true, name)
}

const vendorOnly = deriveRecords({ document_type: "receipt", vendor_name: "Vendor First", employer_name: null }, file)
check("vendor survives a null employer", vendorOnly.records[0].counterparty === "Vendor First")
check("vendor provenance is written as an attribute", vendorOnly.attributes.some((attribute) => attribute.field_key === "vendor_name" && attribute.value === "Vendor First"))

const employerOnly = deriveRecords({ document_type: "payslip", vendor_name: null, employer_name: "Employer First" }, file)
check("employer survives a null vendor", employerOnly.records[0].counterparty === "Employer First")
check("employer provenance is written as an attribute", employerOnly.attributes.some((attribute) => attribute.field_key === "employer_name" && attribute.value === "Employer First"))

const twoParties = deriveRecords({ document_type: "contract", vendor_name: "Andrew Vincent Niloban", employer_name: "Horizon Digital Inc." }, file)
check("first non-null counterparty wins", twoParties.records[0].counterparty === "Andrew Vincent Niloban")
check("losing employer is preserved as an attribute", twoParties.attributes.some((attribute) => attribute.field_key === "employer_name" && attribute.value === "Horizon Digital Inc."))

const noParties = deriveRecords({ document_type: "receipt", vendor_name: null, employer_name: null }, file)
check("both null parties produce a null counterparty", noParties.records[0].counterparty === null)
check("both null parties produce no party attributes", !noParties.attributes.some((attribute) => attribute.field_key === "vendor_name" || attribute.field_key === "employer_name"))

const numericAttributes = deriveRecords({ document_type: "receipt", tax_amount: 125, discount_amount: Number.NaN }, file)
const numericWrites: Array<Record<string, unknown>> = []
class FakeQuery {
  private payload: unknown
  private head = false
  constructor(private readonly table: string) {}
  select(_columns?: string, options?: { head?: boolean }) { this.head = options?.head === true; return this }
  eq() { return this }
  in() { return this }
  not() { return this }
  order() { return this }
  update() { return this }
  upsert(payload: unknown) {
    this.payload = payload
    if (this.table === "record_attributes") {
      for (const row of payload as Array<Record<string, unknown>>) numericWrites.push(row)
    }
    return this
  }
  then(resolve: (value: { data: unknown[]; error: null; count?: number }) => unknown) {
    if (this.head) return resolve({ data: [], error: null, count: 1 })
    if (this.table === "records" && Array.isArray(this.payload)) {
      return resolve({ data: (this.payload as Array<Record<string, unknown>>).map((row, index) => ({ id: `record-${index}`, source_key: row.source_key, parent_record_id: row.parent_record_id })), error: null })
    }
    if (this.table === "record_revisions") return resolve({ data: [], error: null })
    return resolve({ data: [], error: null })
  }
}
const fakeClient = { from: (table: string) => new FakeQuery(table) }
persistDerived(fakeClient, "extraction-1", numericAttributes).then(() => {
  check("numeric attribute writes value_numeric", numericWrites.find((row) => row.field_key === "tax_amount")?.value_numeric === 125)
  check("unparseable numeric value writes null", numericWrites.find((row) => row.field_key === "discount_amount")?.value_numeric === null)
  console.log("contract fixtures: vendor/null, dual parties, null parties, numeric attributes passed")
}).catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

const receipt = deriveRecords({
  document_type: "receipt",
  document_date: "2026-08-27",
  vendor_name: "Market Hall",
  vendor_normalized: "market-hall",
  currency: "PHP",
  total_amount: 1500,
  expense_category: "Food",
  line_items: Array.from({ length: 5 }, (_, index) => ({ description: `Item ${index + 1}`, amount: (index + 1) * 100 })),
  field_confidence: { document_date: 0.99, total_amount: 0.95 },
}, file)
check("receipt has one parent and five children", receipt.records.length === 6)
assert.deepEqual(receipt.records.map((record) => record.source_key), ["root", "root.1", "root.2", "root.3", "root.4", "root.5"])
check("children point to the parent source key", receipt.records.slice(1).every((record) => record.parent_source_key === "root"))
check("children do not copy the parent total", receipt.records.slice(1).every((record) => record.amount !== 1500))
check("receipt direction is outflow", receipt.records[0].direction === "outflow")
check("line-item children inherit parent direction", receipt.records.slice(1).every((record) => record.direction === "outflow"))
check("line-item children inherit parent date", receipt.records.slice(1).every((record) => record.occurred_on === "2026-08-27"))
check("line-item children inherit parent currency", receipt.records.slice(1).every((record) => record.currency === "PHP"))
check("line-item children retain their own amount", receipt.records[1].amount === 100)

const invoiceWithIncomeField = deriveRecords({
  document_type: "invoice", document_date: "2026-08-27", vendor_name: "Contractor", currency: "PHP",
  total_amount: 1000, net_income: 900, employer_name: "Unexpected source field",
}, file)
check("unconsumed net income is preserved as an attribute", invoiceWithIncomeField.attributes.some((attribute) => attribute.field_key === "net_income" && attribute.value === 900))
check("unconsumed employer name is preserved as an attribute", invoiceWithIncomeField.attributes.some((attribute) => attribute.field_key === "employer_name" && attribute.value === "Unexpected source field"))

const envelopedCsv = deriveRecords({
  document_type: "transaction_record",
  rows: [{ document_date: "2026-08-01", currency: "USD", total_amount: 25 }],
}, file)
check("spreadsheet rows inherit envelope record type", envelopedCsv.records[0].record_type === "transaction_record")

const datedAttribute = deriveRecords({
  document_type: "contract", document_date: "2026-08-01", currency: "PHP", custom_date: "2026-09-15",
}, file)
check("ISO date attributes are typed as dates", datedAttribute.attributes.find((attribute) => attribute.field_key === "custom_date")?.value_type === "date")

const csv = deriveRecords(Array.from({ length: 3 }, (_, index) => ({
  document_type: "transaction_record",
  document_date: `2026-08-${String(index + 1).padStart(2, "0")}`,
  currency: "USD",
  total_amount: index + 1,
})), file)
assert.deepEqual(csv.records.map((record) => record.source_key), ["0", "1", "2"])
check("three-row CSV fans out to three top-level records", csv.records.length === 3 && csv.records.every((record) => record.parent_record_id === null))

const twoHundredRows = deriveRecords(Array.from({ length: 200 }, (_, index) => ({
  document_type: "transaction_record",
  document_date: "2026-08-01",
  currency: "USD",
  total_amount: index + 1,
})), file)
check("200-row CSV produces 200 records", twoHundredRows.records.length === 200)
check("200-row CSV source keys are stable", twoHundredRows.records[0].source_key === "0" && twoHundredRows.records[199].source_key === "199")
assert.deepEqual(twoHundredRows, deriveRecords(Array.from({ length: 200 }, (_, index) => ({
  document_type: "transaction_record", document_date: "2026-08-01", currency: "USD", total_amount: index + 1,
})), file), "derivation is idempotent")

const payslip = deriveRecords({
  document_type: "payslip", document_date: "2026-08-15", employer_name: "Acme Inc", currency: "PHP",
  gross_income: 50000, net_income: 42000, tax_amount: 8000,
}, file)
check("payslip amount comes from net income", payslip.records[0].amount === 42000)
check("payslip counterparty comes from employer", payslip.records[0].counterparty === "Acme Inc")
check("gross income remains an attribute", payslip.attributes.some((attribute) => attribute.field_key === "gross_income" && attribute.value === 50000))
check("payslip direction is inflow", payslip.records[0].direction === "inflow")

const contract = deriveRecords({
  document_type: "contract", document_date: "2026-08-01", vendor_name: "Landlord", currency: "PHP",
  line_items: [{ description: "September rent", amount: 20000, due_date: "2026-09-01", check_number: "PDC-1" }],
}, file)
check("contract preserves line-item attributes", contract.attributes.some((attribute) => attribute.field_key === "description" && attribute.source_key === "root.1"))
check("contract child uses its own amount and date", contract.records[1].amount === 20000 && contract.records[1].occurred_on === "2026-09-01")

const matchingSingleItem = deriveRecords({
  document_type: "receipt", document_date: "2026-08-27", currency: "PHP", total_amount: 49,
  line_items: [{ description: "Design subscription", amount: 49 }],
}, file)
check("matching single line item collapses to the parent", matchingSingleItem.records.length === 1)
check("collapsed line item description is a parent attribute", matchingSingleItem.attributes.some((attribute) => attribute.source_key === "root" && attribute.field_key === "description" && attribute.value === "Design subscription"))

const partialSingleItem = deriveRecords({
  document_type: "receipt", document_date: "2026-08-27", currency: "PHP", total_amount: 49,
  line_items: [{ description: "Partial charge", amount: 48.99 }],
}, file)
check("different single line item remains a child", partialSingleItem.records.length === 2 && partialSingleItem.records[1].source_key === "root.1")

const twoItems = deriveRecords({
  document_type: "receipt", document_date: "2026-08-27", currency: "PHP", total_amount: 49,
  line_items: [{ description: "Part A", amount: 24.5 }, { description: "Part B", amount: 24.5 }],
}, file)
check("two line items remain two children", twoItems.records.length === 3 && twoItems.records.slice(1).every((record) => record.parent_source_key === "root"))

const unknownParentAmount = deriveRecords({
  document_type: "receipt", document_date: "2026-08-27", currency: "PHP", total_amount: null,
  line_items: [{ description: "Unknown total item", amount: 49 }],
}, file)
check("null parent amount does not collapse a line item", unknownParentAmount.records.length === 2 && unknownParentAmount.records[1].source_key === "root.1")

const empty = deriveRecords({}, file)
check("empty payload returns no records", empty.records.length === 0 && empty.attributes.length === 0)
const malformed = deriveRecords({ rows: [{ document_type: "receipt" }, null] }, file)
check("malformed payload returns empty result", malformed.records.length === 0 && malformed.attributes.length === 0)
check("malformed payload returns a reason", typeof malformed.reason === "string" && malformed.reason.length > 0)

console.log("derive-records fixtures: 24 passed")
