# AVIntelligence Gumloop Growth Team

This folder contains copy-paste agent instructions and uploadable skill files for a manual-run Gumloop sales and marketing workflow.

## Agent Setup

Create three Gumloop agents:

1. `AVIntelligence Growth Strategist`
2. `AVIntelligence Copywriter`
3. `AVIntelligence Growth Executor`

For each agent:

- Paste the matching `instructions.md` into the Gumloop agent instructions field.
- Upload the matching role skill files.
- Upload both shared skill files:
  - `shared/avintelligence-product-positioning.md`
  - `shared/outreach-compliance-rules.md`
- Turn `Allow Self-Updates` off at first.
- Keep outbound sending disabled unless a human has approved the draft.

## Model Recommendations

Strategist:

- Model: Claude Opus for deep strategy, Claude Sonnet for cheaper iteration.
- Max steps: 20-40.
- Thinking: enabled for strategy runs.
- Thinking budget: 8,000-12,000.
- Disable parallel tool use: true.
- Max tokens: 4,000-8,000.

Copywriter:

- Model: Claude Sonnet.
- Max steps: 20-30.
- Thinking: disabled.
- Temperature: 0.6-0.8.
- Max tokens: 3,000-5,000.
- Disable parallel tool use: false.

Executor:

- Model: GPT.
- Max steps: 50-100.
- Thinking: disabled.
- Temperature: 0.2-0.4.
- Max tokens: 3,000-6,000.
- Disable parallel tool use: false.

## Manual Workflow

Recommended flow name: `AVIntelligence Growth Pilot`

Manual inputs:

- Target segment
- Geography
- Lead count
- Campaign goal
- Channel
- Offer
- Send mode: `draft_only` or `approval_required`

Workflow:

1. Strategist creates a campaign brief.
2. Executor researches and scores leads.
3. Copywriter creates outreach variants.
4. Executor assembles an approval packet.
5. Human reviews, edits, and sends manually.
6. Executor logs results from human-provided outcomes.

