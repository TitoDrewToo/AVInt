import { collaborationAvailable, collaborationUnavailableResponse } from "@/lib/collaboration-rollout"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { recordCollaborationAudit, resolveCollaborationAccess } from "@/lib/collaboration-access"
import type { DelegateRole } from "@/lib/collaboration-policy"

function token(request: Request) { return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null }

export async function POST(request: Request) {
  if (!collaborationAvailable()) return collaborationUnavailableResponse()
  const bearer = token(request)
  if (!bearer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth } = await supabaseAdmin.auth.getUser(bearer)
  if (!auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  const workflowId = typeof body?.workflow_id === "string" ? body.workflow_id : ""
  const recipientUserId = typeof body?.recipient_user_id === "string" ? body.recipient_user_id : ""
  const role = body?.role as DelegateRole
  const folderId = typeof body?.intake_folder_id === "string" ? body.intake_folder_id : null
  if (!workflowId || !recipientUserId || !["viewer", "submitter", "operator", "editor"].includes(role)) return NextResponse.json({ error: "workflow_id, recipient_user_id, and valid role are required" }, { status: 400 })
  const access = await resolveCollaborationAccess({ actorUserId: auth.user.id, workflowId, action: "manage" })
  if (!access.workflow || !access.decision.allowed || access.decision.owner.kind !== "personal" || access.decision.owner.userId !== auth.user.id) return NextResponse.json({ error: "Only the workflow owner can create grants." }, { status: 403 })
  if (role !== "viewer" && folderId !== access.workflow.intake_folder_id) return NextResponse.json({ error: "Submission roles require the workflow intake folder." }, { status: 400 })
  const { data, error } = await supabaseAdmin.from("collaboration_grants").insert({ owner_user_id: auth.user.id, recipient_user_id: recipientUserId, workflow_id: workflowId, role, intake_folder_id: folderId, evidence_allowed: body?.evidence_allowed === true, export_allowed: body?.export_allowed === true }).select("id, workflow_id, recipient_user_id, role, intake_folder_id, accepted_at, expires_at, revoked_at").single()
  if (error) return NextResponse.json({ error: "Could not create grant." }, { status: 409 })
  await recordCollaborationAudit({ actorUserId: auth.user.id, workflow: access.workflow, action: "invite", outcome: "completed", decision: access.decision, metadata: { grant_id: data.id, role } })
  return NextResponse.json({ grant: data }, { status: 201 })
}
