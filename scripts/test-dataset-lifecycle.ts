import assert from "node:assert/strict"
import fs from "node:fs"
import { vanishedDatasetIds } from "../supabase/functions/_shared/dataset-layer"

const prior = [
  { id: "stable-summary", sheet_name: "Summary" },
  { id: "vanished-detail", sheet_name: "Detail" },
  { id: "stable-default", sheet_name: null },
]
const current = [{ sheet_name: "Summary" }, { sheet_name: null }]

assert.deepEqual(vanishedDatasetIds(prior, current), ["vanished-detail"], "only sheets missing from the current derivation are archived")
assert.deepEqual(vanishedDatasetIds(prior, prior.map((dataset) => ({ sheet_name: dataset.sheet_name }))), [], "unchanged sheets preserve every stable dataset id")

const migration = fs.readFileSync("supabase/migrations/20260910120000_add_dataset_current_lifecycle.sql", "utf8")
assert.match(migration, /add column if not exists archived_at timestamptz/i)
assert.match(migration, /where archived_at is null/i)

const implementation = fs.readFileSync("supabase/functions/_shared/dataset-layer.ts", "utf8")
assert.match(implementation, /onConflict: "file_id,sheet_name"/)
assert.match(implementation, /archived_at: null/)
assert.match(implementation, /vanished dataset archive/)

console.log(JSON.stringify({ priorIds: prior.map((dataset) => dataset.id), currentSheets: current.map((sheet) => sheet.sheet_name), archivedIds: vanishedDatasetIds(prior, current), stableIds: ["stable-summary", "stable-default"] }, null, 2))
console.log("dataset lifecycle tests: passed")
