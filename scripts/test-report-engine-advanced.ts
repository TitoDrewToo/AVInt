import assert from "node:assert/strict"
import Module from "node:module"
import path from "node:path"

process.env.NEXT_PUBLIC_SUPABASE_URL ||= "http://127.0.0.1:54321"
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key"

const resolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "@react-pdf/hyphenate/en-us") return path.resolve("node_modules/.pnpm/@react-pdf+hyphenate@0.1.0/node_modules/@react-pdf/hyphenate/lib/en-us.js")
  return resolveFilename.call(this, request, parent, isMain, options)
}

async function main() {
const { compileReportDefinition } = await import("../lib/report-definition-engine")
const { validateReportDefinitionPayload } = await import("../lib/report-definitions")
const { renderReportPdf } = await import("../lib/report-pdf")

const definition: any = {
  id: "definition", user_id: "user", slug: "fixture", authored_by: "user", version: 1,
  archived_at: null, created_at: "2026-09-01", updated_at: "2026-09-01",
  title: "Fixture report", description: null, source: { kind: "dataset", datasetId: "00000000-0000-0000-0000-000000000001", dateField: "day" }, scope: null,
  period: { kind: "fixed", from: "2026-09-01", to: "2026-09-04" }, filters: [], theme: { accent: "#c8402c", client: { name: "Fixture Client" } },
  blocks: [
    { type: "kpi", items: [
      { label: "Rows", metric: { aggregation: "count", field: "path" } },
      { label: "Distinct paths", metric: { aggregation: "count_distinct", field: "path" } },
    ] },
    { type: "series", title: "Daily views", timeField: "day", bucket: "day", metric: { aggregation: "sum", field: "views" } },
    { type: "comparison", title: "Previous period", against: "previous_period", items: [{ label: "Views", metric: { aggregation: "sum", field: "views" } }] },
    { type: "stat", title: "Views per visitor", metric: { aggregation: "ratio", numerator: "views", denominator: "visitors", onZero: "null" } },
  ],
}

const rows = [
  { day: "2026-08-28", path: "/", views: 2, visitors: 1 },
  { day: "2026-08-29", path: "/", views: 4, visitors: 2 },
  { day: "2026-08-30", path: "/shop", views: 5, visitors: 3 },
  { day: "2026-08-31", path: "/", views: 6, visitors: 3 },
  { day: "2026-09-01", path: "/", views: 10, visitors: 5 },
  { day: "2026-09-02", path: "/shop", views: 3, visitors: 3 },
  { day: "2026-09-03", path: "/", views: 6, visitors: 3 },
  { day: "2026-09-04", path: "/shop", views: 2, visitors: 2 },
]
const source = { rows, availableFields: new Set(["day", "path", "views", "visitors"]), dateField: "day", currencyField: null, sourceLabel: "local fixture" }
const document = compileReportDefinition(definition, source, new Date("2026-09-04T00:00:00Z"))
const kpi = document.blocks.find((block) => block.type === "kpi")
assert.equal(kpi?.type, "kpi")
assert.deepEqual(kpi?.items.map((item) => item.value), ["4", "2"])
const series = document.blocks.find((block) => block.type === "series")
assert.equal(series?.type, "series")
assert.equal(series?.points.length, 4)
assert.equal(series?.gaps, 0)
const splitDefinition = { ...definition, blocks: [{ type: "series" as const, title: "By channel", timeField: "day", bucket: "day" as const, splitBy: "channel", limit: 1, metric: { aggregation: "sum" as const, field: "views" } }] }
const splitRows = rows.map((row, index) => ({ ...row, channel: index % 2 ? "Direct" : "Search" }))
const splitDocument = compileReportDefinition(splitDefinition, { ...source, rows: splitRows, availableFields: new Set([...source.availableFields, "channel"]) }, new Date("2026-09-04T00:00:00Z"))
const splitSeries = splitDocument.blocks[0]
assert.equal(splitSeries.type, "series")
assert.equal(splitSeries.series?.length, 1)
const comparison = document.blocks.find((block) => block.type === "comparison")
assert.equal(comparison?.type, "comparison")
assert.equal(comparison?.items[0]?.direction, "up")
const ratio = document.blocks.find((block) => block.type === "stat")
assert.equal(ratio?.type, "stat")
assert.equal(ratio?.value, "1.62")

const allPeriod = { ...definition, period: { kind: "all" }, blocks: [definition.blocks[2]] }
assert.throws(() => compileReportDefinition(allPeriod, source), /Comparison blocks require/)
assert.equal(validateReportDefinitionPayload({ ...definition, source: { kind: "dataset", folderId: "00000000-0000-0000-0000-000000000002" } }).ok, true)
assert.equal(validateReportDefinitionPayload({ ...definition, blocks: [{ type: "kpi", items: [{ label: "Bad", metric: { aggregation: "count_distinct" } }] }] }).ok, false)
const pdf = await renderReportPdf(document)
assert.equal(pdf.subarray(0, 5).toString(), "%PDF-")
console.log(JSON.stringify({
  kpi: kpi?.type === "kpi" ? kpi.items : null,
  series: series?.type === "series" ? { points: series.points, gaps: series.gaps } : null,
  comparison: comparison?.type === "comparison" ? comparison.items : null,
  ratio: ratio?.type === "stat" ? ratio.value : null,
  pdfBytes: pdf.length,
}, null, 2))
console.log("advanced report engine tests: passed")
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
