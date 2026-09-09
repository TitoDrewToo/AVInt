import assert from "node:assert/strict"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"

async function main() {
  const { validateDashboardVisualDefinition } = await import("../lib/dashboard-visual-definition")
  const { compileDashboardVisual } = await import("../lib/dashboard-visual-engine")
  const input = {
    renderer: "bar-chart", source: { kind: "records" }, scope: null, period: { kind: "all" }, filters: [],
    dimension: { field: "category" }, metric: { aggregation: "sum", field: "amount" }, limit: 12,
  }
  const validated = validateDashboardVisualDefinition(input)
  assert.equal(validated.ok, true)
  assert.equal(validateDashboardVisualDefinition({ ...input, dimension: { field: "amount); drop table records" } }).ok, false)
  assert.equal(validateDashboardVisualDefinition({ ...input, renderer: "script" }).ok, false)
  assert.equal(validateDashboardVisualDefinition({ ...input, source: { kind: "relationship", slug: "orders-with-customers" }, dimension: { field: "right_segment" }, metric: { aggregation: "sum", field: "left_amount" } }).ok, true, "dashboard visuals accept relationship sources through the shared contract")
  if (!validated.ok) throw new Error(validated.error)
  const result = compileDashboardVisual(validated.value, {
    rows: [
      { category: "Travel", amount: 10, currency: "USD" },
      { category: "Travel", amount: 20, currency: "PHP" },
      { category: "Meals", amount: 5, currency: "USD" },
    ],
    availableFields: new Set(["category", "amount", "currency"]), dateField: "occurred_on", currencyField: "currency", sourceLabel: "canonical records",
  })
  assert.deepEqual(result.data, [
    { label: "Travel · PHP", value: 20, currency: "PHP" },
    { label: "Travel · USD", value: 10, currency: "USD" },
    { label: "Meals · USD", value: 5, currency: "USD" },
  ])
  assert.match(result.coverage.statement, /excluded and superseded/)
  const relationshipResult = compileDashboardVisual({ ...validated.value, source: { kind: "relationship", slug: "orders-with-customers" }, dimension: { field: "right_segment" }, metric: { aggregation: "sum", field: "right_visitors" } }, {
    rows: [{ right_segment: "Business", right_visitors: 2, left_currency: "USD" }, { right_segment: "Business", right_visitors: 3, left_currency: "PHP" }],
    availableFields: new Set(["right_segment", "right_visitors", "left_currency"]), dateField: null, currencyField: "left_currency", sourceLabel: "relationship customers", coverageNote: "Matched 2/3 left rows; one unmatched row omitted.",
  })
  assert.deepEqual(relationshipResult.data, [{ label: "Business", value: 5 }], "a non-monetary field on the other relationship side is not bucketed by currency")
  assert.match(relationshipResult.coverage.statement, /one unmatched row omitted/)
  console.log("dashboard visual definition tests: 10 passed")
}

void main()
