import { collaborationAvailable, collaborationUnavailableResponse } from "@/lib/collaboration-rollout"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"

function token(request: Request) { return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null }

export async function POST(request: Request) {
  if (!collaborationAvailable()) return collaborationUnavailableResponse()
  const bearer = token(request)
  if (!bearer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth } = await supabaseAdmin.auth.getUser(bearer)
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const name = typeof body?.name === "string" ? body.name.trim() : ""
  const slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : ""
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return NextResponse.json({ error: "A name and URL-safe slug are required." }, { status: 400 })
  const { data: organization, error } = await supabaseAdmin.from("organizations").insert({ name, slug, seats_purchased: 1, seats_used: 1 }).select("id, name, slug, status, seats_purchased, seats_used").single()
  if (error || !organization) return NextResponse.json({ error: "Could not create organization." }, { status: 409 })
  const { error: memberError } = await supabaseAdmin.from("organization_members").insert({ organization_id: organization.id, user_id: auth.user.id, role: "owner", active: true, accepted_at: new Date().toISOString() })
  if (memberError) {
    await supabaseAdmin.from("organizations").delete().eq("id", organization.id)
    return NextResponse.json({ error: "Could not initialize organization owner." }, { status: 500 })
  }
  return NextResponse.json({ organization }, { status: 201 })
}
