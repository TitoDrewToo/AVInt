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
  const body = await request.json().catch(() => null) as { hold?: unknown; reason?: unknown } | null
  if (typeof body?.hold !== "boolean") return NextResponse.json({ error: "hold must be true or false" }, { status: 400 })
  const reason = typeof body.reason === "string" ? body.reason.trim() : ""
  if (body.hold && (reason.length < 3 || reason.length > 500)) {
    return NextResponse.json({ error: "A hold reason between 3 and 500 characters is required" }, { status: 400 })
  }

  try {
    await recordSecurityAdminAudit({ actorUserId: admin.id, action: "quarantine_hold_state_accessed", fileId, metadata: { requested_hold: body.hold } })
  } catch {
    return NextResponse.json({ error: "The security evidence access could not be audited" }, { status: 503 })
  }

  const { data: retention, error: loadError } = await supabaseAdmin
    .from("prescan_file_retention")
    .select("file_id, outcome, status, evidence_hold_at")
    .eq("file_id", fileId)
    .maybeSingle()
  if (loadError) return NextResponse.json({ error: "Could not load quarantine retention" }, { status: 500 })
  if (!retention || retention.status !== "retained") {
    return NextResponse.json({ error: "Retained quarantine evidence was not found" }, { status: 409 })
  }
  if (body.hold === Boolean(retention.evidence_hold_at)) {
    return NextResponse.json({ held: body.hold, file_id: fileId })
  }

  const action = body.hold ? "quarantine_evidence_hold_placed" : "quarantine_evidence_hold_released"
  try {
    await recordSecurityAdminAudit({
      actorUserId: admin.id,
      action: `${action}_intended`,
      fileId,
      metadata: { outcome: retention.outcome, ...(body.hold ? { reason } : {}) },
    })
  } catch {
    return NextResponse.json({ error: "The security action could not be audited" }, { status: 503 })
  }

  const now = new Date().toISOString()
  let updateQuery = supabaseAdmin
    .from("prescan_file_retention")
    .update(body.hold ? {
      evidence_hold_at: now,
      evidence_hold_by: admin.id,
      evidence_hold_reason: reason,
      updated_at: now,
    } : {
      evidence_hold_at: null,
      evidence_hold_by: null,
      evidence_hold_reason: null,
      updated_at: now,
    })
    .eq("file_id", fileId)
    .eq("status", "retained")
  updateQuery = body.hold
    ? updateQuery.is("evidence_hold_at", null)
    : updateQuery.eq("evidence_hold_at", retention.evidence_hold_at)
  const { data: updated, error: updateError } = await updateQuery
    .select("file_id")
    .maybeSingle()
  if (updateError || !updated) {
    await recordSecurityAdminAudit({ actorUserId: admin.id, action: `${action}_failed`, fileId }).catch(() => undefined)
    return NextResponse.json({ error: "Quarantine retention changed before the hold could be updated" }, { status: 409 })
  }

  await recordSecurityAdminAudit({
    actorUserId: admin.id,
    action,
    fileId,
    metadata: { outcome: retention.outcome, ...(body.hold ? { reason } : {}) },
  }).catch((error) => {
    console.error("quarantine hold completion audit failed", { fileId, error: error instanceof Error ? error.message : String(error) })
  })
  return NextResponse.json({ held: body.hold, file_id: fileId })
}
