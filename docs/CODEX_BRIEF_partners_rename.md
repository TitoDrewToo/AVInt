# Codex Brief — Rename "For Accountants" → "Partners"
### Small front-end rename; backend already uses "partner" naming.

## Scope
- **Nav label:** change "For Accountants" → **"Partners"** in `components/navbar.tsx` (desktop +
  mobile).
- **Route:** rename `/for-accountants` → **`/partners`** — move `app/for-accountants/` →
  `app/partners/` (page.tsx + actions.ts). Keep the same content (the page still targets
  accounting-firm partners; the label is just broader).
- **Redirect:** add a permanent redirect `/for-accountants` → `/partners` (in `next.config` or a
  redirect route) so existing links/emails/decks don't break.
- **Metadata/SEO:** update the page title, OpenGraph/Twitter URLs, and JSON-LD `url` from
  `/for-accountants` to `/partners`.
- **Sitemap:** update `app/sitemap.ts` (`/for-accountants` → `/partners`).
- **Internal links:** update any references to `/for-accountants` across the app to `/partners`.
- **No DB change:** `partner_inquiries` table + `submitPartnerInquiry` already use partner naming —
  leave as-is.

## Also rename the client-facing intake route: `/cpa/[slug]` → `/partner/[slug]`
- Move `app/cpa/[slug]/` → `app/partner/[slug]/` (page.tsx, firm-intake.tsx, actions.ts, and the
  `dashboard/` subroute).
- Update **all** internal references from `/cpa/` to `/partner/` — the firm dashboard links, the
  provisioning/admin link generation, JSON-LD, sitemap, and anywhere a firm's shareable URL is
  built (it should now render `avintph.com/partner/[slug]`).
- Add a permanent redirect `/cpa/[slug]` → `/partner/[slug]` (and `/cpa/[slug]/dashboard` →
  `/partner/[slug]/dashboard`) so nothing breaks.
- Keep `firms.slug` and DB unchanged — only the URL path changes.

## Acceptance
- `/partners` live; `/for-accountants` 301/permanent-redirects to it; nav reads "Partners";
  sitemap + metadata updated; inquiry form still writes to `partner_inquiries`.
- TypeScript + lint + build pass.
