# Advanced Analytics — Hero Drill-Downs

## Purpose

Advanced Analytics is shifting from "more charts" toward "meaningful drill-downs that feel alive."

This document prescribes the small set of **hero drill-down surfaces** that may be rendered using Three.js, the activation rules that gate them, the renderer split against the standard dashboard, and the data gaps that currently block specific drills.

This document should be read alongside `advanced-analytics.md` (pipeline direction), `advanced-analytics-correlations.md` (full correlation inventory from which this shortlist was drawn), and `advanced-analytics-spendpack.md` (stress-test corpus). It is not a replacement for any of them.

## Relationship to Smart Dashboard

Strategic framing already established in the Smart Dashboard direction:
- financial visuals are the interface
- AI-derived context is the differentiator
- Advanced Analytics is the pipeline

Hero drill-downs are the surface where interpretation becomes visibly *experienced*, not just displayed. They exist to produce consumer-excitement moments — the kind of outputs users screenshot, share, and renew subscriptions for — while the standard dashboard and the Recharts families continue to carry the accountant-grade work.

## Renderer Split

The split is a hard rule, not a preference.

### Recharts (standard, pushed)

All standard chart families stay on Recharts and are pushed visually using:
- SVG gradients (linear and radial)
- Filter effects (Gaussian blur, drop shadows, feMerge for glow)
- Custom shapes on bars, lines, dots, pies
- Custom tooltips and legends
- Real interactivity (brush, drill-click, synchronized cursors, cross-filter)
- Motion patterned on the homepage sphere grammar (eased mount, state-reactive morph)

This covers: Time Series, Composition, Comparison, Composed Time Series, Banded Time Series, Stacked Composition, Timeline, and all variants listed in `lib/advanced-analytics-config.ts`.

### Three.js (hero drill-downs only)

Three.js is reserved for the drill-down shortlist below. It is **not** used for:
- 3D versions of bar, line, area, or pie charts (perceptually distorting, well-established anti-pattern)
- Standard composition and comparison charts
- Dense tabular readings where precise value reading matters
- Any surface where accessibility would be compromised without a practical fallback

## Drill-In Rule

Hero drill-downs are entered *from* a summary tile, never in place of one.

- The 2D Recharts tile is always the summary and the default presentation.
- The 3D drill is explicit — triggered by user action (a drill icon, tile click, or explicit "explore" affordance).
- Closing the drill returns the user to the 2D summary with state preserved.
- 3D surfaces never auto-open on page load.

This preserves scan-speed for returning users while making exploration available when wanted.

## Approved Drill-Down Shortlist

Six drill-downs are approved. No additional Three.js surfaces should be proposed without explicit approval.

### 1. Vendor Ecosystem Orbit

Shows each merchant domain as a central mass, with vendors orbiting by spend proximity. Cluster shapes reveal behavioral groupings (lunch vendors, subscription cluster, utilities cluster). Rotating and zooming into a cluster drills to vendor detail.

Signals: `vendor_normalized`, `expense_category` (or `merchant_domain` once first-class), `total_amount`, `document_date`.

Drilled from: vendor concentration tile, category composition tile.

### 2. Spending Constellation (Geo)

A 3D globe or mapped plane where each transaction is a point of light. Size encodes spend, glow encodes frequency, color encodes domain. Rotatable, zoomable, clickable at the point level to drill to the receipt.

Must comply with the spend-geography guardrail in `advanced-analytics.md` — merchant/transaction location only, no movement or route reconstruction.

Signals: merchant address (currently inside `raw_json` / `line_items`, not first-class — see Data Gaps), `total_amount`, `expense_category`, `currency`.

Drilled from: geography summary, travel spend tile, "where you spend" callout.

### 3. Temporal Rhythm Field

A calendar rendered as a 3D heightfield. Each day is a cell; height encodes spend magnitude, color encodes dominant domain for that day. Rotatable to reveal weekday/weekend ridges, payday ripples, and dormant stretches.

Signals: `document_date`, `total_amount`, `expense_category`.

Drilled from: time-shape tiles (weekday/weekend composition, payday ripple).

### 4. Anomaly Pulse Field

All transactions rendered as particles on a time × amount plane. Outliers flare and pulse using the sphere's signal-reactive grammar. Clicking a particle drills to the document and opens contextual explanation.

Signals: `document_date`, `total_amount`, `expense_category`, anomaly flag.

Drilled from: anomaly callouts, banded time-series tiles.

### 5. Year-in-Review Recap

A cinematic, story-paced scene in sphere grammar. Not an always-on widget — this is an *event* that appears at annual or seasonal cadence. Chapters cover top vendors, biggest splurge, discount savings, pattern shifts, and spender archetype.

Signals: all normalized fields plus derived annual aggregates.

Availability: annual cadence only; opt-in surface.

### 6. Fuel / Transit Price Map

Primary presentation is a 2D map showing fuel or transit vendors (e.g. stations) at their locations, sized or colored by price metric. A 3D constellation variant can be offered as a secondary view inside the same drill for consumer appeal.

**Accuracy constraint (important):** a true "price per liter" comparison requires liters or unit-quantity captured from the receipt. This is not guaranteed in current extraction, so two modes must be supported:

- If unit quantity is present on enough receipts at a given vendor, the drill shows **price per liter** and is labeled as such.
- If unit quantity is missing or sparse, the drill shows **average ticket size per branch** or **average ticket size per brand**, and must be labeled accordingly. It must not be presented as a per-liter comparison.

This rule exists to maintain the standard that labels and disclaimers must not overstate the accuracy of the underlying math.

Signals: `vendor_normalized` (brand), merchant address/branch (from `raw_json` / `line_items`), `total_amount`, `document_date`, unit-quantity fields from `line_items` when available, `currency`.

Drilled from: transport/fuel category tile, or a dedicated "fuel cost" callout when sufficient fuel transactions exist.

## Activation Logic

Each drill-down is gated by minimum data density so outputs are meaningful rather than decorative.

| Drill-down | Minimum threshold |
|---|---|
| Vendor ecosystem orbit | ≥ 15 vendors and ≥ 60 transactions |
| Spending constellation | ≥ 30 address-bearing transactions |
| Temporal rhythm field | ≥ 90 days of transaction history |
| Anomaly pulse field | ≥ 90 days of history and ≥ 1 outlier detected |
| Year-in-review recap | Annual cadence (or seasonal event window) |
| Fuel / transit price map | ≥ 8 fuel transactions across ≥ 2 branches |

Below threshold, the corresponding 2D tile still renders; the drill affordance simply does not appear, with an optional "unlocks with more history" microcopy.

## Tier and Accessibility

- **Tier gating:** hero drill-downs are Pro / subscriber surfaces.
- **Reduced motion:** every 3D surface must ship with a non-animated fallback — a data table or static SVG view reachable through the same entry point. `prefers-reduced-motion` must disable animation and particles without disabling the data.
- **Keyboard and screen reader support:** drill entry points must be keyboard reachable. The fallback presentation is the canonical accessibility path.
- **Mobile:** each 3D drill must have a lighter mobile presentation or fall back to the 2D path on low-end devices.

## Data Gaps

The following normalization gaps block higher-value drills. None are blockers today; all are the obvious next upgrades when we commit to this layer.

- **Merchant address / city / neighborhood as first-class fields.** Currently sits inside `raw_json` / `line_items`. Required for constellation, fuel map, and any travel-vs-home analytic.
- **Merchant domain tag as its own column.** Currently folded into `expense_category`. An explicit `merchant_domain` column unlocks the ecosystem orbit at full fidelity and supports domain-aware analytics across the pipeline.
- **Recurrence flag and cadence.** Detected today but not persisted. Needed for subscription overlap, missing-recurring detection, SaaS price creep surfaces.
- **Line-item unit fields (quantity, liters, etc.).** Required for defensible fuel price-per-liter, per-unit comparisons, and any quantity-sensitive analytic. Without these, fuel drills remain at ticket-level accuracy only.

## Build Order

Hero drill-downs do not start construction until the tools-page UI host is ready.

Rationale:
- The current tools-page layout is too limiting to present hero drill-downs well. Glass treatments, button vocabulary, workspace canvas, collapsible panels, and toolbar patterns must first be refreshed to match the design language of the homepage and product pages.
- Without that host, even excellent 3D widgets will feel misplaced.

Sequence:
1. Tools-page UI refresh (patterned on homepage and products pages).
2. One Three.js hero drill-down built as the prototype. Recommended first: **Vendor Ecosystem Orbit** — signals are already available (`vendor_normalized`, `expense_category`, `total_amount`), signals are strong enough to avoid data gaps, and it produces a "that's me" moment in under five seconds.
3. Remaining drill-downs follow one at a time, reusing the prototype's trigger pattern, activation threshold, Pro gating, and reduced-motion fallback.

## Out of Scope for This Layer

To keep this layer disciplined and novel:
- 3D versions of standard chart families.
- AI-generated captions presented as substantive analytic output (already excluded by `advanced-analytics.md`).
- Movement, route, or location-tracking narratives (already excluded by the spend-geography guardrail).
- "Widget volume" competition with the standard dashboard — the hero layer produces few, meaningful surfaces, not many.

## Principle

The hero drill-down layer should feel like the sphere's quieter, more purposeful cousins — calm at rest, alive when the user is exploring, and grounded in the user's actual records. It exists to turn context into an experience, not decoration.
