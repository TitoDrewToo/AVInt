import assert from "node:assert/strict"

import { prescanBatchState, prescanBatchSummaryText, summarizePrescanBatch } from "../lib/prescan-batch-summary"

assert.equal(prescanBatchState("approved"), "accepted")
assert.equal(prescanBatchState("processing"), "accepted")
assert.equal(prescanBatchState("normalized"), "accepted")
assert.equal(prescanBatchState("done"), "accepted")
assert.equal(prescanBatchState("quarantined"), "quarantined")
assert.equal(prescanBatchState("rejected"), "rejected")
assert.equal(prescanBatchState("scan_failed"), "retry_required")
assert.equal(prescanBatchState("scanning"), "checking")

const summary = summarizePrescanBatch([
  { upload_status: "done" },
  { upload_status: "approved" },
  { upload_status: "quarantined" },
  { upload_status: "rejected" },
  { upload_status: "scan_failed" },
  { upload_status: "scanning" },
])
assert.deepEqual(summary, { accepted: 2, quarantined: 1, rejected: 1, retry_required: 1, checking: 1, total: 6 })
assert.equal(prescanBatchSummaryText(summary), "2 accepted · 1 quarantined · 1 rejected · 1 retry required · 1 still checking")

console.log("prescan batch summary: passed", JSON.stringify(summary))
