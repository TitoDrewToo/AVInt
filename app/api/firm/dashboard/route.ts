import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"

async function adminForToken(req: NextRequest, firmSlug: string) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim()
  if (!token) return null
  const { data, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !data.user) return null
  const { data: firm } = await supabaseAdmin.from("firms").select("id").eq("slug", firmSlug).maybeSingle()
  if (!firm) return null
  const { data: admin } = await supabaseAdmin.from("firm_admins").select("firm_id").eq("user_id", data.user.id).eq("firm_id", firm.id).maybeSingle()
  return admin ? { user: data.user, firmId: admin.firm_id } : null
}

export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get("slug")?.trim().toLowerCase() ?? ""
  const auth = await adminForToken(req, slug)
  if (!auth) return NextResponse.json({ error: "Firm administrator access required" }, { status: 403 })
  const { data: firm, error: firmError } = await supabaseAdmin.from("firms").select("id, name, slug, status, seats_purchased, seats_used, partner_rate_cents, founding, logo_url").eq("id", auth.firmId).eq("slug", slug).maybeSingle()
  if (firmError || !firm || firm.status !== "active") return NextResponse.json({ error: "Firm not found" }, { status: 404 })
  const { data: clients, error: clientsError } = await supabaseAdmin.from("firm_clients").select("id, user_id, created_at, seat_consumed").eq("firm_id", firm.id).order("created_at", { ascending: false })
  if (clientsError) return NextResponse.json({ error: "Could not load firm clients" }, { status: 500 })
  const userIds = (clients ?? []).map((client) => client.user_id)
  const emails = new Map<string, string>()
  for (const userId of userIds) {
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(userId)
    if (user.user?.email) emails.set(userId, user.user.email)
  }
  return NextResponse.json({ firm, clients: (clients ?? []).map((client) => ({ ...client, email: emails.get(client.user_id) ?? null })) })
}
