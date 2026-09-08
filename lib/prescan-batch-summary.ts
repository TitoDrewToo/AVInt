export type PrescanBatchState = "accepted" | "quarantined" | "rejected" | "retry_required" | "checking"

export type PrescanBatchSummary = Record<PrescanBatchState, number> & { total: number }

const ACCEPTED_STATUSES = new Set(["approved", "processing", "normalized", "done"])

export function prescanBatchState(uploadStatus: string | null | undefined): PrescanBatchState {
  if (ACCEPTED_STATUSES.has(uploadStatus ?? "")) return "accepted"
  if (uploadStatus === "quarantined") return "quarantined"
  if (uploadStatus === "rejected") return "rejected"
  if (uploadStatus === "scan_failed") return "retry_required"
  return "checking"
}

export function summarizePrescanBatch(files: Array<{ upload_status?: string | null }>): PrescanBatchSummary {
  const summary: PrescanBatchSummary = { accepted: 0, quarantined: 0, rejected: 0, retry_required: 0, checking: 0, total: files.length }
  for (const file of files) summary[prescanBatchState(file.upload_status)] += 1
  return summary
}

export function prescanBatchSummaryText(summary: PrescanBatchSummary) {
  return [
    summary.accepted ? `${summary.accepted} accepted` : "",
    summary.quarantined ? `${summary.quarantined} quarantined` : "",
    summary.rejected ? `${summary.rejected} rejected` : "",
    summary.retry_required ? `${summary.retry_required} retry required` : "",
    summary.checking ? `${summary.checking} still checking` : "",
  ].filter(Boolean).join(" · ")
}
