import assert from "node:assert/strict"
import fs from "node:fs"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"

async function main() {
  const { validateVirtualDatasetDefinitionPayload } = await import("../lib/virtual-dataset-definitions")
  const { validateReportDefinitionPayload } = await import("../lib/report-definitions")
  const { applyVirtualDatasetDefinition } = await import("../lib/report-definition-engine")

  const FILE_A = "00000000-0000-4000-8000-000000000001"
  const input = {
    title: "Reviewed expenses",
    description: "Active expense evidence ready for reporting.",
    source: { kind: "records" as const, fileIds: [FILE_A], documentTypes: ["receipt"] },
    scope: null,
    filters: [{ field: "needs_review", operator: "eq" as const, value: false }],
    fields: ["occurred_on", "amount", "currency", "category"],
  }
  const validated = validateVirtualDatasetDefinitionPayload(input)
  assert.equal(validated.ok, true)
  assert.equal(validateVirtualDatasetDefinitionPayload({ ...input, source: { kind: "virtual_dataset", slug: "nested" } }).ok, false, "nested virtual datasets are refused")
  assert.equal(validateVirtualDatasetDefinitionPayload({ ...input, fields: ["amount", "amount"] }).ok, false, "duplicate projections are refused")
  assert.equal(validateVirtualDatasetDefinitionPayload({ ...input, fields: ["amount); drop table records"] }).ok, false, "executable field syntax is refused")

  const report = validateReportDefinitionPayload({
    title: "Expense summary",
    description: null,
    source: { kind: "virtual_dataset", slug: "reviewed-expenses" },
    scope: null,
    period: { kind: "all" },
    filters: [],
    blocks: [{ type: "stat", title: "Spend", metric: { aggregation: "sum", field: "amount" } }],
    theme: null,
  })
  assert.equal(report.ok, true, "reports accept a stable virtual-dataset slug")

  const virtual = {
    id: "virtual-id", user_id: "user-id", slug: "reviewed-expenses", authored_by: "assistant" as const, version: 2,
    archived_at: null, created_at: "2026-09-09T00:00:00Z", updated_at: "2026-09-09T00:00:00Z",
    ...input,
  }
  const resolved = applyVirtualDatasetDefinition(virtual, {
    rows: [
      { occurred_on: "2026-09-01", amount: 25, currency: "USD", category: "Meals", needs_review: false, description: "kept", __file_id: FILE_A },
      { occurred_on: "2026-09-02", amount: 80, currency: "USD", category: "Travel", needs_review: true, description: "filtered", __file_id: FILE_A },
    ],
    availableFields: new Set(["occurred_on", "amount", "currency", "category", "needs_review", "description"]),
    dateField: "occurred_on",
    currencyField: "currency",
    sourceLabel: "selected canonical records",
  })
  assert.deepEqual(resolved.rows, [{ occurred_on: "2026-09-01", amount: 25, currency: "USD", category: "Meals", __file_id: FILE_A }])
  assert.deepEqual([...resolved.availableFields], ["occurred_on", "amount", "currency", "category"])
  assert.equal(resolved.dateField, "occurred_on")
  assert.equal(resolved.currencyField, "currency")
  assert.match(resolved.coverageNote ?? "", /reviewed-expenses v2/)

  const migration = fs.readFileSync("supabase/migrations/20260909110000_add_virtual_dataset_definitions.sql", "utf8")
  assert.match(migration, /enable row level security/)
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)/i)
  assert.match(migration, /delete from public\.virtual_dataset_definitions/)
  assert.match(migration, /revoke all on function public\.delete_user_data\(uuid\) from public, anon, authenticated/)

  console.log(JSON.stringify({
    validated: validated.ok,
    reportSource: report.ok ? report.value.source : null,
    resolvedRows: resolved.rows,
    availableFields: [...resolved.availableFields],
    coverage: resolved.coverageNote,
    security: "owner RLS; atomic account deletion; explicit function grant",
  }, null, 2))
  console.log("virtual dataset definition tests: passed")
}

void main()
