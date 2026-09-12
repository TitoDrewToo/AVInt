/**
 * Pure policy for the collaboration foundation. Callers must supply identities
 * and resource/grant snapshots loaded by a trusted server, never request JSON.
 * This module does not authenticate users or grant database access.
 */
export type CollaborationAction =
  | "view" | "submit" | "review" | "run" | "edit"
  | "evidence" | "export" | "manage" | "delete"
export type DelegateRole = "viewer" | "submitter" | "operator" | "editor"
export type OrganizationRole = "owner" | "admin" | "editor" | "reviewer" | "viewer"
export type CollaborationTarget = "workflow" | "report" | "dashboard"

export interface CollaborationResource {
  id: string
  kind: CollaborationTarget
  owner: { kind: "personal"; userId: string } | { kind: "organization"; organizationId: string }
  intakeFolderId: string | null
  active: boolean
}

export interface DelegationGrant {
  id: string
  ownerUserId: string
  recipientUserId: string
  resourceId: string
  resourceKind: CollaborationTarget
  role: DelegateRole
  intakeFolderId: string | null
  evidenceAllowed: boolean
  exportAllowed: boolean
  acceptedAt: string | null
  revokedAt: string | null
  expiresAt: string | null
}

export interface OrganizationMembership {
  organizationId: string
  userId: string
  role: OrganizationRole
  active: boolean
  acceptedAt: string | null
  organizationActive: boolean
  evidenceAllowed: boolean
  exportAllowed: boolean
}

export interface CollaborationRequest {
  actorUserId: string
  action: CollaborationAction
  resource: CollaborationResource
  /** Required for submission; exact folder only, no implicit descendants. */
  destinationFolderId?: string
}

export type CollaborationDecision =
  | { allowed: false }
  | {
      allowed: true
      actorUserId: string
      owner: CollaborationResource["owner"]
      resourceId: string
      action: CollaborationAction
      via: "owner" | "grant" | "membership"
      grantId: string | null
    }

const delegateActions: Record<DelegateRole, readonly CollaborationAction[]> = {
  viewer: ["view"],
  submitter: ["submit"],
  operator: ["view", "submit", "review", "run"],
  editor: ["view", "submit", "review", "run", "edit"],
}
const organizationActions: Record<OrganizationRole, readonly CollaborationAction[]> = {
  owner: ["view", "submit", "review", "run", "edit", "manage", "delete"],
  admin: ["view", "submit", "review", "run", "edit", "manage", "delete"],
  editor: ["view", "submit", "review", "run", "edit"],
  reviewer: ["view", "review"],
  viewer: ["view"],
}
const targetActions: Record<CollaborationTarget, readonly CollaborationAction[]> = {
  workflow: ["view", "submit", "review", "run", "edit", "evidence", "export", "manage", "delete"],
  report: ["view", "run", "edit", "evidence", "export", "manage", "delete"],
  dashboard: ["view", "run", "edit", "evidence", "export", "manage", "delete"],
}

function permitted(actions: readonly CollaborationAction[] | undefined, action: CollaborationAction, evidence: boolean, exports: boolean) {
  if (!actions) return false
  if (action === "evidence") return actions.includes("view") && evidence === true
  if (action === "export") return actions.includes("view") && exports === true
  return actions.includes(action)
}

/** A decision authorizes this exact target/action only, never its dependencies. */
export function evaluateCollaborationAccess(
  request: CollaborationRequest,
  grants: readonly DelegationGrant[] = [],
  membership: OrganizationMembership | null = null,
  now = new Date(),
): CollaborationDecision {
  const { actorUserId, resource, action } = request
  const deny: CollaborationDecision = { allowed: false }
  if (!actorUserId || !resource.id || resource.active !== true || !Number.isFinite(now.getTime())) return deny
  if (!targetActions[resource.kind]?.includes(action)) return deny
  if (action === "submit" && (!resource.intakeFolderId || request.destinationFolderId !== resource.intakeFolderId)) return deny
  const allow = (via: "owner" | "grant" | "membership", grantId: string | null = null): CollaborationDecision => ({
    allowed: true, actorUserId, owner: resource.owner, resourceId: resource.id, action, via, grantId,
  })

  if (resource.owner.kind === "personal") {
    const ownerUserId = resource.owner.userId
    if (!ownerUserId) return deny
    if (actorUserId === ownerUserId) return allow("owner")
    for (const grant of grants) {
      if (!grant.id || grant.ownerUserId !== ownerUserId || grant.recipientUserId !== actorUserId ||
          grant.resourceId !== resource.id || grant.resourceKind !== resource.kind || grant.revokedAt !== null) continue
      const accepted = grant.acceptedAt ? Date.parse(grant.acceptedAt) : NaN
      const expiry = grant.expiresAt === null ? Infinity : Date.parse(grant.expiresAt)
      if (!Number.isFinite(accepted) || accepted > now.getTime() || !(expiry > now.getTime())) continue
      if (action === "submit" && grant.intakeFolderId !== resource.intakeFolderId) continue
      if (permitted(delegateActions[grant.role], action, grant.evidenceAllowed, grant.exportAllowed)) return allow("grant", grant.id)
    }
    return deny
  }
  if (resource.owner.kind !== "organization" || !resource.owner.organizationId || !membership ||
      membership.userId !== actorUserId || membership.organizationId !== resource.owner.organizationId ||
      membership.active !== true || membership.organizationActive !== true) return deny
  const accepted = membership.acceptedAt ? Date.parse(membership.acceptedAt) : NaN
  if (!Number.isFinite(accepted) || accepted > now.getTime()) return deny
  return permitted(organizationActions[membership.role], action, membership.evidenceAllowed, membership.exportAllowed)
    ? allow("membership") : deny
}
