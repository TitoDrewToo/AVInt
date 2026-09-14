import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"
import { isUuid } from "@/lib/firm-partnership"

const STATUSES = ["new", "contacted", "qualified", "closed"] as const
const SUPPORT_STATUSES = ["open", "in_progress", "waiting_on_customer", "resolved"] as const
type Status = typeof STATUSES[number] | typeof SUPPORT_STATUSES[number]

async function requireAdmin(request: NextRequest) {
  return getSystemAdminUser(bearerToken(request.headers.get("authorization")))
}

export async function GET(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "System administrator access required" }, { status: 403 })
  const [{ data: partner, error: partnerError }, { data: studio, error: studioError }, { data: support, error: supportError }] = await Promise.all([
    supabaseAdmin.from("partner_inquiries").select("id, name, firm, email, client_count, message, status, created_at").order("created_at", { ascending: false }),
    supabaseAdmin.from("studio_inquiries").select("id, name, company, email, message, status, created_at").order("created_at", { ascending: false }),
    supabaseAdmin.from("support_inquiries").select("id, email, subject, message, status, context, created_at").order("created_at", { ascending: false }),
  ])
  if (partnerError || studioError || supportError) return NextResponse.json({ error: "Could not load inquiries" }, { status: 500 })
  return NextResponse.json({ inquiries: [
    ...(partner ?? []).map((item) => ({ ...item, source: "partner" as const, organization: item.firm })),
    ...(studio ?? []).map((item) => ({ ...item, source: "studio" as const, organization: item.company })),
    ...(support ?? []).map((item) => ({ ...item, source: "support" as const, name: item.email, organization: item.subject })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) }, { headers: { "Cache-Control": "no-store" } })
}

export async function PATCH(request: NextRequest) {
  if (!(await requireAdmin(request))) return NextResponse.json({ error: "System administrator access required" }, { status: 403 })
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const id = body.id
  const source = body.source
  const status = body.status
  const validStatus = source === "support"
    ? typeof status === "string" && (SUPPORT_STATUSES as readonly string[]).includes(status)
    : typeof status === "string" && (STATUSES as readonly string[]).includes(status)
  if (!isUuid(id) || (source !== "partner" && source !== "studio" && source !== "support") || !validStatus) {
    return NextResponse.json({ error: "Valid inquiry id, source, and status are required" }, { status: 400 })
  }
  const table = source === "partner" ? "partner_inquiries" : source === "studio" ? "studio_inquiries" : "support_inquiries"
  const { data, error } = await supabaseAdmin.from(table).update({ status: status as Status }).eq("id", id).select("id, status").maybeSingle()
  if (error) return NextResponse.json({ error: "Could not update inquiry status" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 })
  return NextResponse.json({ inquiry: data })
}
