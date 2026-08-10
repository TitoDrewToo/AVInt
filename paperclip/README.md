# Paperclip — AVIntelligence Autonomous Operations Team

Paperclip is the autonomous agent layer that runs AVIntelligence's outbound,
content, and service operations. It exists so the founder can spend time on
calls, customers, and product — not on lead research, message drafting, or
pipeline tracking.

## Operating Model

Paperclip is **draft-and-approve**, not autopilot. Agents do the work; the
founder reviews, edits, and sends. Nothing customer-facing leaves Paperclip
without a human touching it.

The only fully-automated steps are:
- Lead research and scoring (no contact made)
- Pipeline status digests (read-only)
- Internal product-feedback synthesis (read-only)

Anything that touches a prospect, customer, or public surface is queued for
founder approval in the admin UI.

## Team Roster

| # | Agent | Cadence | Model | Outputs |
|---|---|---|---|---|
| 1 | Lead Researcher | Daily | Haiku 4.5 | Qualified leads with hooks |
| 2 | Outbound Writer | On new lead | Sonnet 4.6 | Email + LinkedIn DM drafts |
| 3 | Reply Drafter | On inbound reply | Sonnet 4.6 | Response drafts |
| 4 | Pipeline Tracker | Daily 8am | Haiku 4.5 | Founder digest email |
| 5 | Community Monitor | Daily | Sonnet 4.6 | Reddit/FB comment drafts |
| 6 | SEO Producer | Daily | Sonnet 4.6 | Long-form blog drafts |
| 7 | Concierge Ops | On new delivery | Haiku/Sonnet | DFY checklists + comms |
| 8 | Sales-Product Feedback | Weekly | Opus 4.7 | Ranked product improvements |

Each agent is a markdown spec in `agents/` defining its mission, inputs,
outputs, system prompt, guardrails, and success metrics. Implementation
(Anthropic SDK + cron + Supabase) follows the specs.

## Shared References

All agents read from `shared/` for consistency:

- `voice-and-tone.md` — founder voice rules; every writing agent follows this
- `icp-bookkeepers.md` — primary ICP for outbound and content
- `icp-extension-filers.md` — secondary ICP for DFY service
- `product-positioning.md` — what AVInt is and is not (the lines we don't cross)

## Architecture (build-time)

```
Cron (Vercel)
  └─> Agent runner (Anthropic SDK)
        ├─> Reads:  Supabase (leads, conversations, deliveries)
        ├─> Reads:  shared/ specs as context
        └─> Writes: Supabase (drafts table) — status=pending_approval
              │
              └─> Admin UI (/admin/paperclip)
                    └─> Founder: approve / edit / reject
                          │
                          ├─> Send via Instantly (email)
                          ├─> Copy to clipboard (LinkedIn DM, Reddit)
                          └─> Mark sent in conversations table
```

## Cost Envelope

- Anthropic API: ~$30–80/mo at moderate volume
- Instantly (email warmup + send): $37/mo
- Lead data: $0 to start (public directories + manual seed)
- Hosting: $0 (rides on existing Vercel + Supabase)
- **Total: $70–170/mo**

For comparison: a single offshore VA = $800–2,000/mo, runs 8 hours not 24.

## Build Phases

1. **Foundation** (Days 1–3) — Supabase schema, admin UI, base agent runner
2. **Outbound** (Days 4–7) — Lead Researcher + Outbound Writer + Instantly send
3. **Reply + tracking** (Days 8–10) — Reply Drafter + Pipeline Tracker
4. **Content + community** (Days 11–14) — SEO Producer + Community Monitor
5. **Service ops** (Days 15–21) — Concierge Ops + Sales-Product Feedback

Day 21: Paperclip operational. Founder time commitment ≈ 90 min/day of
approvals + replies + calls. Everything else runs on the agent layer.

## What Paperclip Does NOT Do

- **No autopilot send** to prospects, customers, or public surfaces
- **No invented facts** about leads (no fake shared connections, no fabricated stats)
- **No tax-prep claims** (product is an organizer, not a filing tool)
- **No vendor lock-in** to fragile scrapers or LinkedIn automation tools
- **No replacing founder judgment** on pricing, partnerships, or first-customer interviews
