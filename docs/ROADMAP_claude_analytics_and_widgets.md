# Roadmap — Claude as an Analytics + Widget-Authoring layer for Smart Dashboards

Status: **roadmap — sequenced AFTER the P1 Reports & Exports Accuracy review.** Pinned so the
vision isn't lost. Not to be built or added to marketing copy until shipped.

## The thesis
Smart Storage is the persistent, structured system-of-record. Claude (two surfaces) becomes the
*director* over that data. This is the concrete "expansion of Advanced Analytics" and the upgrade
path for Smart Dashboards. The moat is the persistent structured data layer both Claude surfaces
read/write against — captured in the new "Why use Smart Storage if I can just upload to Claude?"
FAQ.

## Two surfaces (complementary — keep both)
- **The connector** (external Claude, Pro/Business): operates in Claude's chat; returns data/files;
  can persist widgets via a write-tool.
- **The in-page assistant** (`components/product-assistant-preview.tsx`, `lib/product-assistant.ts`,
  `app/api/chat/route.ts`): currently a wiki/FAQ retriever; lives inside the app, available to all
  users, and can render/save widgets live in the dashboard. Not obsoleted by the connector.

## Phase 1 — Read-only analytics/query tool (do first, after P1)
Add a connector tool (e.g. `smart_storage.query` / `smart_storage.analytics`) that returns bounded,
filterable structured data and/or the same aggregates Smart Dashboards use (by date, category,
vendor, doc type). Claude then answers ad-hoc questions and generates output files (CSV/summary)
natively in chat. Claude explores freely; anything filing-grade routes through the vetted report/
export tools. Must respect payload limits (we already hit the 561 KB report ceiling — return
aggregates/pages, not raw dumps).

## Phase 2 — Widget authoring on Smart Dashboard (the crown jewel)
Reuse what already exists — do NOT reinvent rendering:
- `supabase/functions/_shared/widget-schemas.ts` — validated widget spec (`WidgetTypeSchema`,
  `AdvancedChartFamilySchema`, `HaikuSpecWidgetOutputSchema`). Advanced Analytics already
  AI-authors widgets from this.
- `lib/dashboard-layout.ts` / `lib/dashboard-preferences.ts` — per-user saveable layout.

Add a **write path** so the user can *direct* widget creation, from either surface, both writing
the SAME schema:
- **Connector:** a `smart_dashboard.create_widget` tool that accepts a spec conforming to the
  existing widget schema, validates (Zod), scopes to the user's own dashboard, and persists via the
  layout model. "Make me a widget of monthly software spend" → appears in Smart Dashboard.
- **In-page assistant:** wire the hidden chat box to the same widget-generation pipeline for live,
  in-app authoring.

## Non-negotiable guardrail (ties to P1)
**Claude authors the widget's shape/intent; the vetted engine computes the underlying data.**
A Claude-authored widget must pull its numbers through the same aggregation the accuracy review
covers — never Claude's ad-hoc math — so a good-looking chart can't display a wrong total. Widget
writes are scoped strictly to the user's own dashboard and validated against the schema.

## Sequence
P1 accuracy foundation → Phase 1 (read-only query/analytics) → Phase 2 (widget authoring, both
surfaces). Only after each ships do we update product/FAQ copy to advertise it.
