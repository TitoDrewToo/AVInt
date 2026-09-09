import assert from "node:assert/strict"
import fs from "node:fs"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"

async function main() {
  const { validateDataRelationshipDefinitionPayload } = await import("../lib/data-relationship-definitions")
  const { applyDataRelationship, DataRelationshipExecutionError, DATA_RELATIONSHIP_ROW_LIMIT } = await import("../lib/data-relationship-engine")
  const { compileReportDefinition } = await import("../lib/report-definition-engine")
  const { validateReportDefinitionPayload } = await import("../lib/report-definitions")

  const input = {
    title: "Orders with customers",
    description: "Owned order and customer datasets joined by customer id.",
    leftVirtualDatasetSlug: "orders",
    rightVirtualDatasetSlug: "customers",
    leftKey: "customer_id",
    rightKey: "id",
    cardinality: "many_to_one" as const,
    dateField: { side: "left" as const, field: "occurred_on" },
    currencyField: { side: "left" as const, field: "currency" },
  }
  assert.equal(validateDataRelationshipDefinitionPayload(input).ok, true)
  assert.equal(validateDataRelationshipDefinitionPayload({ ...input, cardinality: "many_to_many" }).ok, false, "many-to-many is refused")
  assert.equal(validateDataRelationshipDefinitionPayload({ ...input, leftKey: "id = right.id" }).ok, false, "expressions are refused")
  assert.equal(validateDataRelationshipDefinitionPayload({ ...input, rightVirtualDatasetSlug: "orders" }).ok, false, "self relationships are refused")

  const relationship = {
    id: "relationship-id", user_id: "user-id", slug: "orders-with-customers", status: "active" as const,
    authored_by: "assistant" as const, version: 3, previewed_version: 3, preview_summary: null,
    activated_by: "user-id", activated_at: "2026-09-09T00:00:00Z", archived_at: null,
    created_at: "2026-09-09T00:00:00Z", updated_at: "2026-09-09T00:00:00Z", ...input,
  }
  const left = {
    rows: [
      { order_id: "o1", customer_id: "c1", occurred_on: "2026-09-04", amount: 10, currency: "USD", __file_id: "orders-file", __dataset_id: "orders-dataset" },
      { order_id: "o2", customer_id: "c1", occurred_on: "2026-09-05", amount: 20, currency: "USD", __file_id: "orders-file", __dataset_id: "orders-dataset" },
      { order_id: "o3", customer_id: "missing", occurred_on: "2026-09-05", amount: 30, currency: "USD", __file_id: "orders-file", __dataset_id: "orders-dataset" },
      { order_id: "o4", customer_id: null, occurred_on: "2026-09-05", amount: 40, currency: "USD", __file_id: "orders-file", __dataset_id: "orders-dataset" },
    ],
    availableFields: new Set(["order_id", "customer_id", "occurred_on", "amount", "currency"]),
    dateField: "occurred_on", currencyField: "currency", sourceLabel: "virtual orders", coverageNote: "Orders coverage.",
  }
  const right = {
    rows: [
      { id: "c1", segment: "Business", __file_id: "customers-file", __dataset_id: "customers-dataset" },
      { id: "c2", segment: "Personal", __file_id: "customers-file", __dataset_id: "customers-dataset" },
      { id: null, segment: "Unknown", __file_id: "customers-file", __dataset_id: "customers-dataset" },
    ],
    availableFields: new Set(["id", "segment"]), dateField: null, currencyField: null, sourceLabel: "virtual customers", coverageNote: "Customer coverage.",
  }
  const result = applyDataRelationship(relationship, left, right)
  assert.equal(result.preview.cardinalityValid, true)
  assert.equal(result.preview.projectedRows, 2)
  assert.equal(result.preview.leftUnmatchedRows, 1)
  assert.equal(result.preview.rightUnmatchedRows, 1)
  assert.equal(result.preview.leftNullKeys, 1)
  assert.equal(result.preview.rightNullKeys, 1)
  assert.deepEqual(result.samples.leftUnmatchedKeys, ["missing"])
  assert.deepEqual(result.samples.rightUnmatchedKeys, ["c2"])
  assert.equal(result.source.rows[0].left_order_id, "o1")
  assert.equal(result.source.rows[0].right_segment, "Business")
  assert.equal(result.source.rows[0].__left_file_id, "orders-file")
  assert.equal(result.source.rows[0].__right_file_id, "customers-file")
  assert.equal(result.source.dateField, "left_occurred_on")
  assert.equal(result.source.currencyField, "left_currency")
  assert.match(result.source.coverageNote ?? "", /omitted 1 unmatched left, 1 unmatched right, 2 null-key row/)

  const duplicateRight = { ...right, rows: [...right.rows, { id: "c1", segment: "Duplicate" }] }
  assert.throws(() => applyDataRelationship(relationship, left, duplicateRight), (error) => error instanceof DataRelationshipExecutionError && /many_to_one/.test(error.message))
  const oneToMany = applyDataRelationship({ ...relationship, cardinality: "one_to_many", leftKey: "customer_id", rightKey: "customer_id", dateField: undefined, currencyField: undefined }, { ...left, rows: [{ customer_id: "c1", order_id: "parent" }], availableFields: new Set(["customer_id", "order_id"]), dateField: null, currencyField: null }, { ...right, rows: [{ customer_id: "c1", item: "a" }, { customer_id: "c1", item: "b" }], availableFields: new Set(["customer_id", "item"]) })
  assert.equal(oneToMany.preview.projectedRows, 2, "one-to-many permits duplicates only on the right")
  assert.throws(() => applyDataRelationship({ ...relationship, cardinality: "one_to_one", dateField: undefined, currencyField: undefined }, { ...left, rows: [{ customer_id: "c1" }, { customer_id: "c1" }], dateField: null, currencyField: null }, { ...right, rows: [{ id: "c1" }] }), /one_to_one/, "one-to-one requires both keys unique")
  const oversizedLeft = { ...left, rows: Array.from({ length: DATA_RELATIONSHIP_ROW_LIMIT + 1 }, (_, index) => ({ customer_id: "c1", order_id: `o${index}` })) }
  assert.throws(() => applyDataRelationship(relationship, oversizedLeft, { ...right, rows: [right.rows[0]] }), /above the 5000-row limit/)
  const strictTypes = applyDataRelationship({ ...relationship, cardinality: "one_to_one" }, { ...left, rows: [{ customer_id: 1 }] }, { ...right, rows: [{ id: "1" }] })
  assert.equal(strictTypes.preview.projectedRows, 0, "numeric and text keys are not silently coerced into equality")

  const reportInput = {
    title: "Relationship activity",
    description: null,
    source: { kind: "relationship" as const, slug: "orders-with-customers" },
    scope: null,
    period: { kind: "fixed" as const, from: "2026-09-04", to: "2026-09-05" },
    filters: [],
    blocks: [
      { type: "kpi" as const, items: [{ label: "Orders", metric: { aggregation: "count" as const } }] },
      { type: "comparison" as const, title: "Previous period", against: "previous_period" as const, items: [{ label: "Orders", metric: { aggregation: "count" as const } }] },
    ],
    theme: null,
  }
  const reportValidation = validateReportDefinitionPayload(reportInput)
  assert.equal(reportValidation.ok, true, "reports accept active relationship slugs")
  const document = compileReportDefinition({ id: "report-id", user_id: "user-id", slug: "relationship-activity", authored_by: "assistant", version: 1, archived_at: null, created_at: "", updated_at: "", ...reportInput }, result.source, new Date("2026-09-09T00:00:00Z"))
  const comparison = document.blocks[1]
  assert.equal(comparison.type, "comparison")
  if (comparison.type === "comparison") assert.equal(comparison.items[0].direction, "unavailable", "absent prior relationship evidence never becomes a zero or decline")

  const migration = fs.readFileSync("supabase/migrations/20260909200000_add_virtual_dataset_relationships.sql", "utf8")
  assert.match(migration, /enable row level security/)
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)/i)
  assert.match(migration, /revoke insert, update, delete .* from anon, authenticated/)
  assert.match(migration, /delete from public\.virtual_dataset_relationships/)
  assert.match(migration, /revoke all on function public\.delete_user_data\(uuid\) from public, anon, authenticated/)

  console.log(JSON.stringify({ validation: true, preview: result.preview, firstJoinedRow: result.source.rows[0], coverage: result.source.coverageNote, comparison }, null, 2))
  console.log("data relationship tests: passed")
}

void main()
