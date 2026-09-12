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
  const { data, error } = await supabaseAdmin.from("collaboration_grants").update({ accepted_at: new Date().toISOString() }).eq("id", id).eq("recipient_user_id", auth.user.id).is("revoked_at", null).is("accepted_at", null).select("id, workflow_id, role, accepted_at").maybeSingle()
  if (error || !data) return NextResponse.json({ error: "Grant not found or no longer available." }, { status: 404 })
  return NextResponse.json({ grant: data })
}
