import { NextRequest, NextResponse } from "next/server"

import { supabaseAdmin } from "@/lib/mcp-auth"
import { bearerToken, getSystemAdminUser } from "@/lib/system-admin"
import { isUuid, normalizeFirmSlug } from "@/lib/firm-partnership"

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

export async function POST(req: NextRequest) {
  const systemAdmin = await getSystemAdminUser(bearerToken(req.headers.get("authorization")))
  if (!systemAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const name = typeof body.name === "string" ? body.name.trim() : ""
  const slug = normalizeFirmSlug(body.slug)
  const adminUserId = body.admin_user_id
  const adminEmail = typeof body.admin_email === "string" ? body.admin_email.trim().toLowerCase() : ""
  const logoUrl = typeof body.logo_url === "string" ? body.logo_url.trim() : null
  const notes = typeof body.notes === "string" ? body.notes.trim() : null

  if (!name || name.length > 180 || !slug || (adminUserId !== undefined && !isUuid(adminUserId)) || (!adminUserId && !EMAIL_PATTERN.test(adminEmail))) {
    return NextResponse.json({ error: "name, URL-safe slug, and admin_user_id or admin_email are required" }, { status: 400 })
  }
  if (logoUrl && (!/^https:\/\//i.test(logoUrl) || logoUrl.length > 2000)) {
    return NextResponse.json({ error: "logo_url must be an HTTPS URL" }, { status: 400 })
  }

  const { data: firm, error: firmError } = await supabaseAdmin
    .from("firms")
    .insert({ name, slug, logo_url: logoUrl, notes })
    .select("id, name, slug, status, seats_purchased, seats_used, partner_rate_cents, founding, created_at")
    .single()
  if (firmError || !firm) {
    const duplicate = (firmError as { code?: string } | null)?.code === "23505"
    return NextResponse.json({ error: duplicate ? "That slug is already in use" : "Could not create firm" }, { status: duplicate ? 409 : 500 })
  }

  let resolvedUserId = typeof adminUserId === "string" ? adminUserId : null
  let inviteSent = false
  if (!resolvedUserId) {
    const { data: users, error: usersError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (!usersError) {
      resolvedUserId = users.users.find((user) => user.email?.toLowerCase() === adminEmail)?.id ?? null
      if (resolvedUserId) inviteSent = true
    }
    if (!resolvedUserId) {
      const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(adminEmail, {
        data: { firm_id: firm.id, role: "firm_admin" },
      })
      if (!inviteError && invited.user) {
        resolvedUserId = invited.user.id
        inviteSent = true
      }
    }
  }

  if (resolvedUserId) {
    const { error: adminError } = await supabaseAdmin.from("firm_admins").insert({ firm_id: firm.id, user_id: resolvedUserId })
    if (adminError) {
      return NextResponse.json({ error: "Firm was created, but the administrator could not be linked" }, { status: 500 })
    }
  }

  return NextResponse.json({ firm, admin_user_id: resolvedUserId, invite_sent: inviteSent }, { status: 201 })
}
