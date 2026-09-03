import assert from "node:assert/strict"
import { hasSettledNormalization, isIngestComplete, type IngestCompletionSnapshot } from "../lib/ingest-completion"

const partial: IngestCompletionSnapshot = {
  uploadStatus: "processing",
  records: [
    { id: "parent-1", parent_record_id: null, extraction_id: "extraction-1" },
    { id: "child-1", parent_record_id: "parent-1", extraction_id: "extraction-1" },
  ],
  extractionStatuses: ["succeeded"],
}
const settled: IngestCompletionSnapshot = {
  uploadStatus: "normalized",
  records: [{ id: "parent-1", parent_record_id: null, extraction_id: "extraction-2" }],
  extractionStatuses: ["succeeded"],
}

assert.equal(isIngestComplete(partial), false, "a stable intermediate write must not complete")
assert.equal(isIngestComplete(settled), true, "only an explicitly normalized snapshot completes")
assert.equal(hasSettledNormalization(3, 1), false, "one completed row must not settle a three-row batch")
assert.equal(hasSettledNormalization(3, 2), false, "two completed rows must not settle a three-row batch")
assert.equal(hasSettledNormalization(3, 3), true, "three completed rows must settle a three-row batch")
assert.equal(hasSettledNormalization(3, 3), true, "a failed terminal row still counts toward settlement")
console.log("ingest completion race fixture: intermediate writes are not reported as complete")
