import assert from "node:assert/strict"

import type { ReportDefinition } from "../lib/report-definitions"

async function main() {
process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"
const { compileReportDefinition, resolveDefinitionPeriod } = await import("../lib/report-definition-engine")
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
console.log("report definition tests: 10 passed")
}

void main()
