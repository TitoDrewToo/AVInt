import assert from "node:assert/strict"

import { summarizeDataModelRecords, type DataModelStatRecord } from "../lib/data-model-stats"

const row = (overrides: Partial<DataModelStatRecord> = {}): DataModelStatRecord => ({
  status: "derived",
  needs_review: false,
  excluded_at: null,
  has_user_edits: false,
  parent_record_id: null,
  ...overrides,
})

const fixture = [
  ...Array.from({ length: 25 }, () => row({ needs_review: true })),
  ...Array.from({ length: 44 }, () => row()),
  ...Array.from({ length: 111 }, () => row({ excluded_at: "2026-09-01T00:00:00Z" })),
]
fixture[0] = row({ needs_review: true, has_user_edits: true })
fixture[1] = row({ needs_review: true, has_user_edits: true, parent_record_id: "parent" })

const result = summarizeDataModelRecords(fixture)
assert.equal(fixture.filter((record) => record.needs_review && record.excluded_at === null).length, 25)
assert.equal(result.stats.needsReview, 25, "the tile must equal the full active SQL-equivalent count, not a 40-row page")
assert.equal(result.stats.activeRecords, 69)
assert.equal(result.stats.excludedRecords, 111)
assert.equal(result.stats.userEdited, 2)
assert.equal(result.stats.lineItems, 1)
assert.equal(result.statusCounts.derived, 180)

console.log("data model stats: full-result counts match the seeded SQL-equivalent fixture")
