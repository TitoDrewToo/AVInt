import { supabaseAdmin } from "@/lib/mcp-auth"
import { findOrphanedInboxObjects, type InboxObject } from "@/lib/storage-reconciliation"
import { intendedPrescanTarget, reconcilePrescanStorageState, type PrescanStorageIntent } from "@/lib/prescan-reconciliation"
import { recordPrescanEvent, upsertPrescanNotice, type PrescanOutcome } from "@/supabase/functions/_shared/prescan-lifecycle"

const REFERENCE_BATCH_SIZE = 100
const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1000
const MIN_STALE_HOURS = 1
const PRESCAN_RECONCILER_VERSION = "prescan-reconciler-v1"

export type ReconcileInboxOptions = {
  dryRun?: boolean
  limit?: number
  staleHours?: number
}

export async function reconcileOrphanedInboxObjects(options: ReconcileInboxOptions = {}) {
  const dryRun = options.dryRun ?? true
  const requestedLimit = typeof options.limit === "number" && Number.isFinite(options.limit) ? options.limit : DEFAULT_LIMIT
  const requestedStaleHours = typeof options.staleHours === "number" && Number.isFinite(options.staleHours) ? options.staleHours : MIN_STALE_HOURS
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_LIMIT)
  const staleHours = Math.max(requestedStaleHours, MIN_STALE_HOURS)
  const staleBefore = new Date(Date.now() - staleHours * 60 * 60 * 1000)

  const { data: objects, error: objectsError } = await supabaseAdmin
    .schema("storage")
    .from("objects")
    .select("name, created_at")
    .eq("bucket_id", "documents")
    .like("name", "%/_inbox/%")
    .lt("created_at", staleBefore.toISOString())
    .order("created_at", { ascending: true })
    .limit(limit)

  if (objectsError) throw new Error(objectsError.message)

  const candidates = (objects ?? []) as InboxObject[]
  const referencedPaths = new Set<string>()
  for (let start = 0; start < candidates.length; start += REFERENCE_BATCH_SIZE) {
    const names = candidates.slice(start, start + REFERENCE_BATCH_SIZE).map((object) => object.name)
    const { data: references, error: referenceError } = await supabaseAdmin
      .from("files")
      .select("storage_path")
      .in("storage_path", names)
    if (referenceError) throw new Error(referenceError.message)
    for (const reference of references ?? []) {
      if (typeof reference.storage_path === "string") referencedPaths.add(reference.storage_path)
    }
  }

  const orphaned = findOrphanedInboxObjects(candidates, referencedPaths, staleBefore)
  let deleted = 0
  if (!dryRun && orphaned.length > 0) {
    const { error: deleteError } = await supabaseAdmin.storage.from("documents").remove(orphaned.map((object) => object.name))
    if (deleteError) throw new Error(deleteError.message)
    deleted = orphaned.length
  }

  return {
    dryRun,
    stale_before: staleBefore.toISOString(),
    scanned: candidates.length,
    orphaned: orphaned.length,
    deleted,
    paths: orphaned.map((object) => object.name),
  }
}

type StalePrescanFile = {
  id: string
  user_id: string
  filename: string
  file_size: number | null
  file_type: string | null
  storage_path: string
  document_type: string | null
  upload_status: string
  prescan_claimed_at: string
}

type PrescanEvidenceRow = {
  file_id: string
  correlation_id: string
  event_type: string
  outcome: PrescanOutcome | null
  reason_code: string | null
  safe_reason: string | null
  sha256: string | null
  detected_mime: string | null
  signals: Record<string, unknown> | null
  storage_action_intended: PrescanStorageIntent
  created_at: string
}

async function storagePathsPresent(paths: string[]) {
  if (paths.length === 0) return new Set<string>()
  const uniquePaths = [...new Set(paths)]
  const present = new Set<string>()
  for (let start = 0; start < uniquePaths.length; start += 40) {
    const { data, error } = await supabaseAdmin
      .schema("storage")
      .from("objects")
      .select("name")
      .eq("bucket_id", "documents")
      .in("name", uniquePaths.slice(start, start + 40))
    if (error) throw new Error(error.message)
    for (const row of data ?? []) present.add(row.name)
  }
  return present
}

async function terminalizeProcessingJob(fileId: string, message: string) {
  const { error } = await supabaseAdmin.from("processing_jobs").update({
    status: "failed",
    error_message: message,
    completed_at: new Date().toISOString(),
  }).eq("file_id", fileId).in("status", ["uploaded", "pending_scan", "scanning", "processing"])
  if (error) throw new Error(error.message)
}

export async function reconcileStalePrescans(options: { dryRun?: boolean; staleMinutes?: number; limit?: number } = {}) {
  const dryRun = options.dryRun ?? true
  const staleMinutes = Math.max(Math.floor(options.staleMinutes ?? 30), 15)
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 100), 1), 500)
  const staleBefore = new Date(Date.now() - staleMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from("files")
    .select("id, user_id, filename, file_size, file_type, storage_path, document_type, upload_status, prescan_claimed_at")
    .eq("upload_status", "scanning")
    .not("prescan_claimed_at", "is", null)
    .lt("prescan_claimed_at", staleBefore)
    .order("prescan_claimed_at", { ascending: true })
    .limit(limit)
  if (error) throw new Error(error.message)
  const files = (data ?? []) as StalePrescanFile[]
  if (files.length === 0) return { dryRun, stale_before: staleBefore, scanned: 0, recovered: 0, retry_required: 0, process_invoked: 0, files: [] }

  const fileIds = files.map((file) => file.id)
  const { data: evidenceData, error: evidenceError } = await supabaseAdmin
    .from("prescan_security_events")
    .select("file_id, correlation_id, event_type, outcome, reason_code, safe_reason, sha256, detected_mime, signals, storage_action_intended, created_at")
    .in("file_id", fileIds)
    .order("created_at", { ascending: false })
  if (evidenceError) throw new Error(evidenceError.message)
  const evidenceByFile = new Map<string, PrescanEvidenceRow[]>()
  for (const row of (evidenceData ?? []) as PrescanEvidenceRow[]) {
    const rows = evidenceByFile.get(row.file_id) ?? []
    rows.push(row)
    evidenceByFile.set(row.file_id, rows)
  }

  const targets = files.flatMap((file) => {
    const intent = evidenceByFile.get(file.id)?.find((row) => row.event_type === "prescan.action_intended")?.storage_action_intended ?? null
    const target = intendedPrescanTarget(file.storage_path, file.user_id, intent)
    return target ? [file.storage_path, target] : [file.storage_path]
  })
  const presentPaths = await storagePathsPresent(targets)
  const results: Array<Record<string, unknown>> = []
  let recovered = 0
  let retryRequired = 0

  for (const file of files) {
    const evidence = evidenceByFile.get(file.id) ?? []
    const claimed = evidence.find((row) => row.event_type === "prescan.claimed")
    const intended = evidence.find((row) => row.event_type === "prescan.action_intended")
    const correlationId = intended?.correlation_id ?? claimed?.correlation_id ?? crypto.randomUUID()
    const intent = intended?.storage_action_intended ?? null
    const targetPath = intendedPrescanTarget(file.storage_path, file.user_id, intent)
    const decision = reconcilePrescanStorageState({
      intent,
      sourceExists: presentPaths.has(file.storage_path),
      targetExists: Boolean(targetPath && presentPaths.has(targetPath)),
    })
    if (dryRun) {
      results.push({ file_id: file.id, decision, intent, source_exists: presentPaths.has(file.storage_path), target_exists: Boolean(targetPath && presentPaths.has(targetPath)) })
      continue
    }

    let storageRestored = false
    if (decision === "restore_then_retry" && targetPath) {
      const { error: restoreError } = await supabaseAdmin.storage.from("documents").move(targetPath, file.storage_path)
      if (restoreError) throw new Error(`Could not restore stale prescan object: ${restoreError.message}`)
      storageRestored = true
    }

    const sourceExists = presentPaths.has(file.storage_path) || storageRestored
    const safeReason = sourceExists
      ? "The security check was interrupted before it completed. Retry this file."
      : "The interrupted upload could not be recovered. Remove it and upload the file again."
    const reasonCode = sourceExists ? "runtime_interrupted" : "runtime_storage_missing"
    const { data: updated, error: updateError } = await supabaseAdmin.from("files").update({
      upload_status: "scan_failed",
      prescan_claimed_at: null,
      scan_reason: `${reasonCode}: ${safeReason}`,
    }).eq("id", file.id).eq("upload_status", "scanning").lt("prescan_claimed_at", staleBefore).select("id").maybeSingle()
    if (updateError) throw new Error(updateError.message)
    if (!updated) continue
    await terminalizeProcessingJob(file.id, safeReason)
    if (!intended) {
      await recordPrescanEvent(supabaseAdmin, {
        correlationId,
        accountId: file.user_id,
        fileId: file.id,
        filename: file.filename,
        fileSize: file.file_size,
        declaredMime: file.file_type,
        stage: "storage",
        eventType: "prescan.action_intended",
        outcome: "scan_failed",
        reasonCode,
        safeReason,
        signals: { reconciled_after_runtime_termination: true, storage_restored: storageRestored },
        storageActionIntended: "hold",
        prescanVersion: PRESCAN_RECONCILER_VERSION,
      })
    }
    await recordPrescanEvent(supabaseAdmin, {
      correlationId,
      accountId: file.user_id,
      fileId: file.id,
      filename: file.filename,
      fileSize: file.file_size,
      sha256: intended?.sha256 ?? claimed?.sha256,
      declaredMime: file.file_type,
      detectedMime: intended?.detected_mime ?? claimed?.detected_mime,
      stage: "terminal",
      eventType: "prescan.retry_required",
      outcome: "scan_failed",
      reasonCode,
      safeReason,
      signals: { reconciled_after_runtime_termination: true, prior_intent: intent, storage_restored: storageRestored, source_exists: sourceExists },
      storageActionIntended: intent ?? "hold",
      storageActionCompleted: "held",
      prescanVersion: PRESCAN_RECONCILER_VERSION,
    })
    await upsertPrescanNotice(supabaseAdmin, { accountId: file.user_id, fileId: file.id, outcome: "scan_failed", reasonCode, safeReason })
    retryRequired += 1
    if (storageRestored) recovered += 1
    results.push({ file_id: file.id, decision, outcome: "scan_failed", storage_restored: storageRestored })
  }

  return { dryRun, stale_before: staleBefore, scanned: files.length, recovered, retry_required: retryRequired, files: results }
}
