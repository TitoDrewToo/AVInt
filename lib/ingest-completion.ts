export type IngestRecordSnapshot = {
  id: string
  parent_record_id: string | null
  extraction_id: string | null
}

export type IngestCompletionSnapshot = {
  uploadStatus: string | null
  records: IngestRecordSnapshot[]
  extractionStatuses: string[]
}

// Only an explicitly failed extraction is terminal. In-flight statuses such
// as "processing" must remain eligible for the poll to observe completion.
export const TERMINAL_EXTRACTION_FAILURE_STATUSES = new Set(["failed"])

export function isTerminalExtractionFailure(status: string) {
  return TERMINAL_EXTRACTION_FAILURE_STATUSES.has(status)
}

export function isIngestComplete(snapshot: IngestCompletionSnapshot) {
  if (snapshot.records.length === 0) return false
  if (snapshot.uploadStatus !== "normalized") return false
  if (snapshot.records.some((record) => !record.extraction_id)) return false
  if (snapshot.extractionStatuses.length === 0) return false
  return snapshot.extractionStatuses.every((status) => status === "succeeded")
}

export function hasSettledNormalization(expected: number | null, settled: number) {
  return expected !== null && settled >= expected
}
