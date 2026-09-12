import assert from "node:assert/strict"

// Real Supabase query builder against a capped fake PostgREST transport.
// Never contact a database or provider from this test.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://avint-fixture.invalid"
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key"
const fixtureRows = Array.from({ length: 1105 }, (_, i) => ({ row_index: i, data: { amount: i + 1 } }))
const tables: Record<string, any[]> = {
  folders: Array.from({ length: 1105 }, (_, i) => ({ id: `folder-${i}`, parent_id: null })),
  files: [{ id: "file-1", filename: "fixture.csv", folder_id: "folder-1104" }],
  datasets: [{ id: "dataset-1", name: "Fixture", file_id: "file-1", sheet_name: "Sheet1", updated_at: "2026-09-12", files: { folder_id: "folder-1104", filename: "fixture.csv" } }],
  dataset_columns: [{ key: "amount", data_type: "number" }],
  dataset_rows: fixtureRows,
  records: fixtureRows.map((row, i) => ({ id: `record-${i}`, file_id: "file-1", amount: i + 1, occurred_on: "2026-09-01", files: { filename: "fixture.csv", folder_id: "folder-1104", document_type: "csv_export" } })),
  record_attributes: fixtureRows.map((row, i) => ({ record_id: `record-${i}`, field_key: "custom_metric", value: i + 1 })),
}
let calls = 0
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url)
  assert.equal(url.origin, "https://avint-fixture.invalid")
  const table = url.pathname.split("/").at(-1)!
  assert.ok(tables[table], `Unexpected table ${table}`)
  assert.equal(url.searchParams.get("user_id"), "eq.owner", `Owner filter on ${table}`)
  assert.ok(url.searchParams.get("order"), `Stable ordering on ${table}`)
  assert.ok(new Headers(init?.headers).get("prefer")?.includes("count=exact"))
  const offset = Number(url.searchParams.get("offset") ?? 0)
  const requested = Number(url.searchParams.get("limit") ?? 1000)
  const data = tables[table].slice(offset, offset + Math.min(requested, 100))
  calls++
  return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json", "Content-Range": `${offset}-${offset + data.length - 1}/${tables[table].length}` } })
}
async function main() {
  const { loadReportDefinitionSource } = await import("../lib/report-definition-engine")
  const { resolveReportFolderScope } = await import("../lib/report-folder-scope-server")
  assert.deepEqual(await resolveReportFolderScope("owner", "folder-1104"), { folderIds: ["folder-1104"] })
  const base: any = { period: { kind: "all" }, blocks: [] }
  const dataset = await loadReportDefinitionSource("owner", { ...base, source: { kind: "dataset", datasetId: "dataset-1" } })
  assert.equal(dataset.rows.length, 1105)
  assert.equal(dataset.rows[1104].amount, 1105)
  const records = await loadReportDefinitionSource("owner", { ...base, source: { kind: "records" } })
  assert.equal(records.rows.length, 1105)
  assert.equal(records.rows[1104].custom_metric, 1105)
  tables.dataset_rows = Array.from({ length: 5001 }, (_, i) => ({ row_index: i, data: { amount: 1 } }))
  await assert.rejects(loadReportDefinitionSource("owner", { ...base, source: { kind: "dataset", datasetId: "dataset-1" } }), /exceeds limit/)
  console.log(`Report loader tests passed: server cap, 1105 rows/attributes/folders, over-limit rejection (${calls} requests)`)
}
void main()
