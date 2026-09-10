import assert from "node:assert/strict"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"

async function main() {
  const { applyDataMappingProfile } = await import("../lib/data-mapping-engine")
  const { applyVirtualDatasetDefinition, combineDatasetCandidates, compileReportDefinition } = await import("../lib/report-definition-engine")
  const { compileDashboardVisual } = await import("../lib/dashboard-visual-engine")

  const candidates = [
    {
      dataset: { id: "dataset-a", name: "Calls", file_id: "file-a", sheet_name: "September" },
      columns: [{ key: "login", data_type: "text" }, { key: "calls", data_type: "number" }, { key: "notes", data_type: "text" }],
      rows: [{ login: "a-1", calls: 10, notes: "irrelevant", __dataset_id: "dataset-a", __dataset_name: "Calls", __sheet_name: "September", __file_id: "file-a", __row_index: 0 }],
    },
    {
      dataset: { id: "dataset-b", name: "Workforce", file_id: "file-b", sheet_name: "Export" },
      columns: [{ key: "employee_number", data_type: "text" }, { key: "call_volume", data_type: "number" }, { key: "team", data_type: "text" }],
      rows: [{ employee_number: "b-2", call_volume: 20, team: "Alpha", __dataset_id: "dataset-b", __dataset_name: "Workforce", __sheet_name: "Export", __file_id: "file-b", __row_index: 0 }],
    },
    {
      dataset: { id: "dataset-c", name: "Operations", file_id: "file-c", sheet_name: "Data" },
      columns: [{ key: "agent_id", data_type: "text" }, { key: "interactions", data_type: "number" }, { key: "attendance_status", data_type: "text" }],
      rows: [{ agent_id: "c-3", interactions: 30, attendance_status: "Present", __dataset_id: "dataset-c", __dataset_name: "Operations", __sheet_name: "Data", __file_id: "file-c", __row_index: 0 }],
    },
  ]
  const exact = combineDatasetCandidates(candidates, "exact")
  assert.equal(exact.compatible.length, 1, "legacy exact unions retain their anchor behavior")
  assert.equal(exact.excluded.length, 2)
  const heterogeneous = combineDatasetCandidates(candidates, "reconcile")
  assert.equal(heterogeneous.compatible.length, 3, "reconciliation loads all owned candidate schemas before mapping")
  assert.equal(heterogeneous.rows.length, 3)
  assert.equal(heterogeneous.availableFields.has("notes"), true, "irrelevant columns remain source evidence but do not determine compatibility")

  const mappings = [
    { targetField: "agent_id", targetType: "text" as const, candidates: [{ sourceField: "agent_id", coercion: "trim" as const }, { sourceField: "employee_number", coercion: "trim" as const }, { sourceField: "login", coercion: "trim" as const }], required: true, onMissing: "reject" as const, onConflict: "reject" as const },
    { targetField: "interaction_count", targetType: "number" as const, candidates: [{ sourceField: "interactions", coercion: "number" as const }, { sourceField: "call_volume", coercion: "number" as const }, { sourceField: "calls", coercion: "number" as const }], required: true, onMissing: "reject" as const, onConflict: "reject" as const },
    { targetField: "team", targetType: "text" as const, candidates: [{ sourceField: "team", coercion: "trim" as const }], required: false, onMissing: "null" as const, onConflict: "reject" as const },
    { targetField: "attendance_status", targetType: "text" as const, candidates: [{ sourceField: "attendance_status", coercion: "trim" as const }], required: false, onMissing: "null" as const, onConflict: "reject" as const },
  ]
  const mapped = applyDataMappingProfile({ slug: "workforce-activity", version: 4, mappings }, {
    ...heterogeneous,
    dateField: null,
    currencyField: null,
    sourceLabel: "heterogeneous folder datasets",
    dependencies: candidates.flatMap((candidate) => [{ kind: "file" as const, id: candidate.dataset.file_id }, { kind: "dataset" as const, id: candidate.dataset.id }]),
  })
  assert.equal(mapped.preview.activationReady, true)
  assert.deepEqual(mapped.source.rows.map((row) => [row.agent_id, row.interaction_count, row.team, row.attendance_status]), [["a-1", 10, null, null], ["b-2", 20, "Alpha", null], ["c-3", 30, null, "Present"]])

  const virtual = applyVirtualDatasetDefinition({
    id: "virtual-id", user_id: "user-id", slug: "workforce-output", title: "Workforce output", description: null,
    source: { kind: "mapping_profile", slug: "workforce-activity" }, scope: null, filters: [],
    fields: ["agent_id", "interaction_count", "team", "attendance_status"], authored_by: "assistant", version: 2,
    archived_at: null, created_at: "", updated_at: "",
  }, { ...mapped.source, dependencies: [...(mapped.source.dependencies ?? []), { kind: "mapping_profile", id: "workforce-activity", version: 4 }] })
  assert.equal("notes" in virtual.rows[0], false, "the virtual projection is the explicit ignore boundary")
  assert.equal(virtual.rows[0].__dataset_id, "dataset-a", "provenance survives projection")

  const reportDefinition = {
    id: "report-id", user_id: "user-id", slug: "workforce-summary", title: "Workforce summary", description: null,
    source: { kind: "virtual_dataset" as const, slug: "workforce-output" }, scope: null, period: { kind: "all" as const }, filters: [],
    blocks: [{ type: "kpi" as const, items: [{ label: "Interactions", metric: { aggregation: "sum" as const, field: "interaction_count" } }] }],
    theme: null, authored_by: "assistant" as const, version: 3, archived_at: null, created_at: "", updated_at: "",
  }
  const report = compileReportDefinition(reportDefinition, { ...virtual, dependencies: [...(virtual.dependencies ?? []), { kind: "virtual_dataset", id: "workforce-output", version: 2 }] }, new Date("2026-09-10T00:00:00Z"))
  assert.equal(report.blocks[0].type, "kpi")
  if (report.blocks[0].type === "kpi") assert.equal(report.blocks[0].items[0].value, "60")
  assert.deepEqual(report.focusedModel?.fields, ["interaction_count"])
  assert.match(report.focusedModel?.dependencyKey ?? "", /mapping_profile:workforce-activity@4/)
  assert.match(report.focusedModel?.dependencyKey ?? "", /virtual_dataset:workforce-output@2/)

  const visual = compileDashboardVisual({
    renderer: "bar-chart", source: { kind: "virtual_dataset", slug: "workforce-output" }, scope: null,
    period: { kind: "all" }, filters: [], dimension: { field: "team" }, metric: { aggregation: "sum", field: "interaction_count" }, limit: 10,
  }, virtual)
  assert.equal(visual.data.reduce((sum, item) => sum + item.value, 0), 60)
  assert.deepEqual(visual.focusedModel.fields, ["interaction_count", "team"])

  console.log(JSON.stringify({ exact: { included: exact.compatible.map((item) => item.dataset.id), excluded: exact.excluded.map((item) => item.dataset.id) }, reconciliation: mapped.preview, projectedRows: virtual.rows, reportKpi: report.blocks[0], focusedModel: report.focusedModel, visual: visual.data }, null, 2))
  console.log("schema reconciliation tests: passed")
}

void main()
