import { NextRequest, NextResponse } from "next/server"

import { checkRateLimit } from "@/lib/rate-limit"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { recordSecurityAdminAudit } from "@/lib/security-admin-audit"
import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"

const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000

function dateParam(value: string | null, fallback: Date) {
  if (!value) return fallback
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

export async function GET(request: NextRequest) {
  const admin = await getSystemAdminUser(bearerToken(request.headers.get("authorization")))
  if (!admin) return NextResponse.json({ error: "System administrator access required" }, { status: 403 })
  if (!(await checkRateLimit("systems-security", admin.id, 60, 10))) {
    return NextResponse.json({ error: "Too many security exports" }, { status: 429 })
  }
  const to = dateParam(request.nextUrl.searchParams.get("to"), new Date())
  const from = dateParam(request.nextUrl.searchParams.get("from"), new Date((to?.getTime() ?? Date.now()) - 30 * 24 * 60 * 60 * 1000))
  if (!from || !to || to.getTime() < from.getTime() || to.getTime() - from.getTime() > MAX_WINDOW_MS) {
    return NextResponse.json({ error: "Export window must be a valid range of 31 days or less" }, { status: 400 })
  }
  try {
    await recordSecurityAdminAudit({ actorUserId: admin.id, action: "security_evidence_exported", metadata: { from: from.toISOString(), to: to.toISOString() } })
  } catch {
    return NextResponse.json({ error: "Security evidence export could not be audited" }, { status: 503 })
  }
  const [{ data, error }, { data: adminAudit, error: adminAuditError }] = await Promise.all([
    supabaseAdmin
      .from("prescan_security_events")
      .select("id, correlation_id, account_id, file_id, filename, file_size, sha256, declared_mime, detected_mime, stage, event_type, outcome, reason_code, safe_reason, signals, prescan_version, ai_provider, ai_model, duration_ms, storage_action_intended, storage_action_completed, created_at, sealed_at, previous_event_hash, canonical_payload, event_hash")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(5000),
    supabaseAdmin
      .from("prescan_admin_audit_events")
      .select("id, actor_user_id, action, file_id, correlation_id, metadata, created_at, sealed_at, previous_event_hash, canonical_payload, event_hash")
      .gte("created_at", from.toISOString())
      .lte("created_at", to.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(5000),
  ])
  if (error || adminAuditError) return NextResponse.json({ error: "Could not export Smart Security evidence" }, { status: 500 })
  const events = data ?? []
  const adminAuditEvents = adminAudit ?? []
  const payload = {
    format: "avint-prescan-evidence-v1",
    generated_at: new Date().toISOString(),
    window: { from: from.toISOString(), to: to.toISOString() },
    truncated: events.length === 5000 || adminAuditEvents.length === 5000,
    assurance: "Database-sealed evidence; external signed checkpointing and legal process review are not yet complete.",
    verification: "npx tsx scripts/verify-prescan-evidence.ts <export.json>",
    events,
    admin_audit_events: adminAuditEvents,
  }
  const stamp = new Date().toISOString().slice(0, 10)
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="avint-prescan-evidence-${stamp}.json"`,
    },
  })
}
