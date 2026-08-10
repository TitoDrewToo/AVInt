# Sales Ops Playbook — How the Engine Runs

This is the operating system for AVIntelligence's sales & marketing motion. The GM (Claude, acting ops manager) runs the loop; the founder approves the decisions that touch a real recipient. Everything here serves one goal: a steady, low-effort flow of partner conversations without anything going out that the founder hasn't seen.

The companion files this playbook depends on: `strategy-context.md` (current state, refreshed weekly), `product-positioning.md` and `voice-and-tone.md` (the guardrails every draft passes), `icp-us-bookkeepers.md` and `icp-us-extension-filers.md` (who and where), `AVInt_Target_Partners.xlsx` (the system of record), and `AVInt_Partner_Outreach_Kit.docx` (the templates).

## The pipeline

Every prospect moves through the same stages. The tracker's `Status` column always reflects exactly one of these.

| # | Stage | Owner | Gate |
|---|---|---|---|
| 1 | **Target** — identify a real firm/person and capture name, firm, site, email, channel | GM | — |
| 2 | **Draft** — write the first-touch (email + LinkedIn DM) in founder voice | GM | — |
| 3 | **Approve** — founder reads the draft, edits or green-lights | Founder | ✋ approval gate |
| 4 | **Send** — message goes out (founder sends, or GM sends in a live session right after approval) | Founder / GM | only after stage 3 |
| 5 | **Track** — log sent date; set follow-up timer | GM | — |
| 6 | **Triage reply** — when a response lands, classify it (interested / question / objection / no) | GM | — |
| 7 | **Draft response** — write the reply in founder voice | GM | — |
| 8 | **Approve response** — founder reads, edits or green-lights | Founder | ✋ approval gate |
| 9 | **Send response** | Founder / GM | only after stage 8 |
| 10 | **Update** — advance the stage, capture any field signal into `strategy-context.md` | GM | — |

No-reply path: follow-up 1 at 3–4 days, follow-up 2 at ~1 week, then mark dormant. Templates for both are in the outreach kit.

## The weekly loop

Cadence: **weekly, Monday morning** (matches the strategy-context refresh rhythm). A scheduled task does the preparation; the founder closes the loop in a live session.

What the Monday task does, unattended:

1. Reads `strategy-context.md` and flags it if it's more than 14 days old.
2. Sources a small batch of new US bookkeeper/accountant targets from free directories + web research (skip any already in the tracker), and folds in any names the founder dropped in during the week.
3. Drafts a first-touch (email + LinkedIn DM) for each new target, in founder voice, within length targets, with the required disclaimer.
4. Drafts follow-ups for prior sends that have passed their wait window.
5. Writes everything into a dated review queue: `review-queue/YYYY-MM-DD.md`, each item marked for a one-word decision (`approve` / `edit` / `skip`).
6. Updates the tracker: new rows added; statuses set to **"Draft ready — pending approval."** It never writes "Sent."
7. Notifies the founder that the queue is ready.

What the founder does (a few minutes, in a session):

- Open the review queue, skim, and reply `approve` / `edit: …` / `skip` per item.
- On approval, the GM sends (or the founder taps Send in their mail client) and the tracker advances to **Sent** with the date.

## Approval gates & sending policy (the safety rules)

- **Nothing auto-sends to an external recipient — ever.** Background/scheduled runs stop at a draft. Sending happens only after an explicit founder approval, in a live session.
- **LinkedIn is manual-DM only.** The GM drafts the DM; the founder sends it by hand.
- Internal artifacts (review queues, tracker updates, strategy-context edits, digests) save automatically — no approval needed.
- Every outbound draft passes the `voice-and-tone.md` banned-word list and the `product-positioning.md` IS / IS-NOT lines before it reaches the queue. US vocabulary only; required disclaimer on anything tax-aligned.

## Targeting (zero-cost sourcing)

Default method, no paid tools:

- **QuickBooks Find-a-ProAdvisor** and the **Xero advisor directory** — public, filterable by location; bookkeepers who already serve small business.
- **Bookkeeper / accountant associations** and local firm websites — emails on their own contact pages.
- **LinkedIn** — for identifying people and warming up; DMs sent manually by the founder.
- **Reddit / Facebook groups** per `icp-us-bookkeepers.md` — engage helpfully first, never spam.

Apollo.io and other paid prospecting databases stay **out of scope until volume justifies the cost** (Apollo's usable tier is $119+/user/mo; the free tier exports ~10 contacts/month). Revisit when we're sending enough that manual sourcing is the bottleneck.

## Drafting standards

All copy follows `voice-and-tone.md` and the approved phrasings/templates in `AVInt_Partner_Outreach_Kit.docx`. Length targets: cold email 60–110 words, LinkedIn DM first touch 30–60, follow-ups 25–50. No founder-bio claims until the `voice-and-tone.md` background section is filled in. Personalize only with a real, verifiable reference.

## Reply handling

When a reply lands, the GM classifies it and drafts the response using the objection snippets in the kit (replace-me / vs-Dext / does-it-file / already-use-QuickBooks / data-security). The data-security answer stays a founder fill-in until the product's real storage/encryption specifics are confirmed — the GM will not invent security claims. Founder approves before any response goes out.

## Where everything lives

- **System of record:** `AVInt_Target_Partners.xlsx` — every prospect, status, dates, owner, next step.
- **What to approve this week:** `review-queue/YYYY-MM-DD.md` — the GM's staged drafts.
- **The brain:** `strategy-context.md` — current state, refreshed weekly.
- **The guardrails:** `product-positioning.md`, `voice-and-tone.md`.
- **The templates:** `AVInt_Partner_Outreach_Kit.docx`.
- **The economics:** `AVInt_Partner_Economics_Model.xlsx`.

## Tooling & connectors

**Now (zero new cost):** the spreadsheet tracker, folder-based review queues, and this chat as the approval + send surface. Works today with no connector.

**Optional accelerators:**
- **Slack (free):** the GM posts the weekly batch and reply digests to a private channel so the founder can approve from their phone. Useful if the founder is mobile-first; not required.
- **Microsoft 365 (Outlook):** lets the GM read inbound replies directly for triage. Requires confirming the avintph.com mailbox is on Microsoft 365 Business (a consumer outlook.com account won't attach). Until then, the founder forwards reply threads into a session.

**Future (paid, when justified):** a CRM connector (Close / Attio / HubSpot) as the system of record once the spreadsheet is outgrown; Apollo.io for sourcing at scale.

## Email & deliverability setup (founder action)

- Send outreach **from a domain address** (`andrew@avintph.com` or `partnerships@avintph.com`), not the personal `outlook.com` — it's more credible and protects the personal address.
- Keep `support@avintph.com` for **inbound support**; route outreach replies to the outreach mailbox so threads don't tangle.
- Set **SPF, DKIM, and DMARC** on avintph.com or cold mail lands in spam.
- The weekly low-volume cadence naturally warms the domain — don't blast.
- Confirm the backend (Microsoft 365 Business / Google Workspace / forward-only) — it decides which inbox connector we can use and whether you can "send as" the domain.

## KPIs & weekly retro

North-star: **partner-attributed MRR.** Weekly leading indicators: targets added, first-touches sent, reply rate, conversations booked, follow-ups due. Each Monday the GM appends a one-paragraph retro to `strategy-context.md` (wins / misses / one change).

## Roles

- **GM (Claude):** targeting, drafting, tracking, triage, response drafting, queue prep, weekly retro, keeping the docs current.
- **Founder (Andrew):** approves every send and response, supplies field signal and any hand-picked targets, makes the calls flagged in "Current asks."
