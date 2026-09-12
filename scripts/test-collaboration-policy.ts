import assert from "node:assert/strict"
import { evaluateCollaborationAccess, type CollaborationAction, type CollaborationRequest, type DelegationGrant, type OrganizationMembership } from "../lib/collaboration-policy"

const now = new Date("2026-09-12T00:00:00Z")
const request: CollaborationRequest = {
  actorUserId: "buddy", action: "view",
  resource: { id: "monthly", kind: "workflow", owner: { kind: "personal", userId: "owner" }, intakeFolderId: "intake", active: true },
}
const grant: DelegationGrant = {
  id: "grant", ownerUserId: "owner", recipientUserId: "buddy", resourceId: "monthly", resourceKind: "workflow",
  role: "operator", intakeFolderId: "intake", evidenceAllowed: false, exportAllowed: false,
  acceptedAt: "2026-09-11T00:00:00Z", revokedAt: null, expiresAt: null,
}
const check = (action: CollaborationAction, g = grant, overrides: Partial<CollaborationRequest> = {}) =>
  evaluateCollaborationAccess({ ...request, action, destinationFolderId: "intake", ...overrides }, [g], null, now).allowed

assert.equal(evaluateCollaborationAccess(request, [], null, now).allowed, false)
for (const action of ["view", "submit", "review", "run"] as const) assert.equal(check(action), true)
for (const action of ["edit", "manage", "delete", "evidence", "export"] as const) assert.equal(check(action), false)
assert.equal(check("submit", grant, { destinationFolderId: "unrelated" }), false)
assert.equal(check("submit", { ...grant, intakeFolderId: "old-intake" }), false)
assert.equal(check("submit", grant, { destinationFolderId: undefined }), false)
assert.equal(check("view", grant, { actorUserId: "stranger" }), false)
for (const patch of [
  { ownerUserId: "someone-else" }, { resourceId: "other" }, { resourceKind: "report" as const },
  { acceptedAt: null }, { acceptedAt: "invalid" }, { acceptedAt: "2027-01-01" },
  { revokedAt: "2026-09-11" }, { expiresAt: now.toISOString() }, { expiresAt: "invalid" },
]) assert.equal(check("view", { ...grant, ...patch }), false)
assert.equal(check("evidence", { ...grant, evidenceAllowed: true }), true)
assert.equal(check("export", { ...grant, exportAllowed: true }), true)
assert.equal(check("evidence", { ...grant, exportAllowed: true }), false)
assert.equal(check("view", { ...grant, role: "submitter" }), false)
assert.equal(check("evidence", { ...grant, role: "submitter", evidenceAllowed: true }), false)
assert.equal(check("submit", { ...grant, role: "submitter" }), true)
assert.equal(check("edit", { ...grant, role: "editor" }), true)
assert.equal(check("manage", { ...grant, role: "editor" }), false)
assert.equal(check("run", { ...grant, role: "viewer" }), false)
assert.equal(check("view", grant, { resource: { ...request.resource, active: false } }), false)
assert.equal(check("submit", grant, { resource: { ...request.resource, kind: "report" } }), false)
assert.equal(evaluateCollaborationAccess(request, [grant], null, new Date("invalid")).allowed, false)
const own = evaluateCollaborationAccess({ ...request, actorUserId: "owner", action: "manage" }, [], null, now)
assert.equal(own.allowed && own.via, "owner")
const delegated = evaluateCollaborationAccess(request, [grant], null, now)
assert.deepEqual(delegated, { allowed: true, actorUserId: "buddy", owner: request.resource.owner, resourceId: "monthly", action: "view", via: "grant", grantId: "grant" })

const orgRequest: CollaborationRequest = { ...request, resource: { ...request.resource, owner: { kind: "organization", organizationId: "org" } } }
const member: OrganizationMembership = { organizationId: "org", userId: "buddy", role: "editor", active: true, acceptedAt: "2026-09-11T00:00:00Z", organizationActive: true, evidenceAllowed: false, exportAllowed: false }
assert.equal(evaluateCollaborationAccess(orgRequest, [grant], null, now).allowed, false)
assert.equal(evaluateCollaborationAccess(orgRequest, [], member, now).allowed, true)
for (const patch of [{ acceptedAt: null }, { acceptedAt: "invalid" }, { acceptedAt: "2027-01-01" }, { active: false }, { organizationActive: false }, { userId: "other" }, { organizationId: "other" }]) {
  assert.equal(evaluateCollaborationAccess(orgRequest, [], { ...member, ...patch }, now).allowed, false)
}
for (const action of ["manage", "delete", "evidence", "export"] as const) {
  assert.equal(evaluateCollaborationAccess({ ...orgRequest, action }, [], member, now).allowed, false)
}
assert.equal(evaluateCollaborationAccess({ ...orgRequest, action: "review" }, [], { ...member, role: "reviewer" }, now).allowed, true)
assert.equal(evaluateCollaborationAccess({ ...orgRequest, action: "run" }, [], { ...member, role: "reviewer" }, now).allowed, false)
assert.equal(evaluateCollaborationAccess(request, [], member, now).allowed, false)
console.log("Collaboration policy tests passed")
