import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"
import { getLiveChangelog, getStatusOverview } from "@/components/systems/operations-data"

export async function GET(request: NextRequest) {
  if (!(await getSystemAdminUser(bearerToken(request.headers.get("authorization"))))) {
    return NextResponse.json({ error: "System administrator access required" }, { status: 403 })
  }
  const [{ data: groups, error: groupsError }, { data: partner, error: partnerError }, { data: studio, error: studioError }, { count: unresolvedSecurity, error: securityError }, { data: securityEvents, error: securityEventsError }, status, changelog] = await Promise.all([
    supabaseAdmin.from("error_groups").select("status, severity"),
    supabaseAdmin.from("partner_inquiries").select("status"),
    supabaseAdmin.from("studio_inquiries").select("status"),
    supabaseAdmin.from("files").select("id", { count: "exact", head: true }).in("upload_status", ["quarantined", "rejected", "scan_failed", "scanning"]),
    supabaseAdmin.from("prescan_security_events").select("correlation_id, event_type").in("event_type", ["prescan.action_intended", "prescan.approved", "prescan.quarantined", "prescan.rejected", "prescan.retry_required"]).gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()).limit(2000),
    getStatusOverview(),
    getLiveChangelog(),
  ])
  if (groupsError || partnerError || studioError || securityError || securityEventsError) return NextResponse.json({ error: "Could not load systems overview" }, { status: 500 })
  const openGroups = (groups ?? []).filter((group) => group.status !== "resolved" && group.status !== "ignored")
  const bySeverity = openGroups.reduce<Record<string, number>>((counts, group) => {
    const severity = group.severity ?? "unclassified"
    counts[severity] = (counts[severity] ?? 0) + 1
    return counts
  }, {})
  const unreadInquiries = [...(partner ?? []), ...(studio ?? [])].filter((inquiry) => inquiry.status === "new").length
  const latest = changelog.days[0]?.entries[0] ?? null
  const terminalSecurity = new Set((securityEvents ?? []).filter((event) => event.event_type !== "prescan.action_intended").map((event) => event.correlation_id))
  const incompleteSecurity = (securityEvents ?? []).filter((event) => event.event_type === "prescan.action_intended" && !terminalSecurity.has(event.correlation_id)).length
  return NextResponse.json({
    status: { overall: status.overall, lastDeploy: status.lastDeploy },
    changelog: latest ? { title: latest.title, dateLabel: latest.dateLabel, url: latest.url } : null,
    errors: { open: openGroups.length, bySeverity },
    inquiries: { unread: unreadInquiries },
    security: { unresolved: unresolvedSecurity ?? 0, incomplete: incompleteSecurity },
  }, { headers: { "Cache-Control": "no-store" } })
}
