import { supabaseAdmin } from "@/lib/mcp-auth"
import { collaborationAvailable } from "@/lib/collaboration-rollout"
import {
  evaluateCollaborationAccess,
  type CollaborationAction,
  type CollaborationDecision,
  type CollaborationResource,
  type OrganizationMembership,
  type DelegationGrant,
} from "@/lib/collaboration-policy"

type WorkflowRow = {
  id: string
  name: string
  target_kind: "workflow" | "report" | "dashboard"
  target_id: string
  owner_user_id: string | null
  organization_id: string | null
  intake_folder_id: string | null
  active: boolean
}

type AccessResult = {
  decision: CollaborationDecision
  workflow: WorkflowRow | null
}

function toGrant(row: Record<string, unknown>, resourceKind: DelegationGrant["resourceKind"]): DelegationGrant {
  return {
    id: String(row.id),
    ownerUserId: String(row.owner_user_id),
    recipientUserId: String(row.recipient_user_id),
    resourceId: String(row.workflow_id),
    resourceKind,
    role: row.role as DelegationGrant["role"],
    intakeFolderId: (row.intake_folder_id as string | null) ?? null,
    evidenceAllowed: row.evidence_allowed === true,
    exportAllowed: row.export_allowed === true,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
  }
}

function toMembership(row: Record<string, unknown>): OrganizationMembership {
  return {
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    role: row.role as OrganizationMembership["role"],
    active: row.active === true,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    organizationActive: row.organization_active === true,
    evidenceAllowed: row.evidence_allowed === true,
    exportAllowed: row.export_allowed === true,
  }
}

/**
 * Resolve access using service-role reads plus the pure default-deny policy.
 * Callers must authenticate the actor before invoking this helper. No client
 * supplied owner or organization identity is trusted.
 */
export async function resolveCollaborationAccess(input: {
  actorUserId: string
  workflowId: string
  action: CollaborationAction
  destinationFolderId?: string | null
  now?: Date
}): Promise<AccessResult> {
  if (!collaborationAvailable()) return { workflow: null, decision: { allowed: false } }
  const { data: workflow, error: workflowError } = await supabaseAdmin
    .from("collaboration_workflows")
    .select("id, name, target_kind, target_id, owner_user_id, organization_id, intake_folder_id, active")
    .eq("id", input.workflowId)
    .maybeSingle()
  if (workflowError) throw new Error(`Could not load collaboration workflow: ${workflowError.message}`)
  if (!workflow) {
    return { workflow: null, decision: { allowed: false } }
  }

  const row = workflow as WorkflowRow
  if (input.action === "submit") {
    if (!row.owner_user_id || !row.intake_folder_id) return { workflow: null, decision: { allowed: false } }
    const { data: folder, error } = await supabaseAdmin.from("folders")
      .select("id").eq("id", row.intake_folder_id).eq("user_id", row.owner_user_id).maybeSingle()
    if (error) throw new Error("Could not validate intake folder")
    if (!folder) return { workflow: null, decision: { allowed: false } }
  }
  const resource: CollaborationResource = {
    id: row.id,
    kind: row.target_kind,
    owner: row.owner_user_id
      ? { kind: "personal", userId: row.owner_user_id }
      : { kind: "organization", organizationId: row.organization_id as string },
    intakeFolderId: row.intake_folder_id,
    active: row.active,
  }

  let grant: DelegationGrant | null = null
  let membership: OrganizationMembership | null = null

  if (row.owner_user_id && input.actorUserId !== row.owner_user_id) {
    const { data, error } = await supabaseAdmin
      .from("collaboration_grants")
      .select("id, owner_user_id, recipient_user_id, workflow_id, role, intake_folder_id, evidence_allowed, export_allowed, accepted_at, revoked_at, expires_at")
      .eq("workflow_id", row.id)
      .eq("recipient_user_id", input.actorUserId)
      .is("revoked_at", null)
      .maybeSingle()
    if (error) throw new Error(`Could not load collaboration grant: ${error.message}`)
    grant = data ? toGrant(data as Record<string, unknown>, row.target_kind) : null
  }

  if (row.organization_id) {
    const { data, error } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, user_id, role, active, accepted_at, evidence_allowed, export_allowed, organizations!inner(status)")
      .eq("organization_id", row.organization_id)
      .eq("user_id", input.actorUserId)
      .maybeSingle()
    if (error) throw new Error(`Could not load organization membership: ${error.message}`)
    if (data) {
      const membershipRow = data as Record<string, unknown> & { organizations?: { status?: string } | null }
      membership = toMembership({ ...membershipRow, organization_active: membershipRow.organizations?.status === "active" })
    }
  }

  const decision = evaluateCollaborationAccess(
    { actorUserId: input.actorUserId, action: input.action, resource, ...(input.destinationFolderId ? { destinationFolderId: input.destinationFolderId } : {}) },
    grant ? [grant] : [],
    membership,
    input.now ?? new Date(),
  )
  return { workflow: row, decision }
}

/** Record only identifiers and safe state; never file contents, URLs, or tokens. */
export async function recordCollaborationAudit(input: {
  actorUserId: string
  workflow: WorkflowRow
  action: CollaborationAction | "invite" | "accept" | "revoke"
  outcome: "allowed" | "denied" | "completed" | "failed"
  decision?: CollaborationDecision
  metadata?: Record<string, unknown>
}) {
  const { error } = await supabaseAdmin.from("collaboration_audit_events").insert({
    actor_user_id: input.actorUserId,
    owner_user_id: input.workflow.owner_user_id,
    organization_id: input.workflow.organization_id,
    workflow_id: input.workflow.id,
    grant_id: input.decision?.allowed ? input.decision.grantId ?? null : null,
    action: input.action,
    outcome: input.outcome,
    metadata: input.metadata ?? {},
  })
  if (error) throw new Error(`Could not record collaboration audit event: ${error.message}`)
}
