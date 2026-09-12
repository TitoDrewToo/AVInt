import { collaborationAvailable, collaborationUnavailableResponse } from "@/lib/collaboration-rollout"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import type { OrganizationRole } from "@/lib/collaboration-policy"

function token(request: Request) { return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!collaborationAvailable()) return collaborationUnavailableResponse()
  const bearer = token(request)
  if (!bearer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth } = await supabaseAdmin.auth.getUser(bearer)
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const userId = typeof body?.user_id === "string" ? body.user_id : ""
  const role = body?.role as OrganizationRole
  if (!userId || !["admin", "editor", "reviewer", "viewer"].includes(role)) return NextResponse.json({ error: "user_id and valid role are required." }, { status: 400 })
  const { data: claim, error } = await supabaseAdmin.rpc("avint_manage_organization_member", { p_organization_id: id, p_actor_user_id: auth.user.id, p_user_id: userId, p_action: "invite", p_role: role })
  if (error || !claim?.ok) return NextResponse.json({ error: claim?.code === "seats_full" ? "No available organization seat." : "Could not invite member." }, { status: 409 })
  return NextResponse.json({ member: claim }, { status: 201 })
}
