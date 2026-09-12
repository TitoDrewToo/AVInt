# Collaboration and Delegated Workflow Upgrade Path

## Decision

Build the authorization foundation now, but defer public UI, pricing cards, and purchase flows until the three commercial proof sequences are complete.

This is an additive foundation. It must not change the current default: every user owns a private workspace and all current proof-pack data remains account-isolated.

The reason to build the foundation early is that delegated uploads and shared workflow execution affect data ownership, authorization, provenance, and MCP behavior. Deferring those boundaries until after enterprise sales would create avoidable migration and security risk.

## Product model

Every user continues to have a private personal workspace. A user may optionally grant another authenticated user narrowly scoped access to a saved workflow, report, dashboard, or intake folder.

An organization workspace is a separate future surface. Items saved in that workspace are visible to permitted organization members. Individual sharing remains an optional convenience, not the primary collaboration model.

```text
Private workspace (default)
  ├── private files, datasets, mappings, reports, dashboards
  └── optional delegated grants
        └── submitter / operator / viewer / editor access to one workflow

Organization workspace (Business/Enterprise)
  ├── organization members and roles
  ├── shared datasets, mappings, reports, dashboards
  └── organization-level policy, billing, audit, and revocation
```

## Delegated workflow use case

The owner can authorize a colleague, assistant, contractor, or buddy to continue a specific workflow while the owner is unavailable.

Example:

> Jordan may upload this month’s files into Alex’s monthly-report intake folder and run the refresh. Jordan cannot access unrelated files, change the mapping, invite members, or delete Alex’s workspace.

The uploaded file remains in the owner’s workspace. The system records both the workspace owner and the acting user:

- `owner_user_id`: whose workspace and data the file belongs to
- `actor_user_id`: who uploaded, reviewed, refreshed, or changed it

All delegated uploads use the existing lifecycle:

```text
delegated upload → _inbox → prescan → quarantine/rejection if needed → process → normalize → review → refresh
```

## Permission levels

| Permission | Scope |
|---|---|
| Viewer | View a shared report or dashboard result |
| Submitter | Add files to a designated workflow/folder |
| Operator | Add files, review exceptions, and run/refresh the workflow |
| Editor | Change mappings, relationships, report definitions, or visuals |
| Owner | Full control, sharing, revocation, and deletion |

Evidence access must be separate from report access. A recipient may be able to see a report without being able to open every underlying source file.

## Current implementation status

The current code has no general sharing mechanism.

- `datasets`, dataset columns, and dataset rows are owner-read only.
- Virtual dataset definitions are owner-only.
- Dashboard pages and visuals are owner-only.
- Reports and mappings are validated against the requesting owner’s accessible objects.
- The CPA/firm mechanism supports firm administrators, client enrollment, seats, and selected exports, but it is not delegated workflow sharing or collaborative editing.

The existing firm foundation can later provide organization membership, seats, billing, and administrator roles. It should not be treated as the sharing implementation itself.

### Historical firm-flow proof

Owner clarification, September 11–12, 2026: the remembered test covered registration through the partner link, tagging the user to the partner, and listing/tallying the occupied seat. Preserve this as owner-reported historical evidence; it has not been rerun in this session.

`CODEX_BRIEF_partner_onboarding_review.md` describes an earlier smoke test but also requests further verification of entitlement, billing webhooks, renewal, and invitations. `CODEX_FOLLOWUP_partner_intake_email_redirect.md` describes intended behavior and acceptance criteria, not a recorded successful execution. Neither should be treated as proof that all those checks passed.

Purchase flow, payment-to-seat crediting, renewal, and the actual client data/report workflow remain unverified. Do not infer that test-mode checkout passed merely because live purchase was deferred.

## Foundation to build now

### 1. Share-grant data model

Add a narrowly scoped, revocable grant model for saved artifacts and intake targets. Grants should identify:

- owner user
- recipient user
- artifact or workflow
- destination folder, if upload is allowed
- permission level
- evidence visibility
- created, updated, revoked, and optional expiry timestamps

Do not add public anonymous links in the foundation.

### 2. Actor-aware provenance

Preserve current `user_id` ownership semantics. Add actor attribution to upload, processing, review, refresh, correction, and export events where needed. Existing records must continue to resolve to the owner’s workspace.

### 3. Authorization service boundary

Create one server-side authorization path that answers:

- Is this user the owner?
- Is this user an active delegate?
- What artifact/workflow is in scope?
- What operation is allowed?
- May the user see source evidence?

Do not scatter ad hoc recipient checks across upload, reports, dashboards, and MCP handlers.

### 4. Delegated ingestion path

Allow a `Submitter` or `Operator` to upload only into the granted intake folder/workflow. The file should be stored under the owner’s account, pass through the same prescan and normalization pipeline, and record the acting user.

### 5. MCP enforcement

Apply the same grant checks to MCP tools. A delegated MCP user must not gain broader access merely because the request arrives through Claude or another client.

## Deferred surface and commercial work

Do not add these before proof completion unless a real pilot requires them:

- public sharing UI
- organization workspace UI
- Business/Enterprise pricing cards
- Business/Enterprise checkout products
- public invite management pages
- white-label portals
- anonymous share URLs
- full collaborative editing

The pricing page can continue showing only the current introductory plans. The latent Business entitlement and concealed firm/seat mechanism may remain available for controlled testing and future migration.

## Organization workspace path

After proof validation, introduce organization workspaces rather than making every shared item a special case.

Recommended behavior:

1. User creates or joins an organization.
2. User retains a private personal workspace.
3. Organization members receive roles: owner, admin, editor, reviewer, viewer.
4. New shared datasets, mappings, reports, and dashboards are owned by the organization workspace.
5. Personal artifacts can be published or copied into the organization workspace.
6. Organization policies control evidence access, retention, export, and revocation.

This is more maintainable than treating a large enterprise as a collection of user-to-user shares.

## Rollout sequence

### Phase A — current proof

- Keep all three proof sequences account-isolated.
- Record sharing/delegated upload as a known capability gap.
- Do not modify report semantics or ingestion behavior for hypothetical collaboration.

### Phase B — foundation

- Add share grants and scoped authorization.
- Add actor-aware audit/provenance fields.
- Add delegated upload into an owner-designated workflow/folder.
- Add read-only delegated report execution.
- Test revocation, expiry, cross-account denial, evidence restrictions, and MCP parity.

### Phase C — organization workspace

- Generalize the existing firm/seat foundation into organization membership.
- Add organization-owned artifacts and shared visibility.
- Add role-based controls and member administration.
- Retain private personal workspaces.

### Phase D — commercial packaging

- Add Business/Agency pricing and checkout.
- Decide whether billing is per organization, active workspace, client workspace, seat, or refresh volume.
- Add Enterprise controls only when a customer requires them: SSO, formal audit exports, retention policy, data-region controls, and support commitments.

## Acceptance criteria for the foundation

- A user can share one workflow with another authenticated user without sharing unrelated workspace data.
- A delegated Submitter can upload only to the designated intake target.
- A delegated Operator can review and refresh only the granted workflow.
- The owner remains the data owner.
- Every delegated action records the actor.
- Revocation takes effect immediately.
- Expired grants cannot be used.
- Source evidence access is independently controlled.
- MCP and in-app authorization produce the same result.
- Existing owner-only behavior and all proof-pack tests continue to pass.

## Final assessment

The capability is strategically important, but it is not a reason to delay commercial proof. Build the security and authorization foundation as a small additive increment, then defer the visible collaboration product until customers demonstrate that delegated operation or shared workspaces affect purchasing decisions.

## Accepted sequencing update — September 12, 2026

The approved scope is the full concealed backend with the dual personal/organization model. This supersedes earlier wording that deferred all organization backend work until after proof.

1. Build and locally verify collaboration, delegated operation, organization ownership, and billing preparation.
2. Claude produces the CF, agency/BPO, and property-operation fixtures and answer keys. Expand the app/API and MCP test sequences to include a second authenticated user, delegated submissions, organization membership, and revocation.
3. During the testing phase, inventory Creem product configuration and wire test-mode checkout, signature verification, payment-to-seat crediting, and renewal. Record exact evidence; public prices and live purchases require separate commercial setup.
4. Fix failures and rerun affected sequences plus regression checks.
5. Fold sharing controls, workspace switching, membership management, purchase flows, pricing presentation, onboarding, and copy into the UI/UX polish phase. Repeat user-facing acceptance tests once those controls exist.
6. Complete the pre-sales security pass and Claude listing preparation, then proceed to acquisition and distribution.

Additive implementation still changes authorization and ownership boundaries. Passing the existing private-workspace tests is required; additive does not imply regression-free.

## Implementation checkpoint — September 12, 2026

Implemented: `lib/collaboration-policy.ts`, `lib/collaboration-access.ts`, `scripts/test-collaboration-policy.ts`, additive migration `20260912090000_collaboration_foundation.sql`, protected access/submission endpoints, grant lifecycle endpoints, and organization creation/member invitation/acceptance endpoints. The migration is deployed. The pure contract is covered by executable tests; the server resolver loads trusted workflow, grant, and membership rows with the service role before evaluating access, and audit writes preserve actor attribution without sensitive payloads. Sharing is still not exposed in user-facing UI. MCP delegated ingestion and status lookup are wired; organization-owned ingestion remains intentionally deferred until the organization data layer exists.

The contract requires accepted, unrevoked, unexpired grants; exact target identity and kind; exact intake-folder matching; active organization membership; and separate evidence/export permission. Submitters cannot read data. Operators can view, submit, review, and run. Editors additionally edit. Delegates cannot manage sharing or delete the target. Organization reviewers review without triggering a refresh; organization administrators manage resources. Organization evidence and export policy applies to administrators too.

### Integration decisions

- Authenticate the actor before loading trusted resource, grant, and membership snapshots. Never pass client-provided permission snapshots to the policy evaluator.
- A workflow is an explicit saved binding of an intake folder and selected outputs. Upload permission does not follow arbitrary report dependencies or folder descendants.
- An allowed decision covers one target and action only. Output executors resolve dependencies internally and return a purpose-built response. They must not expose arbitrary owner queries, raw source rows, paths, signed URLs, or dependency catalogs as a side effect of report sharing.
- Personal delegated runs consume the owner's entitlement and usage allowance. Record the actor independently. Organization runs consume the organization allowance. A seat is a billing allocation, not a data-access grant.
- Recheck grants on each request and before queued work starts. Revocation prevents new work and result access; it cannot recall downloaded exports. Record any job already admitted when revocation occurs.
- Organization resources must have an explicit organization ownership boundary. Do not manufacture a shared login or place all organization data under an administrator's personal user ID. Audit user-based queries and account-deletion cascades before enabling this path.
- Invites become active only after authenticated acceptance. Member removal revokes membership; it does not delete organization data. Revocation and removal preserve attributable audit records subject to the retention policy.
- Copying a definition into an organization is not sufficient if it references personal sources. Publishing must include authorized dependencies or refuse with a clear dependency list. Never silently broaden a personal grant.
- Keep the established firm tables and purchased-seat ledger intact. Link the future organization record to a legacy firm once, and migrate memberships explicitly. Do not automatically convert every enrolled client into a member with access to other clients' data.

### Remaining build work

- Persist workflow bindings, invitations, grants, organization membership, and actor audit events with server-only mutation and ownership validation.
- Wire the trusted authorization resolver into delegated upload, execution, review, export, and MCP entrypoints; preserve current personal routes.
- Add organization ownership throughout ingestion, storage, derived data, report dependencies, deletion, and metering.
- Build the concealed management APIs and billing adapter; verify seat crediting and renewal using provider test-mode evidence.
- Add database and route integration tests. The pure policy test alone does not certify RLS, storage paths, races, or endpoint enforcement.
- Supply Claude with the expanded acceptance matrix and record the outcomes of both transport paths.
