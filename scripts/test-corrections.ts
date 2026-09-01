import assert from "node:assert/strict"
import { applyOverrides } from "../supabase/functions/_shared/apply-overrides"
import { coerceAttributeValue, coerceCorrectionValue } from "../lib/correction-contract"

assert.equal(coerceCorrectionValue("amount", "1,234.56"), 1234.56)
assert.throws(() => coerceCorrectionValue("amount", "abc"), /must be a number/)
assert.equal(coerceAttributeValue("number", "1,234.56"), 1234.56)
assert.equal(coerceAttributeValue("date", "2026-09-01"), "2026-09-01")
assert.throws(() => coerceAttributeValue("number", "abc"), /must be a number/)

const updates: Record<string, unknown>[] = []
const attributes: Record<string, unknown>[] = []
const revisions = [
  { id: "new", record_id: "record-1", revision_number: 2, target_kind: "column", target: "amount", new_value: 200, created_at: "2026-09-01T10:00:00Z" },
  { id: "old", record_id: "record-1", revision_number: 1, target_kind: "column", target: "amount", new_value: 100, created_at: "2026-09-01T10:00:00Z" },
  { id: "attribute", record_id: "record-1", revision_number: 3, target_kind: "attribute", target: "custom_rate", new_value: 12.5 },
]

class Query {
  constructor(private readonly table: string, private readonly mode: "read" | "update" | "upsert" = "read") {}
  select() { return this }
  in() { return this }
  eq() { return this }
  order(column: string) {
    if (this.table === "record_revisions" && column === "revision_number") revisions.sort((a, b) => b.revision_number - a.revision_number)
    return this
  }
  update(value: Record<string, unknown>) { updates.push(value); return new Query(this.table, "update") }
  upsert(value: Record<string, unknown>[]) { attributes.push(...value); return new Query(this.table, "upsert") }
  then(resolve: (result: { data: unknown[]; error: null }) => unknown) {
    if (this.table === "record_revisions") return resolve({ data: revisions, error: null })
    if (this.table === "records") return resolve({ data: [{ id: "record-1", user_id: "user-1" }], error: null })
    return resolve({ data: [], error: null })
  }
}

async function main() {
  await applyOverrides({ from: (table: string) => new Query(table) }, ["record-1"])
  assert.equal(updates[0].amount, 200)
  assert.equal(updates[0].needs_review, undefined)
  assert.equal(attributes[0].value_numeric, 12.5)
  assert.equal(attributes[0].is_custom, true)

  revisions.push({ id: "invalid", record_id: "record-1", revision_number: 4, target_kind: "column", target: "not_a_column", new_value: "x", created_at: "2026-09-01T11:00:00Z" })
  await assert.rejects(() => applyOverrides({ from: (table: string) => new Query(table) }, ["record-1"]), /unsupported record column revision target/)
  console.log("correction pure tests passed")
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
