import assert from "node:assert/strict"

process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY = "local-certification-test-only"

async function main() {
  const { compileReportDefinition } = await import("../lib/report-definition-engine")
  const { validateReportDefinitionPayload } = await import("../lib/report-definitions")
  // Transcribed from immutable pack A v1.0.0; CF-1007 is missing, not zero.
  const amounts = [2500, 1300, 40000, 900, 4500, 2800, null, 650, 1500, 38000, 2250, 2700, 650, 2800]
  const base: any = { id: "test", user_id: "test", slug: "test", version: 1, title: "Certification probe", source: { kind: "virtual_dataset", slug: "cf-orders-period-1", dateField: "order_date" }, period: { kind: "fixed", from: "2026-09-01", to: "2026-09-30" }, scope: null, filters: [], theme: null, blocks: [{ type: "stat", title: "Metric", metric: { aggregation: "average", field: "amount" } }] }
  const source = (values: unknown[]) => ({ rows: values.map(amount => ({ amount, order_date: "2026-09-01" })), availableFields: new Set(["amount", "order_date"]), dateField: "order_date", currencyField: null, sourceLabel: "independent fixture" })
  const metric = (aggregation: string, values: unknown[]) => {
    const block = compileReportDefinition({ ...base, blocks: [{ type: "stat", title: "Metric", metric: { aggregation, field: "amount" } }] }, source(values)).blocks[0]
    assert.equal(block.type, "stat")
    return block.type === "stat" ? block.value : undefined
  }
  assert.equal(metric("average", amounts), "7,734.62")
  assert.equal(metric("sum", amounts), "100,550")
  assert.equal(metric("min", amounts), "650")
  assert.equal(metric("max", [-8, null, -2]), "-2")
  assert.equal(metric("average", [0, null, 10, "", " ", false]), "5")
  assert.equal(metric("sum", [null, "", undefined]), "—")
  const saved = validateReportDefinitionPayload(base)
  assert.equal(saved.ok, true)
  if (saved.ok) assert.deepEqual(saved.value.source, base.source)
  assert.equal(validateReportDefinitionPayload({ ...base, source: { ...base.source, dateFiled: "order_date" } }).ok, false)
  const series = compileReportDefinition({ ...base, blocks: [{ type: "series", title: "Daily", timeField: "order_date", bucket: "day", metric: { aggregation: "count" }, limit: 5 }] }, source(amounts)).blocks[0]
  assert.equal(series.type, "series")
  if (series.type === "series") assert.equal(series.points.length, 30)
  const singular = compileReportDefinition({ ...base, period: { kind: "fixed", from: "2026-09-01", to: "2026-09-02" }, blocks: [{ type: "series", title: "Daily", timeField: "order_date", bucket: "day", metric: { aggregation: "count" } }] }, source(amounts)).blocks[0]
  if (singular.type === "series") assert.match(singular.caption ?? "", /1 bucket has no data/)
  console.log("Certification report regressions passed")
}
main().catch(error => { console.error(error); process.exitCode = 1 })
