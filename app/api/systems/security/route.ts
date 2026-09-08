import { NextRequest, NextResponse } from "next/server"

import { checkRateLimit } from "@/lib/rate-limit"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TERMINAL_EVENTS = new Set(["prescan.approved", "prescan.quarantined", "prescan.rejected", "prescan.retry_required"])

export async function GET(request: NextRequest) {
  const admin = await getSystemAdminUser(bearerToken(request.headers.get("authorization")))
  if (!admin) return NextResponse.json({ error: "System administrator access required" }, { status: 403 })
  if (!(await checkRateLimit("systems-security", admin.id, 60, 60))) {
    return NextResponse.json({ error: "Too many security-console requests" }, { status: 429 })
  }

  const correlationId = request.nextUrl.searchParams.get("correlation_id")
  if (correlationId) {
    if (!UUID_PATTERN.test(correlationId)) return NextResponse.json({ error: "Invalid correlation identifier" }, { status: 400 })
    const { data, error } = await supabaseAdmin
      .from("prescan_security_events")
      .select("id, correlation_id, account_id, file_id, filename, file_size, sha256, declared_mime, detected_mime, stage, event_type, outcome, reason_code, safe_reason, signals, prescan_version, ai_provider, ai_model, duration_ms, storage_action_intended, storage_action_completed, created_at")
      .eq("correlation_id", correlationId)
      .order("created_at", { ascending: true })
      .limit(20)
    if (error) return NextResponse.json({ error: "Could not load the prescan timeline" }, { status: 500 })
    return NextResponse.json({ correlationId, events: data ?? [] }, { headers: { "Cache-Control": "no-store" } })
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: events, error: eventsError }, { data: blockedFiles, count: unresolvedFileCount, error: filesError }, { count: openNotices, error: noticesError }] = await Promise.all([
    supabaseAdmin
      .from("prescan_security_events")
      .select("id, correlation_id, account_id, file_id, filename, file_size, sha256, declared_mime, detected_mime, stage, event_type, outcome, reason_code, safe_reason, signals, prescan_version, ai_provider, ai_model, duration_ms, storage_action_intended, storage_action_completed, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000),
    supabaseAdmin
      .from("files")
      .select("id, user_id, filename, file_type, file_size, upload_status, scan_reason, sha256, scanned_at, prescan_claimed_at", { count: "exact" })
      .in("upload_status", ["quarantined", "rejected", "scan_failed", "scanning"])
      .order("created_at", { ascending: false })
      .limit(250),
    supabaseAdmin
      .from("prescan_rejection_notices")
      .select("id", { count: "exact", head: true })
      .is("dismissed_at", null)
      .is("resolved_at", null),
  ])
  if (eventsError || filesError || noticesError) {
    return NextResponse.json({ error: "Could not load Smart Security evidence" }, { status: 500 })
  }

  const rows = events ?? []
  const terminal = rows.filter((event) => TERMINAL_EVENTS.has(event.event_type))
  const claimed = rows.filter((event) => event.event_type === "prescan.claimed")
  const intended = rows.filter((event) => event.event_type === "prescan.action_intended")
  const terminalCorrelations = new Set(terminal.map((event) => event.correlation_id))
  const incomplete = intended.filter((event) => !terminalCorrelations.has(event.correlation_id))
  const counts = { approved: 0, quarantined: 0, rejected: 0, scan_failed: 0 }
  const reasons = new Map<string, number>()
  for (const event of terminal) {
    if (event.outcome && event.outcome in counts) counts[event.outcome as keyof typeof counts] += 1
    if (event.reason_code) reasons.set(event.reason_code, (reasons.get(event.reason_code) ?? 0) + 1)
  }

  const hashes = new Map<string, { attempts: number; accounts: Set<string>; lastSeen: string }>()
  for (const event of terminal) {
    if (!event.sha256) continue
    const entry = hashes.get(event.sha256) ?? { attempts: 0, accounts: new Set<string>(), lastSeen: event.created_at }
    entry.attempts += 1
    entry.accounts.add(event.account_id)
    if (event.created_at > entry.lastSeen) entry.lastSeen = event.created_at
    hashes.set(event.sha256, entry)
  }

  const claimedCorrelations = new Set(claimed.map((event) => event.correlation_id))
  const completedClaimedCorrelations = new Set(terminal.filter((event) => claimedCorrelations.has(event.correlation_id)).map((event) => event.correlation_id))
  const latestApproved = terminal.find((event) => event.event_type === "prescan.approved") ?? null
  const activePrescan = rows.find((event) => !event.prescan_version.startsWith("prescan-reconciler")) ?? null
  return NextResponse.json({
    window: { from: since, eventLimit: 1000, truncated: rows.length === 1000 },
    posture: {
      counts,
      claimed: claimed.length,
      evidenceCoverage: claimedCorrelations.size === 0 ? null : completedClaimedCorrelations.size / claimedCorrelations.size,
      incompleteSequences: incomplete.length,
      openNotices: openNotices ?? 0,
      unresolvedFiles: unresolvedFileCount ?? 0,
      lastSuccessfulPrescan: latestApproved?.created_at ?? null,
      activeVersion: activePrescan?.prescan_version ?? null,
    },
    reasons: [...reasons.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    repeatedHashes: [...hashes.entries()]
      .filter(([, value]) => value.attempts > 1)
      .map(([hash, value]) => ({ hash, attempts: value.attempts, accounts: value.accounts.size, lastSeen: value.lastSeen }))
      .sort((a, b) => b.attempts - a.attempts)
      .slice(0, 50),
    incomplete: incomplete.slice(0, 100),
    decisions: terminal.slice(0, 250),
    unresolved: blockedFiles ?? [],
  }, { headers: { "Cache-Control": "no-store" } })
}
