import { collaborationAvailable, collaborationUnavailableResponse } from "@/lib/collaboration-rollout"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { recordCollaborationAudit } from "@/lib/collaboration-access"

function token(request: Request) { return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null }

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!collaborationAvailable()) return collaborationUnavailableResponse()
  const bearer = token(request)
  if (!bearer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth } = await supabaseAdmin.auth.getUser(bearer)
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await context.params
  const { data: grant } = await supabaseAdmin.from("collaboration_grants").select("id, owner_user_id, workflow_id").eq("id", id).maybeSingle()
  if (!grant || grant.owner_user_id !== auth.user.id) return NextResponse.json({ error: "Grant not found." }, { status: 404 })
  const { data: workflow } = await supabaseAdmin.from("collaboration_workflows").select("id, name, target_kind, target_id, owner_user_id, organization_id, intake_folder_id, active").eq("id", grant.workflow_id).maybeSingle()
  if (!workflow) return NextResponse.json({ error: "Workflow not found." }, { status: 404 })
  const { error } = await supabaseAdmin.from("collaboration_grants").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("owner_user_id", auth.user.id).is("revoked_at", null)
  if (error) return NextResponse.json({ error: "Could not revoke grant." }, { status: 500 })
  await recordCollaborationAudit({ actorUserId: auth.user.id, workflow, action: "revoke", outcome: "completed", metadata: { grant_id: id } })
  return NextResponse.json({ revoked: true })
}
