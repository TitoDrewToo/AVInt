export type DataModelStatRecord = {
  status: string
  needs_review: boolean
  excluded_at: string | null
  has_user_edits: boolean
  parent_record_id: string | null
}

export function summarizeDataModelRecords(rows: DataModelStatRecord[]) {
  const statusCounts: Record<string, number> = {}
  for (const row of rows) statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1
  return {
    statusCounts,
    stats: {
      activeRecords: rows.filter((row) => row.excluded_at === null).length,
      excludedRecords: rows.filter((row) => row.excluded_at !== null).length,
      needsReview: rows.filter((row) => row.needs_review && row.excluded_at === null).length,
      userEdited: rows.filter((row) => row.has_user_edits).length,
      lineItems: rows.filter((row) => row.parent_record_id !== null).length,
    },
  }
}
