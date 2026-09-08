export type PrescanOutcome = "approved" | "quarantined" | "rejected" | "scan_failed"

export type PrescanEventType =
  | "prescan.requested"
  | "prescan.claimed"
  | "prescan.validation_completed"
  | "prescan.suitability_completed"
  | "prescan.action_intended"
  | "prescan.approved"
  | "prescan.quarantined"
  | "prescan.rejected"
  | "prescan.retry_required"

export const PRESCAN_VERSION = "native-v2"
export const CLAIMABLE_PRESCAN_STATUSES = ["pending_scan", "scan_failed"] as const

const QUARANTINE_CODES = new Set([
  "known_quarantined_hash",
  "pdf_active_content",
  "csv_formula_cell",
  "xlsx_active_content",
  "xlsx_archive_bomb",
  "xlsx_unsafe_path",
  "invalid_inbox_path",
  "abuse_content",
])

export function outcomeForRejection(code: string): Extract<PrescanOutcome, "quarantined" | "rejected"> {
  return QUARANTINE_CODES.has(code) ? "quarantined" : "rejected"
}

export function terminalEventForOutcome(outcome: PrescanOutcome): PrescanEventType {
  if (outcome === "scan_failed") return "prescan.retry_required"
  return `prescan.${outcome}` as PrescanEventType
}

export async function claimPrescanFile(client: any, fileId: string, accountId: string) {
  const { data, error } = await client
    .from("files")
    .update({ upload_status: "scanning", prescan_claimed_at: new Date().toISOString() })
    .eq("id", fileId)
    .eq("user_id", accountId)
    .in("upload_status", [...CLAIMABLE_PRESCAN_STATUSES])
    .select("*")
    .maybeSingle()
  if (error) throw new Error(`Prescan claim failed: ${error.message ?? "unknown database error"}`)
  return data ?? null
}

export async function recordPrescanEvent(client: any, event: {
  correlationId: string
  accountId: string
  fileId: string
  filename: string
  fileSize?: number | null
  sha256?: string | null
  declaredMime?: string | null
  detectedMime?: string | null
  stage: string
  eventType: PrescanEventType
  outcome?: PrescanOutcome | null
  reasonCode?: string | null
  safeReason?: string | null
  signals?: Record<string, unknown>
  aiProvider?: string | null
  aiModel?: string | null
  durationMs?: number | null
  storageActionIntended?: "approve" | "quarantine" | "hold" | null
  storageActionCompleted?: "approved" | "quarantined" | "held" | null
  prescanVersion?: string
}) {
  const { error } = await client.from("prescan_security_events").insert({
    correlation_id: event.correlationId,
    account_id: event.accountId,
    file_id: event.fileId,
    filename: event.filename,
    file_size: event.fileSize ?? null,
    sha256: event.sha256 ?? null,
    declared_mime: event.declaredMime ?? null,
    detected_mime: event.detectedMime ?? null,
    stage: event.stage,
    event_type: event.eventType,
    outcome: event.outcome ?? null,
    reason_code: event.reasonCode ?? null,
    safe_reason: event.safeReason ?? null,
    signals: event.signals ?? {},
    prescan_version: event.prescanVersion ?? PRESCAN_VERSION,
    ai_provider: event.aiProvider ?? null,
    ai_model: event.aiModel ?? null,
    duration_ms: event.durationMs ?? null,
    storage_action_intended: event.storageActionIntended ?? null,
    storage_action_completed: event.storageActionCompleted ?? null,
  })
  if (error) throw new Error(`Prescan evidence write failed: ${error.message ?? "unknown database error"}`)
}

export async function upsertPrescanNotice(client: any, notice: {
  accountId: string
  fileId: string
  outcome: Exclude<PrescanOutcome, "approved">
  reasonCode: string
  safeReason: string
}) {
  const { error } = await client.from("prescan_rejection_notices").upsert({
    account_id: notice.accountId,
    file_id: notice.fileId,
    outcome: notice.outcome,
    reason_code: notice.reasonCode,
    safe_reason: notice.safeReason,
    dismissed_at: null,
    resolved_at: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "file_id" })
  if (error) throw new Error(`Prescan notice write failed: ${error.message ?? "unknown database error"}`)
}

export async function resolvePrescanNotice(client: any, fileId: string, accountId: string) {
  const { error } = await client.from("prescan_rejection_notices").update({
    resolved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("file_id", fileId).eq("account_id", accountId).is("resolved_at", null)
  if (error) throw new Error(`Prescan notice resolution failed: ${error.message ?? "unknown database error"}`)
}
