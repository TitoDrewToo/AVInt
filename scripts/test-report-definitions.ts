import assert from "node:assert/strict"

import type { ReportDefinition } from "../lib/report-definitions"

async function main() {
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"
const { compileReportDefinition, projectRecordDefinitionRow, resolveDefinitionPeriod } = await import("../lib/report-definition-engine")
const { slugifyReportTitle, slugWithSuffix, validateReportDefinitionPayload } = await import("../lib/report-definitions")

const input = {
  title: "Monthly Ops",
  description: null,
  source: { kind: "records" as const },
  scope: null,
  period: { kind: "rolling" as const, unit: "month" as const, count: 1, offset: -1 },
  filters: [],
  blocks: [
    { type: "kpi" as const, items: [{ label: "Spend", metric: { aggregation: "sum" as const, field: "amount" } }] },
    { type: "stat" as const, title: "Combined spend", metric: { aggregation: "sum" as const, field: "amount" } },
    { type: "table" as const, title: "Detail", columns: [{ field: "counterparty" }, { field: "amount" }], limit: 20 },
  ],
  theme: null,
}
const validated = validateReportDefinitionPayload(input)
assert.equal(validated.ok, true)
assert.equal(validateReportDefinitionPayload({ ...input, blocks: [{ type: "table", title: "Unsafe", columns: [{ field: "amount); drop table records" }] }] }).ok, false)
assert.equal(validateReportDefinitionPayload({ ...input, source: { kind: "dataset", datasetId: "not-a-uuid" } }).ok, false)
assert.equal(slugifyReportTitle("A"), "a")
assert.equal(slugWithSuffix("a", 2), "a-2")

const definition = { id: "def", user_id: "user", slug: "monthly-ops", authored_by: "user", version: 1, archived_at: null, created_at: "2026-01-01", updated_at: "2026-01-01", ...input } satisfies ReportDefinition
assert.deepEqual(resolveDefinitionPeriod(definition, new Date("2026-09-04T00:00:00Z")), { from: "2026-08-01", to: "2026-08-31" })
const document = compileReportDefinition(definition, {
  rows: [
    { occurred_on: "2026-08-01", amount: 10, currency: "USD", counterparty: "A" },
    { occurred_on: "2026-08-02", amount: 20, currency: "PHP", counterparty: "B" },
  ],
  availableFields: new Set(["occurred_on", "amount", "currency", "counterparty"]),
  dateField: "occurred_on",
  currencyField: "currency",
  sourceLabel: "canonical records",
}, new Date("2026-09-04T00:00:00Z"))
assert.equal(document.blocks[0].type, "kpi")
assert.equal(document.blocks[0].type === "kpi" ? document.blocks[0].items.length : 0, 2, "monetary KPI is split by currency")
assert.equal(document.blocks[1].suppressed, true, "a single stat never combines currencies")
assert.equal(document.coverage?.complete, true)

const empty = compileReportDefinition(definition, { rows: [], availableFields: new Set(["amount", "counterparty"]), dateField: null, currencyField: "currency", sourceLabel: "canonical records" })
assert.equal(empty.coverage?.complete, false)
assert.equal(empty.blocks[0].suppressed, true)

const projectedRows = [
  projectRecordDefinitionRow({ id: "csv", document_type: null, files: { filename: "a.csv", folder_id: null, document_type: "csv_export" } }, {}),
  projectRecordDefinitionRow({ id: "receipt", document_type: "receipt", files: { filename: "b.pdf", folder_id: null, document_type: "general_document" } }, {}),
  projectRecordDefinitionRow({ id: "contract", document_type: null, files: [{ filename: "c.pdf", folder_id: null, document_type: "contract" }] }, {}),
]
assert.deepEqual(projectedRows.map((row) => row.document_type), ["csv_export", "receipt", "contract"], "record document_type wins, otherwise file document_type is projected")
assert.equal(projectRecordDefinitionRow({ id: "unlinked", document_type: null, files: null }, {}).document_type, null)
assert.equal(projectRecordDefinitionRow({ id: "record-wins", document_type: "receipt", files: { document_type: "contract" } }, { document_type: "csv_export" }).document_type, "receipt")
const documentTypeDefinition = {
  ...definition,
  period: { kind: "all" as const },
  blocks: [{ type: "share" as const, title: "Rows by document type", groupBy: "document_type", metric: { aggregation: "count" as const } }],
}
const documentTypeReport = compileReportDefinition(documentTypeDefinition, {
  rows: projectedRows,
  availableFields: new Set(["document_type"]),
  dateField: null,
  currencyField: null,
  sourceLabel: "canonical records",
})
assert.match(documentTypeReport.coverage?.statement ?? "", /^3 matching rows /)
assert.equal(documentTypeReport.blocks[0].type, "share")
const documentTypeRows = documentTypeReport.blocks[0].type === "share" ? documentTypeReport.blocks[0].rows : []
assert.deepEqual(new Set(documentTypeRows.map((row) => row.label)), new Set(["csv_export", "receipt", "contract"]))
assert.equal(documentTypeRows.reduce((sum, row) => sum + row.value, 0), 3)
console.log(JSON.stringify({ coverage: documentTypeReport.coverage, block: documentTypeReport.blocks[0] }, null, 2))
console.log("report definition tests: 15 passed")
}

void main()
