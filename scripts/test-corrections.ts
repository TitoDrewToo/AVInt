import assert from "node:assert/strict"
import { applyOverrides } from "../supabase/functions/_shared/apply-overrides"
import { coerceAttributeValue, coerceCorrectionValue } from "../lib/correction-contract"

assert.equal(coerceCorrectionValue("amount", "1,234.56"), 1234.56)
assert.throws(() => coerceCorrectionValue("amount", "abc"), /must be a number/)
assert.equal(coerceAttributeValue("number", "1,234.56"), 1234.56)
assert.equal(coerceAttributeValue("date", "2026-09-01"), "2026-09-01")
assert.throws(() => coerceAttributeValue("number", "abc"), /must be a number/)
assert.throws(() => coerceAttributeValue("text", { nested: true }), /text attributes must be text/)

const updates: Record<string, unknown>[] = []
const attributes: Record<string, unknown>[] = []
const revisions = [
  { id: "new", record_id: "record-1", revision_number: 2, target_kind: "column", target: "amount", new_value: 200, change_kind: "user_edit", created_at: "2026-09-01T10:00:00Z" },
  { id: "old", record_id: "record-1", revision_number: 1, target_kind: "column", target: "amount", new_value: 100, change_kind: "user_edit", created_at: "2026-09-01T10:00:00Z" },
  { id: "attribute", record_id: "record-1", revision_number: 3, target_kind: "attribute", target: "custom_rate", new_value: 12.5, change_kind: "user_edit" },
]

class Query {
  constructor(private readonly table: string, private readonly mode: "read" | "update" | "upsert" = "read") {}
  private recordIds: string[] | null = null
  select() { return this }
  in(column: string, values: string[]) { if (column === "record_id") this.recordIds = values; return this }
  eq() { return this }
  order(column: string) {
    if (this.table === "record_revisions" && column === "revision_number") revisions.sort((a, b) => b.revision_number - a.revision_number)
    return this
  }
  update(value: Record<string, unknown>) { updates.push(value); return new Query(this.table, "update") }
  upsert(value: Record<string, unknown>[]) { attributes.push(...value); return new Query(this.table, "upsert") }
  then(resolve: (result: { data: unknown[]; error: null }) => unknown) {
    if (this.table === "record_revisions") return resolve({ data: revisions.filter((revision) => !this.recordIds || this.recordIds.includes(revision.record_id)), error: null })
    if (this.table === "records") return resolve({ data: (this.recordIds ?? ["record-1"]).map((id) => ({ id, user_id: "user-1" })), error: null })
    return resolve({ data: [], error: null })
  }
}

async function main() {
  await applyOverrides({ from: (table: string) => new Query(table) }, ["record-1"])
  assert.equal(updates[0].amount, 200)
  assert.equal(updates[0].needs_review, undefined)
  assert.equal(attributes[0].value_numeric, 12.5)
  assert.equal(attributes[0].is_custom, true)

  revisions.push({ id: "rollback", record_id: "record-1", revision_number: 4, target_kind: "column", target: "amount", new_value: null, change_kind: "rollback" })
  await applyOverrides({ from: (table: string) => new Query(table) }, ["record-1"])
  assert.equal(updates.at(-1)?.amount, undefined)
  assert.equal(updates.at(-1)?.has_user_edits, true)

  revisions.push({ id: "newer-edit", record_id: "record-1", revision_number: 5, target_kind: "column", target: "amount", new_value: 300, change_kind: "user_edit" })
  await applyOverrides({ from: (table: string) => new Query(table) }, ["record-1"])
  assert.equal(updates.at(-1)?.amount, 300)
  assert.equal(updates.at(-1)?.has_user_edits, true)

  revisions.push({ id: "attribute-rollback", record_id: "record-2", revision_number: 6, target_kind: "attribute", target: "user_note", new_value: null, change_kind: "rollback" })
  await applyOverrides({ from: (table: string) => new Query(table) }, ["record-2"])
  assert.equal(updates.at(-1)?.has_user_edits, false)

  revisions.push({ id: "invalid", record_id: "record-1", revision_number: 7, target_kind: "column", target: "not_a_column", new_value: "x", change_kind: "user_edit", created_at: "2026-09-01T11:00:00Z" })
  await assert.rejects(() => applyOverrides({ from: (table: string) => new Query(table) }, ["record-1"]), /unsupported record column revision target/)
  console.log("correction pure tests passed")
}

void main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
