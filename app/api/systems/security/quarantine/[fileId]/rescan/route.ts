import { NextRequest, NextResponse } from "next/server"

import { checkRateLimit } from "@/lib/rate-limit"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { recordSecurityAdminAudit } from "@/lib/security-admin-audit"
import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest, context: { params: Promise<{ fileId: string }> }) {
  const admin = await getSystemAdminUser(bearerToken(request.headers.get("authorization")))
  if (!admin) return NextResponse.json({ error: "System administrator access required" }, { status: 403 })
  if (!(await checkRateLimit("systems-security-action", admin.id, 60, 10))) {
    return NextResponse.json({ error: "Too many security actions" }, { status: 429 })
  }
  const { fileId } = await context.params
  if (!UUID_PATTERN.test(fileId)) return NextResponse.json({ error: "Invalid file identifier" }, { status: 400 })

  try {
    await recordSecurityAdminAudit({ actorUserId: admin.id, action: "quarantine_rescan_state_accessed", fileId })
  } catch {
    return NextResponse.json({ error: "The security evidence access could not be audited" }, { status: 503 })
  }

  const [{ data: file, error: fileError }, { data: retention, error: retentionError }] = await Promise.all([
    supabaseAdmin.from("files").select("id, user_id, filename, storage_path, upload_status").eq("id", fileId).maybeSingle(),
    supabaseAdmin.from("prescan_file_retention").select("status, outcome, bytes_deleted_at, bytes_expires_at, evidence_hold_at").eq("file_id", fileId).maybeSingle(),
  ])
  if (fileError || retentionError) return NextResponse.json({ error: "Could not load quarantine state" }, { status: 500 })
  if (!file || file.upload_status !== "quarantined") return NextResponse.json({ error: "Quarantined file not found" }, { status: 404 })
  if (!retention || retention.status !== "retained" || retention.bytes_deleted_at) {
    return NextResponse.json({ error: "The quarantined bytes are no longer available for re-scan" }, { status: 409 })
  }
  if (retention.evidence_hold_at) {
    return NextResponse.json({ error: "Release the investigation hold before requesting a re-scan" }, { status: 409 })
  }
  const prefix = `${file.user_id}/_quarantine/`
  if (!file.storage_path.startsWith(prefix) || file.storage_path.slice(prefix.length).includes("/")) {
    return NextResponse.json({ error: "Quarantine storage state requires manual review" }, { status: 409 })
  }

  try {
    await recordSecurityAdminAudit({
      actorUserId: admin.id,
      action: "quarantine_rescan_requested",
      fileId,
      metadata: { prior_outcome: retention.outcome, bytes_expires_at: retention.bytes_expires_at },
    })
  } catch {
    return NextResponse.json({ error: "The security action could not be audited" }, { status: 503 })
  }

  const requestedAt = new Date().toISOString()
  const { data: claimedRetention, error: claimError } = await supabaseAdmin.from("prescan_file_retention").update({
    status: "released_to_rescan",
    last_rescan_requested_at: requestedAt,
    updated_at: requestedAt,
  }).eq("file_id", fileId).eq("status", "retained").is("evidence_hold_at", null).select("file_id").maybeSingle()
  if (claimError || !claimedRetention) {
    await recordSecurityAdminAudit({ actorUserId: admin.id, action: "quarantine_rescan_failed", fileId, metadata: { stage: "retention_claim" } }).catch(() => undefined)
    return NextResponse.json({ error: "Quarantine retention changed before re-scan could start" }, { status: 409 })
  }

  const inboxPath = `${file.user_id}/_inbox/${file.storage_path.slice(prefix.length)}`
  const { error: moveError } = await supabaseAdmin.storage.from("documents").move(file.storage_path, inboxPath)
  if (moveError) {
    await supabaseAdmin.from("prescan_file_retention").update({ status: "retained", updated_at: new Date().toISOString() }).eq("file_id", fileId).eq("status", "released_to_rescan")
    await recordSecurityAdminAudit({ actorUserId: admin.id, action: "quarantine_rescan_failed", fileId, metadata: { stage: "storage_move" } }).catch(() => undefined)
    return NextResponse.json({ error: "Quarantined bytes could not be returned to the scan inbox" }, { status: 502 })
  }

  const { data: reset, error: resetError } = await supabaseAdmin.from("files").update({
    storage_path: inboxPath,
    upload_status: "pending_scan",
    prescan_claimed_at: null,
    scan_reason: "admin_rescan_requested: Returned to prescan by a system administrator.",
  }).eq("id", fileId).eq("upload_status", "quarantined").select("id").maybeSingle()
  if (resetError || !reset) {
    await supabaseAdmin.storage.from("documents").move(inboxPath, file.storage_path)
    await supabaseAdmin.from("prescan_file_retention").update({ status: "retained", updated_at: new Date().toISOString() }).eq("file_id", fileId).eq("status", "released_to_rescan")
    await recordSecurityAdminAudit({ actorUserId: admin.id, action: "quarantine_rescan_failed", fileId, metadata: { stage: "state_reset" } }).catch(() => undefined)
    return NextResponse.json({ error: "Quarantine state changed before re-scan could start" }, { status: 409 })
  }

  const { error: jobError } = await supabaseAdmin.from("processing_jobs").insert({ file_id: fileId, status: "uploaded" })
  if (jobError) {
    await recordSecurityAdminAudit({ actorUserId: admin.id, action: "quarantine_rescan_failed", fileId, metadata: { stage: "queue" } }).catch(() => undefined)
    return NextResponse.json({ error: "The file was returned to the inbox but could not be queued; retry its security check" }, { status: 502 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    await recordSecurityAdminAudit({ actorUserId: admin.id, action: "quarantine_rescan_failed", fileId, metadata: { stage: "prescan_configuration" } }).catch(() => undefined)
    return NextResponse.json({ error: "Prescan invocation is not configured" }, { status: 500 })
  }
  const response = await fetch(`${supabaseUrl}/functions/v1/prescan-document`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
    body: JSON.stringify({ file_id: fileId, user_id: file.user_id }),
  }).catch(() => null)
  if (!response?.ok) {
    await recordSecurityAdminAudit({ actorUserId: admin.id, action: "quarantine_rescan_failed", fileId, metadata: { stage: "prescan_invocation" } }).catch(() => undefined)
    return NextResponse.json({ error: "The file is safely held in the scan inbox; retry the security check" }, { status: 502 })
  }
  await recordSecurityAdminAudit({ actorUserId: admin.id, action: "quarantine_rescan_started", fileId, metadata: { prior_outcome: retention.outcome } }).catch((error) => {
    console.error("quarantine re-scan completion audit failed", { fileId, error: error instanceof Error ? error.message : String(error) })
  })
  return NextResponse.json({ started: true, file_id: fileId, filename: file.filename })
}
