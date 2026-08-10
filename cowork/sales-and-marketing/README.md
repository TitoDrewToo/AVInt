# AVIntelligence Sales and Marketing — Claude Cowork Project

This folder holds the context documents for the **AVIntelligence Sales and Marketing** Claude Project (claude.ai/projects) and the associated Claude Cowork tasks (Claude Desktop).

## Purpose

The Project drives three roles, all conversational, all human-approved:

1. **Strategy & planning** — reads market signals, reviews replies, recommends next moves.
2. **Marketing / copywriter** — drafts every outbound and reply in the founder's voice, respecting ICP and product positioning.
3. **Sales execution** — runs scheduled drafting + monitoring tasks via Claude Cowork; outputs land in approval-friendly destinations (Gmail Drafts, etc.) for human review before send.

The same Project (or sibling Projects) is accessed from desktop OR phone (Claude.ai mobile). Cowork tasks run on the founder's Mac and surface drafts for phone-based approval.

## What goes in here vs. elsewhere

- **This folder:** durable context docs that the Project loads (ICPs, positioning, voice, strategy state). Updated infrequently.
- **Claude Project (in claude.ai):** loads these files as project knowledge. Conversations happen there.
- **Claude Cowork tasks (in Claude Desktop):** reference this folder's content via the Project, scheduled to run at chosen cadences.
- **`paperclip/`** (the older directory with the same-shaped specs): superseded for sales/marketing. Kept for reference until verified that Cowork covers everything paperclip-1 specced. Do NOT load both paperclip/ AND cowork/sales-and-marketing/ into the same Project — pick one source of truth (this one).

## File map

| File | Audience focus | Status |
|---|---|---|
| `icp-ph-accountants.md` | PH accountants (primary B2B channel-partner target) | NEW — partially TODO; founder fills in PH-specific channel knowledge |
| `icp-us-bookkeepers.md` | US bookkeepers + solo CPA practices | Carried over; kept for US motion if pursued |
| `icp-us-extension-filers.md` | US sole props / Schedule C extension filers (DFY service buyers) | Carried over; secondary motion behind PH-first |
| `product-positioning.md` | What AVIntelligence IS and IS NOT; approved claims; disclaimers | Updated to handle PH + US clearly |
| `voice-and-tone.md` | Plain-English founder voice; approved/disapproved phrasings | Updated; founder TODOs unmissable |
| `strategy-context.md` | Current state snapshot for the strategy/planning role | NEW; founder updates weekly |

## How to load this into a Claude Project

1. Open claude.ai → Projects → New Project → name it **"AVIntelligence Sales and Marketing"**.
2. Upload every `.md` file in this folder as project knowledge.
3. Set the project instructions: "Read all uploaded knowledge before drafting or strategizing. Strategy questions reference `strategy-context.md` for current state. All outbound and reply drafts must match `voice-and-tone.md` and respect the IS/IS-NOT lines in `product-positioning.md`. Default ICP for outbound is `icp-ph-accountants.md` unless the conversation specifies otherwise. Never invent founder biographical details — surface the TODOs in `voice-and-tone.md` if asked."
4. Test by asking it to draft a first-touch LinkedIn DM to a PH-based accountant. Review the output against the voice rules before scaling to Cowork tasks.

## Updating context

- **ICP docs:** update when channel performance reveals new sub-segments or disqualifiers.
- **Positioning:** update only after a real product change (new report, new tier, new geography).
- **Voice & tone:** update when a drafted message lands unusually well or unusually badly — codify what worked or what tripped the founder's reject.
- **Strategy context:** **update weekly** (Monday morning is the canonical cadence). The strategy role's output quality is gated by how fresh this file is.

After any update, re-upload the changed file to the Claude Project so it picks up the new context.

## What's NOT in scope for this folder

- Smart Dashboard analytics (separate work; see `docs/smart-dashboard-*.md`)
- Smart Storage reports (separate; see `docs/smart-security-*.md` and report code paths)
- Smart Security (separate roadmap)
- Paperclip-2-news / AI After Dark content team (separate project, `paperclip-2-news/`)
- Engineering / infrastructure (separate)

This folder is purely sales + marketing context for the Project that runs them.
