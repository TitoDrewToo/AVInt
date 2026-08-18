# Claude Handoff — AVIntelligence Homepage Positioning

**Saved:** 2026-08-12
**Purpose:** Preserve the full strategic response for Claude's review and copy drafting after the four-day handoff gap.

## Context

The decision is to keep Smart Storage as AVIntelligence's flagship and avoid a homepage overhaul. The site should remain product-led while adding a light, discoverable path for selected client projects. The desired positioning is:

> AVIntelligence builds its own intelligent products—and applies the same systems-building practice to selected client projects.

Claude should analyze the existing homepage and draft the copy additions, preserving the current visual direction, product hierarchy, and Smart Storage emphasis.

## Full previous response

I agree—do not overhaul the homepage. Smart Storage should remain the flagship and the primary product story.

The current page already has the right structural opening: “What AVIntelligence builds.” The smallest effective change is to add a second sentence there and one contextual CTA.

Suggested placement:

1. In the existing “What AVIntelligence builds” section

After:

> Our systems transform files and activity into structured data that powers dashboards, reports, and decision-making.

Add a short line such as:

> We also build bespoke web applications, internal tools, and intelligent workflows for teams with problems too specific for off-the-shelf software.

Then add a quiet text link:

> Have a system in mind? Talk to AVIntelligence →

2. Between Products and Pricing

Add a small section—not a new homepage direction—with a heading like:

> Built for our products. Available for yours.

Copy:

> Smart Storage and Smart Dashboard are our flagship systems. The same engineering practice is available for selected client projects, from operational dashboards and document workflows to custom web applications.

CTA:

> Discuss a project

This is probably the most important placement because visitors have already seen your products and are now ready to understand the broader firm.

3. In the footer

You already have `support@avintph.com` in the footer. I would not leave it labelled only as support if you want it to receive project inquiries.

Use two visible links:

- Support
- Projects & partnerships

Both can temporarily point to the same inbox, with a subject line such as:

`mailto:support@avintph.com?subject=Project%20inquiry%20for%20AVIntelligence`

That avoids creating another mailbox immediately. Later, create `studio@avintph.com` or `projects@avintph.com` and route it to the same place.

4. In the metadata

The current description is product-focused. Keep Smart Storage first, but add the firm layer:

> AVIntelligence builds Smart Storage and Smart Dashboard—intelligent systems for documents, reports, and business workflows. We also build selected custom web applications and internal tools for clients.

This makes the broader positioning visible when the site is shared or discovered through search.

Your positioning should therefore be:

> AVIntelligence builds its own intelligent products—and applies the same systems-building practice to selected client projects.

That is more credible than presenting yourselves as a generic agency.

A good brief for Claude would be:

> Analyze the current AVIntelligence homepage and preserve Smart Storage as the flagship product. Do not recommend a visual overhaul, new navigation architecture, or generic agency positioning. Draft minimal copy additions that communicate three ideas: AVIntelligence owns and develops its own products; we are systems builders; we accept selected client projects involving dashboards, internal tools, document workflows, and custom web applications. Recommend exact copy placement in the existing What We Build section, between Products and Pricing, the footer, and metadata. Keep the tone technical, restrained, and product-led. Use support@avintph.com temporarily for project inquiries, but distinguish project inquiries from customer support in the visible label.

The key is to make the client-work path discoverable without making it compete with Smart Storage.

## Relevant current implementation locations

- Homepage composition: `avint/app/page.tsx`
- Existing firm-positioning section: `avint/components/sections/what-we-do.tsx`
- Product cards: `avint/components/sections/products.tsx`
- Footer and current support email: `avint/components/footer.tsx`
- Homepage metadata: `avint/app/page.tsx`

## Handoff instruction

When Claude resumes, it should first inspect the current homepage in the above files, compare the existing rendered experience with this handoff, and then draft copy options before making any implementation changes.
