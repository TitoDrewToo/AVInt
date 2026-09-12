import { collaborationAvailable, collaborationUnavailableResponse } from "@/lib/collaboration-rollout"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"

function token(request: Request) { return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!collaborationAvailable()) return collaborationUnavailableResponse()
  const bearer = token(request)
  if (!bearer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth } = await supabaseAdmin.auth.getUser(bearer)
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params
  const { data, error } = await supabaseAdmin.rpc("avint_manage_organization_member", { p_organization_id: id, p_actor_user_id: auth.user.id, p_user_id: auth.user.id, p_action: "accept" })
  if (error || !data?.ok) return NextResponse.json({ error: "Organization invitation not found." }, { status: 404 })
  return NextResponse.json({ member: data })
}
