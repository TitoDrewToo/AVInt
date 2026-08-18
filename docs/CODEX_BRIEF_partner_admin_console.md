# Codex Brief — Internal Partner Admin Console
### A browser path for the operator (Andrew) to run the partner channel. System-admin only.

## Why
Provisioning a firm today is only a curl to `POST /api/internal/firms`. Give the operator a real
web flow to see leads, provision firms (generate their link), and monitor seats.

## Auth
Gate the whole console to the **system admin** using the existing system-admin mechanism
(`lib/system-admin` / `getSystemAdminUser`). Adapt for a **session-based page** (the logged-in
Supabase user must be the system admin) — not a bearer token. Non-admins get 403/redirect.

## Page: `app/admin/partners/page.tsx` (server component + small client bits)
Three sections:

### 1) Partner inquiries (inbound leads)
- Read `partner_inquiries` (service role): name, firm, email, client_count, message, status,
  created_at, newest first.
- Allow updating **status** (new → contacted → qualified → closed) inline.

### 2) Provision a firm (generates the link)
- Form: firm name, slug (auto-suggest URL-safe from name, editable), admin email, logo URL
  (optional), notes (optional).
- On submit, run the existing provisioning logic (reuse `POST /api/internal/firms` server-side, or
  factor its logic into a shared function called by both). It creates the firm, invites the admin
  by email, links `firm_admins`.
- On success, **display the generated link `https://www.avintph.com/partner/[slug]`** as copyable
  text + confirm the admin invite was sent. Surface the "slug already in use" (409) error cleanly.

### 3) Firms overview
- List all firms: name, slug, status, founding, **seats_purchased / seats_used**, created_at.
- Each row links to that firm's dashboard (`/partner/[slug]/dashboard`).

## Notes
- Reuse existing components/styles. No client-facing pricing.
- Respect RLS/service-role boundaries; this page uses service-role reads behind the system-admin
  gate only.
- Assumes the `/cpa` → `/partner` rename (companion brief) is applied, so links use `/partner/`.

## Acceptance
- `/admin/partners` reachable only by the system admin.
- Operator can: view + re-status inquiries; provision a firm and copy its `/partner/[slug]` link;
  see all firms with seats used/remaining.
- TypeScript + lint + build pass.
