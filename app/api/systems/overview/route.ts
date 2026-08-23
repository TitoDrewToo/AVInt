import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"
import { getLiveChangelog, getStatusOverview } from "@/components/systems/operations-data"

export async function GET(request: NextRequest) {
  if (!(await getSystemAdminUser(bearerToken(request.headers.get("authorization"))))) {
    return NextResponse.json({ error: "System administrator access required" }, { status: 403 })
  }
  const [{ data: groups, error: groupsError }, { data: partner, error: partnerError }, { data: studio, error: studioError }, status, changelog] = await Promise.all([
    supabaseAdmin.from("error_groups").select("status, severity"),
    supabaseAdmin.from("partner_inquiries").select("status"),
    supabaseAdmin.from("studio_inquiries").select("status"),
    getStatusOverview(),
    getLiveChangelog(),
  ])
  if (groupsError || partnerError || studioError) return NextResponse.json({ error: "Could not load systems overview" }, { status: 500 })
  const openGroups = (groups ?? []).filter((group) => group.status !== "resolved" && group.status !== "ignored")
  const bySeverity = openGroups.reduce<Record<string, number>>((counts, group) => {
    const severity = group.severity ?? "unclassified"
    counts[severity] = (counts[severity] ?? 0) + 1
    return counts
  }, {})
  const unreadInquiries = [...(partner ?? []), ...(studio ?? [])].filter((inquiry) => inquiry.status === "new").length
  const latest = changelog.days[0]?.entries[0] ?? null
  return NextResponse.json({
    status: { overall: status.overall, lastDeploy: status.lastDeploy },
    changelog: latest ? { title: latest.title, dateLabel: latest.dateLabel, url: latest.url } : null,
    errors: { open: openGroups.length, bySeverity },
    inquiries: { unread: unreadInquiries },
  }, { headers: { "Cache-Control": "no-store" } })
}
