import { collaborationAvailable, collaborationUnavailableResponse } from "@/lib/collaboration-rollout"
import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/mcp-auth"
import { recordCollaborationAudit, resolveCollaborationAccess } from "@/lib/collaboration-access"
import type { CollaborationAction } from "@/lib/collaboration-policy"

const actions = new Set<CollaborationAction>(["view", "submit", "review", "run", "edit", "evidence", "export", "manage", "delete"])

function bearer(request: Request) {
  const value = request.headers.get("authorization")
  return value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? null
}

/** Shared authorization probe for in-app and future connector clients. */
export async function POST(request: Request) {
  if (!collaborationAvailable()) return collaborationUnavailableResponse()
  const token = bearer(request)
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: auth, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !auth.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json().catch(() => null) as {
    workflowId?: unknown
    action?: unknown
    destinationFolderId?: unknown
  } | null
  const workflowId = typeof body?.workflowId === "string" ? body.workflowId : ""
  const action = typeof body?.action === "string" && actions.has(body.action as CollaborationAction)
    ? body.action as CollaborationAction
    : null
  const destinationFolderId = typeof body?.destinationFolderId === "string" ? body.destinationFolderId : undefined
  if (!workflowId || !action) return NextResponse.json({ error: "workflowId and a valid action are required" }, { status: 400 })

  try {
    const result = await resolveCollaborationAccess({ actorUserId: auth.user.id, workflowId, action, destinationFolderId })
    if (result.workflow) {
      await recordCollaborationAudit({
        actorUserId: auth.user.id,
        workflow: result.workflow,
        action,
        outcome: result.decision.allowed ? "allowed" : "denied",
        decision: result.decision,
        metadata: { via: result.decision.allowed ? result.decision.via : null },
      })
    }
    return NextResponse.json({ allowed: result.decision.allowed, ...(result.decision.allowed ? { via: result.decision.via } : {}) })
  } catch (error) {
    console.error("[collaboration/access] failed", { actorUserId: auth.user.id, workflowId, action, error: error instanceof Error ? error.message : "unknown" })
    return NextResponse.json({ error: "Unable to evaluate collaboration access" }, { status: 500 })
  }
}
