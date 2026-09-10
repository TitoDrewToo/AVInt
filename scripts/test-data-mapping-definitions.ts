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

  const reconciliationInput = {
    title: "Workforce activity",
    description: "Reconciles three operational exports into one logical shape.",
    source: { kind: "dataset" as const, folderId: "00000000-0000-4000-8000-000000000010" },
    scope: null,
    mappings: [
      { targetField: "agent_id", targetType: "text", candidates: [
        { sourceField: "agent_id", coercion: "trim" },
        { sourceField: "employee_number", coercion: "trim" },
        { sourceField: "login", coercion: "trim" },
      ], required: true, onMissing: "reject" },
      { targetField: "interaction_count", targetType: "number", candidates: [
        { sourceField: "interactions", coercion: "number" },
        { sourceField: "call_volume", coercion: "number" },
        { sourceField: "calls", coercion: "number" },
      ], required: true, onMissing: "reject" },
      { targetField: "team", targetType: "text", candidates: [{ sourceField: "team", coercion: "trim" }], required: false, onMissing: "null" },
      { targetField: "attendance_status", targetType: "text", candidates: [{ sourceField: "attendance_status", coercion: "trim" }], required: false, onMissing: "null" },
    ],
  }
  const reconciliationValidation = validateDataMappingProfilePayload(reconciliationInput)
  assert.equal(reconciliationValidation.ok, true, "custom target reconciliation validates")
  const wideReconciliation = validateDataMappingProfilePayload({
    ...reconciliationInput,
    mappings: Array.from({ length: 21 }, (_, index) => ({
      targetField: `target_${index}`,
      targetType: "text",
      candidates: [{ sourceField: `source_${index}`, coercion: "trim" }],
      required: false,
      onMissing: "null",
    })),
  })
  assert.equal(wideReconciliation.ok, true, "reconciliation contracts are not constrained by the report table's 20-column display limit")
  assert.equal(validateDataMappingProfilePayload({ ...reconciliationInput, mappings: [{ ...reconciliationInput.mappings[0], role: "time" }] }).ok, false, "time roles require date targets")
  assert.equal(validateDataMappingProfilePayload({ ...reconciliationInput, mappings: [{ ...reconciliationInput.mappings[0], role: "currency" }] }).ok, true, "currency roles accept text targets")
  assert.equal(validateDataMappingProfilePayload({ ...reconciliationInput, mappings: [{ ...reconciliationInput.mappings[0], targetField: "user_id" }] }).ok, false, "authority targets are reserved")
  assert.equal(validateDataMappingProfilePayload({ ...reconciliationInput, mappings: [{ ...reconciliationInput.mappings[0], required: true, onMissing: "null" }] }).ok, false, "required targets cannot silently become null")
  assert.equal(validateDataMappingProfilePayload({ ...reconciliationInput, mappings: [input.mappings[0], reconciliationInput.mappings[0]] }).ok, false, "legacy and reconciliation rules cannot mix")
  if (!reconciliationValidation.ok) throw new Error(reconciliationValidation.error)
  const reconciled = applyDataMappingProfile({
    id: "workforce-profile", user_id: "user-id", slug: "workforce-activity", status: "active" as const,
    authored_by: "assistant" as const, version: 2, previewed_version: 2, preview_summary: null,
    activated_by: "user-id", activated_at: "2026-09-10T00:00:00Z", archived_at: null,
    created_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z", ...reconciliationValidation.value,
  }, {
    rows: [
      { login: "a-1", calls: "10", notes: "ignored downstream", __dataset_id: "dataset-a", __file_id: "file-a", __row_index: 0 },
      { employee_number: "b-2", call_volume: 20, team: "Alpha", __dataset_id: "dataset-b", __file_id: "file-b", __row_index: 0 },
      { agent_id: "c-3", interactions: 30, attendance_status: "Present", __dataset_id: "dataset-c", __file_id: "file-c", __row_index: 0 },
    ],
    availableFields: new Set(["login", "calls", "notes", "employee_number", "call_volume", "team", "agent_id", "interactions", "attendance_status"]),
    fieldTypes: new Map(),
    datasetSchemas: [
      { datasetId: "dataset-a", datasetName: "Calls", fields: [{ key: "login", dataType: "text" }, { key: "calls", dataType: "number" }, { key: "notes", dataType: "text" }] },
      { datasetId: "dataset-b", datasetName: "Workforce", fields: [{ key: "employee_number", dataType: "text" }, { key: "call_volume", dataType: "number" }, { key: "team", dataType: "text" }] },
      { datasetId: "dataset-c", datasetName: "Operations", fields: [{ key: "agent_id", dataType: "text" }, { key: "interactions", dataType: "number" }, { key: "attendance_status", dataType: "text" }] },
    ],
    dateField: null, currencyField: null, sourceLabel: "heterogeneous folder datasets",
  })
  assert.equal(reconciled.preview.activationReady, true)
  assert.equal(reconciled.preview.sourceDatasets, 3)
  assert.equal(reconciled.preview.outputRows, 3)
  assert.deepEqual(reconciled.source.rows.map((row) => [row.agent_id, row.interaction_count, row.team, row.attendance_status]), [
    ["a-1", 10, null, null], ["b-2", 20, "Alpha", null], ["c-3", 30, null, "Present"],
  ])
  assert.equal(reconciled.source.fieldTypes?.get("interaction_count"), "number")
  assert.match(reconciled.source.coverageNote ?? "", /3\/3 dataset/)

  const conflicting = applyDataMappingProfile({
    id: "conflict", user_id: "user-id", slug: "conflict", status: "draft" as const, authored_by: "user" as const,
    version: 1, previewed_version: null, preview_summary: null, activated_by: null, activated_at: null, archived_at: null,
    created_at: "", updated_at: "", title: "Conflict", description: null, source: reconciliationValidation.value.source, scope: null,
    mappings: [{ targetField: "agent_id", targetType: "text", candidates: [{ sourceField: "login", coercion: "trim" }, { sourceField: "employee_number", coercion: "trim" }], required: true, onMissing: "reject", onConflict: "reject" }],
  }, {
    rows: [{ login: "A", employee_number: "B", __dataset_id: "dataset-a" }],
    availableFields: new Set(["login", "employee_number"]), datasetSchemas: [{ datasetId: "dataset-a", datasetName: "Conflict", fields: [{ key: "login", dataType: "text" }, { key: "employee_number", dataType: "text" }] }],
    dateField: null, currencyField: null, sourceLabel: "conflict fixture",
  })
  assert.equal(conflicting.preview.activationReady, false, "candidate conflicts fail closed by default")

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
    reconciliation: reconciled.preview,
    posture: "preview-gated; canonical values win; samples not persisted; owner RLS",
  }, null, 2))
  console.log("data mapping profile tests: passed")
}

void main()
