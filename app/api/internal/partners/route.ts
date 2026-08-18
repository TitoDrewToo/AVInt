import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"
import { isUuid } from "@/lib/firm-partnership"

const STATUSES = ["new", "contacted", "qualified", "closed"] as const
type PartnerStatus = typeof STATUSES[number]

async function requireSystemAdmin(req: NextRequest) {
  return getSystemAdminUser(bearerToken(req.headers.get("authorization")))
}

export async function GET(req: NextRequest) {
  const admin = await requireSystemAdmin(req)
  if (!admin) return NextResponse.json({ error: "System administrator access required" }, { status: 403 })

  const [{ data: inquiries, error: inquiriesError }, { data: firms, error: firmsError }] = await Promise.all([
    supabaseAdmin.from("partner_inquiries").select("id, name, firm, email, client_count, message, status, created_at").order("created_at", { ascending: false }),
    supabaseAdmin.from("firms").select("id, name, slug, status, founding, seats_purchased, seats_used, created_at").order("created_at", { ascending: false }),
  ])
  if (inquiriesError || firmsError) return NextResponse.json({ error: "Could not load partner console data" }, { status: 500 })
  return NextResponse.json({ inquiries: inquiries ?? [], firms: firms ?? [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function PATCH(req: NextRequest) {
  const admin = await requireSystemAdmin(req)
  if (!admin) return NextResponse.json({ error: "System administrator access required" }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  const id = body.id
  const status = body.status
  if (!isUuid(id) || typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Valid inquiry id and status are required" }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin.from("partner_inquiries").update({ status: status as PartnerStatus }).eq("id", id).select("id, status").maybeSingle()
  if (error) return NextResponse.json({ error: "Could not update inquiry status" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "Inquiry not found" }, { status: 404 })
  return NextResponse.json({ inquiry: data })
}
