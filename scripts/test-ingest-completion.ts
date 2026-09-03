import assert from "node:assert/strict"
import { isStableIngestCompletion, type IngestCompletionSnapshot } from "../lib/ingest-completion"

const partial: IngestCompletionSnapshot = {
  records: [
    { id: "parent-1", parent_record_id: null, extraction_id: "extraction-1" },
    { id: "child-1", parent_record_id: "parent-1", extraction_id: "extraction-1" },
  ],
  extractionStatuses: ["succeeded"],
}
const settled: IngestCompletionSnapshot = {
  records: [{ id: "parent-1", parent_record_id: null, extraction_id: "extraction-2" }],
  extractionStatuses: ["succeeded"],
}

assert.equal(isStableIngestCompletion(null, partial), false, "a first partial write must not complete")
assert.equal(isStableIngestCompletion(partial, settled), false, "a changed snapshot must not complete")
assert.equal(isStableIngestCompletion(settled, settled), true, "only a stable settled snapshot completes")
console.log("ingest completion race fixture: partial writes are not reported as complete")
