import assert from "node:assert/strict"
import { customFieldsPayload, normalizeCustomFieldKey, validateCustomFields } from "../lib/document-type-fields"
import { deriveRecords } from "../supabase/functions/_shared/derive-records"
import { persistDerived } from "../supabase/functions/_shared/persist-derived"

assert.equal(normalizeCustomFieldKey("Warranty months"), "warranty_months")
assert.ok(validateCustomFields([{ id: "1", label: "Amount", type: "number", value: "1" }]).some((issue) => issue.field === "label"))
assert.ok(validateCustomFields([{ id: "1", label: "!!!", type: "text", value: "x" }]).some((issue) => issue.field === "label"))
assert.ok(validateCustomFields([
  { id: "1", label: "Warranty months", type: "number", value: "1" },
  { id: "2", label: "Warranty-months", type: "number", value: "2" },
]).some((issue) => issue.message.includes("duplicates")))
assert.equal(customFieldsPayload([{ id: "1", label: "Warranty months", type: "number", value: "1,234.56" }]).payload.warranty_months, 1234.56)
assert.ok(customFieldsPayload([{ id: "1", label: "Warranty months", type: "number", value: "abc" }]).issues.length > 0)
assert.ok(customFieldsPayload([{ id: "1", label: "raw_json", type: "text", value: "model output" }]).issues.some((issue) => issue.field === "label"))
assert.ok(validateCustomFields([{ id: "1", label: "Custom object", type: "text", value: { nested: true } as unknown as string }]).some((issue) => issue.message.includes("unsupported value")))

type Query = {
  table: string
  payload?: unknown
  head?: boolean
  select: (columns?: string, options?: { head?: boolean }) => Query
  eq: (...args: unknown[]) => Query
  in: (...args: unknown[]) => Query
  not: (...args: unknown[]) => Query
  is: (...args: unknown[]) => Query
  order: (...args: unknown[]) => Query
  upsert: (payload: unknown) => Query
  delete: () => Query
  update: () => Query
  then: (resolve: (value: { data: unknown[]; error: null; count?: number }) => unknown) => unknown
}

function fakeClient(existingAttributes: Array<{ id: string; field_key: string }>, revisions: unknown[] = []) {
  const deleted: string[] = []
  const client = { from(table: string): Query {
    const query: Query = {
      table,
      select(_columns, options) { query.head = options?.head === true; return query },
      eq() { return query }, in() { return query }, not() { return query }, is() { return query }, order() { return query },
      upsert(payload) { query.payload = payload; return query },
      delete() { return query }, update() { return query },
      then(resolve) {
        if (table === "records" && Array.isArray(query.payload)) return resolve({ data: (query.payload as Array<{ source_key: string }>).map((row, index) => ({ id: `record-${index}`, source_key: row.source_key, parent_record_id: null })), error: null })
        if (table === "record_revisions") return resolve({ data: revisions, error: null })
        if (table === "record_attributes" && query.payload === undefined && !query.head) return resolve({ data: existingAttributes, error: null })
        if (query.head) return resolve({ data: [], error: null, count: 0 })
        return resolve({ data: [], error: null })
      },
    }
    const originalIn = query.in
    query.in = (...args) => { if (table === "record_attributes" && args[0] === "id") deleted.push(...(args[1] as string[])); return originalIn(...args) }
    return query
  } }
  return { client, deleted }
}

const file = { id: "file-1", user_id: "user-1" }
async function main() {
  const derived = deriveRecords({ document_type: "receipt", document_date: "2026-01-01", currency: "USD", total_amount: 10, warranty_months: 24 }, file)
  const first = fakeClient([{ id: "old", field_key: "old_field" }, { id: "current", field_key: "warranty_months" }])
  await persistDerived(first.client, "extraction-1", derived)
  assert.deepEqual(first.deleted, ["old"])

  const noAttributes = deriveRecords({ document_type: "receipt", document_date: "2026-01-01", currency: "USD", total_amount: 10 }, file)
  const second = fakeClient([{ id: "old", field_key: "old_field" }])
  await persistDerived(second.client, "extraction-2", noAttributes)
  assert.deepEqual(second.deleted, [])

  const rollbackAttribute = deriveRecords({ document_type: "receipt", document_date: "2026-01-01", currency: "USD", total_amount: 10, description: "kept derived field" }, file)
  const rollback = fakeClient([{ id: "user", field_key: "user_note" }], [{
    id: "rollback", record_id: "record-0", revision_number: 1, target_kind: "attribute", target: "user_note", new_value: null, change_kind: "rollback",
  }])
  await persistDerived(rollback.client, "extraction-3", rollbackAttribute)
  assert.deepEqual(rollback.deleted, ["user"])
  console.log("custom-field fixtures: normalization, collisions, coercion, and pruning passed")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
