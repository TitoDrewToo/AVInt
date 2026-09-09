import assert from "node:assert/strict"
import fs from "node:fs"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"

async function main() {
  const { validateDataMappingProfilePayload } = await import("../lib/data-mapping-definitions")
  const { applyDataMappingProfile } = await import("../lib/data-mapping-engine")
  const FILE_ID = "00000000-0000-4000-8000-000000000001"
  const input = {
    title: "Partner expense fields",
    description: "Maps the partner export without rewriting source evidence.",
    source: { kind: "records" as const, fileIds: [FILE_ID] },
    scope: null,
    mappings: [
      { sourceField: "gross_value", targetField: "amount", coercion: "number" },
      { sourceField: "merchant", targetField: "counterparty", coercion: "trim" },
      { sourceField: "entry_date", targetField: "occurred_on", coercion: "date" },
    ],
  }
  const validated = validateDataMappingProfilePayload(input)
  assert.equal(validated.ok, true)
  assert.equal(validateDataMappingProfilePayload({ ...input, mappings: [{ sourceField: "gross_value", targetField: "amount", coercion: "trim" }] }).ok, false, "numeric targets refuse text coercion")
  assert.equal(validateDataMappingProfilePayload({ ...input, mappings: [{ sourceField: "gross_value", targetField: "needs_review", coercion: "boolean" }] }).ok, false, "authority fields cannot be mapped")
  assert.equal(validateDataMappingProfilePayload({ ...input, mappings: [{ sourceField: "gross_value);drop", targetField: "amount", coercion: "number" }] }).ok, false, "executable field syntax is refused")
  assert.equal(validateDataMappingProfilePayload({ ...input, mappings: [{ sourceField: "amount", targetField: "amount", coercion: "number" }] }).ok, false, "self mappings are refused")
  assert.equal(validateDataMappingProfilePayload({ ...input, mappings: [{ sourceField: "merchant", targetField: "category", coercion: "trim" }, { sourceField: "category", targetField: "description", coercion: "trim" }] }).ok, false, "implicit mapping chains are refused")

  const profile = {
    id: "profile-id", user_id: "user-id", slug: "partner-expense-fields", status: "active" as const,
    authored_by: "assistant" as const, version: 3, previewed_version: 3, preview_summary: null,
    activated_by: "user-id", activated_at: "2026-09-09T00:00:00Z", archived_at: null,
    created_at: "2026-09-09T00:00:00Z", updated_at: "2026-09-09T00:00:00Z", ...input,
  }
  const result = applyDataMappingProfile(profile, {
    rows: [
      { gross_value: "1,250.50", merchant: "  Acme  ", entry_date: "2026-09-08", amount: null, counterparty: null, occurred_on: null, __file_id: FILE_ID },
      { gross_value: "99", merchant: "Replacement", entry_date: "2026-09-09", amount: 125, counterparty: "Corrected merchant", occurred_on: "2026-09-07", has_user_edits: true, __file_id: FILE_ID },
      { gross_value: "USD 44", merchant: "Bad number", entry_date: "Sep 9", amount: null, counterparty: null, occurred_on: null, __file_id: FILE_ID },
    ],
    availableFields: new Set(["gross_value", "merchant", "entry_date", "amount", "counterparty", "occurred_on", "has_user_edits"]),
    dateField: "occurred_on", currencyField: "currency", sourceLabel: "selected records",
  })
  assert.equal(result.source.rows[0].amount, 1250.5)
  assert.equal(result.source.rows[0].counterparty, "Acme")
  assert.equal(result.source.rows[0].occurred_on, "2026-09-08")
  assert.equal(result.source.rows[1].amount, 125, "canonical value wins")
  assert.equal(result.source.rows[1].counterparty, "Corrected merchant", "user correction wins")
  assert.equal(result.source.rows[1].occurred_on, "2026-09-07")
  assert.equal(result.source.rows[2].amount, null, "invalid conversion fails closed")
  assert.equal(result.preview.applied, 4)
  assert.equal(result.preview.conflicts, 3)
  assert.equal(result.preview.typeFailures, 2)
  assert.match(result.source.coverageNote ?? "", /canonical value\(s\) preserved/)

  const migration = fs.readFileSync("supabase/migrations/20260909170000_add_data_mapping_profiles.sql", "utf8")
  assert.match(migration, /enable row level security/)
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)/i)
  assert.doesNotMatch(migration, /for (?:insert|update|delete) to authenticated/i, "client writes must not bypass preview gating")
  assert.match(migration, /previewed_version = version/)
  assert.match(migration, /delete from public\.data_mapping_profiles/)
  assert.match(migration, /revoke all on function public\.delete_user_data\(uuid\) from public, anon, authenticated/)

  console.log(JSON.stringify({
    validated: validated.ok,
    mappedRow: result.source.rows[0],
    correctedRow: result.source.rows[1],
    degradedRow: result.source.rows[2],
    preview: result.preview,
    posture: "preview-gated; canonical values win; samples not persisted; owner RLS",
  }, null, 2))
  console.log("data mapping profile tests: passed")
}

void main()
