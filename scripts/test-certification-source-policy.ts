import assert from "node:assert/strict"
import { spreadsheetFacts, resolveSpreadsheetMapping } from "../supabase/functions/_shared/spreadsheet-facts"
import { suitabilityBlocksAdmission } from "../supabase/functions/_shared/prescan-security"
import { deriveRecords } from "../supabase/functions/_shared/derive-records"
import { buildExtractionPayload } from "../supabase/functions/_shared/extraction-payload"

const mapping = resolveSpreadsheetMapping({ unit_price_php: "total_amount", order_total_php: "total_amount", customer_name: "vendor_name", order_id: "invoice_number" })
assert.equal(mapping.unit_price_php, "custom")
assert.equal(mapping.order_total_php, "total_amount")
assert.equal(mapping.customer_name, "counterparty_name")
assert.equal(mapping.order_id, "custom")
assert.equal(resolveSpreadsheetMapping({ first_amount: "total_amount", second_amount: "total_amount" }).first_amount, "custom")
const original = { _source_sheet: "Sheet1", _source_index: 0, total_amount: null, counterparty_name: "Kim Soo-jin", currency: "PHP", _field_evidence: { counterparty_name: { source_kind: "spreadsheet_cell", sheet: "Sheet1", row: 2, column: "customer_name" } } }
const facts = spreadsheetFacts({ raw_json: { gemini_raw: original }, total_amount: 3200, currency: "USD" })!
assert.equal(facts.total_amount, null)
assert.equal(facts.currency, "PHP")
assert.equal(facts.counterparty_name, "Kim Soo-jin")
assert.equal(facts.jurisdiction, null)
assert.equal(facts.invoice_number, null)
assert.equal(facts.confidence_score, null)
const payload = buildExtractionPayload(facts, "csv_export")
const derived = deriveRecords(payload, { id: "file", user_id: "user" })
assert.equal(derived.records[0].amount, null)
assert.equal(derived.records[0].counterparty, "Kim Soo-jin")
assert.deepEqual(derived.attributes.find(a => a.field_key === "counterparty_name")?.source_evidence, original._field_evidence.counterparty_name)
assert.equal(suitabilityBlocksAdmission({ is_processable: false, confidence: 0.1, abuse_flag: false, doc_category: "unrelated", reason: "reference data" }), false)
assert.equal(suitabilityBlocksAdmission({ is_processable: true, confidence: 0.9, abuse_flag: true, doc_category: "operational_data", reason: "abuse" }), true)
console.log("Certification source-preservation and suitability tests passed")
