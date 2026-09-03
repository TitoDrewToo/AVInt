export type IngestRecordSnapshot = {
  id: string
  parent_record_id: string | null
  extraction_id: string | null
}

export type IngestCompletionSnapshot = {
  records: IngestRecordSnapshot[]
  extractionStatuses: string[]
}

function signature(snapshot: IngestCompletionSnapshot) {
  return JSON.stringify({
    records: snapshot.records
      .map((record) => [record.id, record.parent_record_id, record.extraction_id])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    extractionStatuses: [...snapshot.extractionStatuses].sort(),
  })
}

export function isStableIngestCompletion(previous: IngestCompletionSnapshot | null, current: IngestCompletionSnapshot) {
  if (current.records.length === 0) return false
  if (current.extractionStatuses.some((status) => status !== "succeeded")) return false
  return previous !== null && signature(previous) === signature(current)
}
