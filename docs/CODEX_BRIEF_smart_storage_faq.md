# Codex Brief — Smart Storage FAQ (collapsible accordion)

Add an appealing, **collapsible** FAQ section to the Smart Storage product page. Compact by
default (only questions visible) so the page doesn't read like a wall of text; users expand a
row to read the answer.

## Content
Use the copy verbatim from `docs/smart-storage-faq.md` (13 Q&As). Do not edit the wording —
it's accuracy-checked (connector = Pro/Business; Claude does tax-bundle/business-expense +
QuickBooks/Xero export only; exports are import-ready files, never "sync"; not tax advice).

## Placement
`app/products/smart-storage/page.tsx` — new section **after** the "Now works inside Claude"
section and **before** the final CTA. Eyebrow: "FAQ" (same `text-sm uppercase tracking-wider
text-primary` style as other section eyebrows). Heading: "Questions, answered."

## Component / interaction
Reuse the pattern already in the repo (`app/tools/smart-storage/connect/connect-client.tsx`
uses `<details>` + `group-open:rotate-180`). Build each FAQ as a styled native
`<details>`/`<summary>` so it's accessible and works without JS:

- Each row: `<details className="group ...">` with a `<summary>` holding the **question**
  (always visible) + a chevron icon on the right that rotates on open
  (`transition-transform group-open:rotate-180`).
- The **answer** sits below the summary, revealed on open.
- Rows independently toggle (native details) — no single-open accordion needed.
- Remove the default summary marker (`[&::-webkit-details-marker]:hidden`,
  `list-none`, `cursor-pointer`).

## Styling (match the page)
- Wrap in `max-w-3xl mx-auto`; stack rows with a small gap.
- Each row: `glass-surface-sm rounded-xl border border-border/60`, padded (`p-5`), with the
  existing `hover-bloom` treatment; question in `font-medium text-foreground`, chevron in
  `text-primary`; answer in `text-sm text-muted-foreground mt-3 leading-relaxed`.
- Wrap the section in `FadeUp`; stagger the rows with `StaggerContainer`/`StaggerItem` like
  the other sections. Keep the `retro-grid-bg` opacity treatment consistent with neighbors.
- Smooth open feel: it's fine to keep native details toggle; optionally animate the chevron
  and a subtle content fade. Don't add heavy JS.

## Optional (nice-to-have, not required)
Light grouping with small sub-labels — "Getting started", "Works with Claude", "Plans &
security" — if it reads better; otherwise a single list in the copy's order is fine.

## Verify
- `npm run build` passes.
- Section renders collapsed (only questions show); clicking a row expands its answer; chevron
  rotates; keyboard/`<summary>` focus works.
- Copy matches `docs/smart-storage-faq.md` exactly.
