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

export function isIngestComplete(snapshot: IngestCompletionSnapshot) {
  if (snapshot.records.length === 0) return false
  if (snapshot.uploadStatus !== "normalized") return false
  return snapshot.extractionStatuses.every((status) => status === "succeeded")
}

export function hasSettledNormalization(expected: number | null, settled: number) {
  return expected !== null && settled >= expected
}
