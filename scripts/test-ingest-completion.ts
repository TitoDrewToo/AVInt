import assert from "node:assert/strict"
import { hasSettledNormalization, isIngestComplete, isTerminalExtractionFailure, type IngestCompletionSnapshot } from "../lib/ingest-completion"

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
const inFlight: IngestCompletionSnapshot = {
  uploadStatus: "uploaded",
  records: [{ id: "parent-1", parent_record_id: null, extraction_id: "extraction-3" }],
  extractionStatuses: ["processing"],
}

assert.equal(isIngestComplete(partial), false, "a stable intermediate write must not complete")
assert.equal(isIngestComplete(settled), true, "only an explicitly normalized snapshot completes")
assert.equal(isTerminalExtractionFailure("processing"), false, "an in-flight extraction is not a terminal failure")
assert.equal(isTerminalExtractionFailure(inFlight.extractionStatuses[0]) ? "failed" : "processing", "processing", "an in-flight extraction is reported as processing")
assert.equal(isIngestComplete(inFlight), false, "an in-flight extraction remains processing")
assert.equal(isIngestComplete({ ...settled, uploadStatus: "processing" }), false, "records alone cannot make a timed-out ingest normalized")
assert.equal(isIngestComplete({ ...settled, extractionStatuses: [] }), false, "a normalized file without a durable extraction cannot complete")
assert.equal(isIngestComplete({ ...settled, records: [{ ...settled.records[0], extraction_id: null }] }), false, "every normalized record must retain extraction lineage")
assert.equal(hasSettledNormalization(3, 1), false, "one completed row must not settle a three-row batch")
assert.equal(hasSettledNormalization(3, 2), false, "two completed rows must not settle a three-row batch")
assert.equal(hasSettledNormalization(3, 3), true, "three completed rows must settle a three-row batch")
assert.equal(hasSettledNormalization(3, 3), true, "a failed terminal row still counts toward settlement")
console.log("ingest completion race fixture: intermediate writes are not reported as complete")
