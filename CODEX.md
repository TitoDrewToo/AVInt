# AVIntelligence Codex Guide

## Role

Codex is the primary co-developer and implementation partner for AVIntelligence.

Codex should operate as a pragmatic senior engineer who:
- understands the current repository before changing it
- preserves product intent, not just code correctness
- closes issues end to end when scope is clear
- verifies work where feasible
- documents risks and remaining uncertainty honestly

Codex is not just a code generator. Codex is expected to understand what AVIntelligence is, what has already been built, and what the product is actively being shaped into.

## Product Definition

AVIntelligence is not generic file storage.

AVIntelligence is a document-intelligence platform that:
- stores real-world financial and operational documents
- extracts structured data from those documents
- turns that structured data into useful reports, summaries, dashboards, and guided workflows

Core product surfaces:
- Smart Storage
  - secure cloud storage for receipts, invoices, payslips, contracts, and related records
  - AI-structured document fields
  - reports generation
- Smart Dashboard
  - interactive dashboards and visuals built from real extracted activity data
  - current standing, trends, advanced analytics, and operator visibility
- Reports
  - Tax Bundle
  - Business Expense
  - Expense Summary
  - Income Summary
  - Profit & Loss
  - Contract Summary
  - Key Terms
- Access / Monetization
  - free, day pass, monthly, annual, gift-code based access

Primary market:
- United States first

Tax positioning:
- Tax Bundle is currently the highest-priority report because it delivers strong near-term user value
- it is Schedule C oriented today
- employed / non-self-employed tax workflows are expected future expansion, not current parity

## What Has Been Built

The current repository already includes meaningful product infrastructure.

Built and actively in use:
- Next.js application with Smart Storage, Smart Dashboard, product pages, pricing, purchase flow
- Supabase-backed auth, storage, folders, document metadata, and report data
- document normalization pipeline and edge functions
- financial reports with real aggregation logic
- entitlement logic for paid access
- gift code redemption flow
- Smart Dashboard premium backend enforcement
- Smart Storage report data access moved behind authenticated server routes

Recent report/security work already completed:
- Tax Bundle math upgraded so Schedule-C-style net does not mix wages with business income
- Smart Storage reports moved from client-only gating to authenticated server-side enforcement
- gift redemption changed to expire on a 24-hour clock after activation
- dashboard premium backend functions enforce entitlement
- Income Summary upgraded to partition income sources
- Profit & Loss upgraded to be scope-aware instead of silently implying all income is business revenue
- Business Expense report upgraded with a user-configurable assumptions layer

## What We Are Building Toward

The product direction is:
- secure cloud storage
- AI-structured data
- reports ready
- dashboards that feel intentional, premium, and operationally useful

Design direction:
- AVInt should feel sharp, technical, and high-trust
- avoid generic SaaS visuals
- favor guided technical graphics, structural motion, intelligent transitions, and red-accent identity

Current UI/UX direction:
- continue refining the glow / hover / schematic language already introduced
- increase animation quality and intentionality
- adopt some of Code Wiki’s interaction quality and technical visual language
- especially:
  - animated input halo behavior
  - technical system graphics
  - structured motion that clarifies state changes

Do not copy branding blindly.
Do borrow high-quality motion, graphic structure, and interaction language when it fits AVInt.

## Current Workflow Reality

Paperclip is not the active workflow anymore.

Current working model:
- user + Codex + Claude are the main build loop
- Gemini is used for targeted research, second-pass evaluation, or ad hoc supporting tasks
- Codex should assume this repo needs to remain understandable and maintainable across sessions

That means:
- do not rely on session memory alone
- prefer writing durable context into repo docs when it matters
- surface assumptions explicitly

## Codex Operating Rules

Default behavior:
1. inspect the relevant code first
2. confirm what is actually implemented
3. identify the real gap
4. implement the smallest correct fix that satisfies product intent
5. verify with tests/typecheck/manual logic checks where feasible
6. report clearly what changed, what was verified, and what remains uncertain

When changes are material, be especially careful around:
- auth
- entitlement/subscription logic
- uploads
- storage
- payment flows
- tax/report math
- edge function auth
- schema changes
- public-repo security posture

Do not treat UI gating as security.
Prefer server-side enforcement for anything premium or sensitive.

## Product-Specific Expectations

### Smart Storage

Smart Storage should behave like secure cloud storage plus structured-data generation.

It should:
- accept real document uploads cleanly
- preserve folder/date targeting behavior for reports
- produce useful report outputs from extracted fields

### Smart Dashboard

Smart Dashboard is not the same as Smart Storage.

It should:
- represent current standing and analytics state
- support premium advanced functionality
- preserve strong backend enforcement for paid capabilities

### Reports

Reports must not overstate accuracy.

Rules:
- if a number is heuristic, label it as heuristic
- if a report is scope-sensitive, make scope explicit
- if mixed currencies make totals unreliable, do not silently aggregate
- if tax math is limited, state the limitation directly

Tax Bundle is the highest scrutiny surface.
Non-tax reports should still be semantically honest and operationally useful.

## Security Expectations

The repo is intended to become public-facing eventually, so secret hygiene matters.

Codex should watch for:
- exposed keys
- insecure auth assumptions
- premium bypass opportunities
- upload abuse paths
- server routes that trust client state too much
- legacy comments or code that misrepresent the active provider or flow

Do not assume “hidden in UI” means safe.

## Supabase Edge Function Deploy Policy

All Supabase edge functions in this project are deployed with:

```bash
supabase functions deploy <function-name> --no-verify-jwt
```

Reason:
- this project uses the newer asymmetric JWT / service-role setup
- default edge gateway JWT verification does not match the project’s actual auth model
- auth is enforced inside each function body instead

Therefore:
- every edge function must validate Authorization itself
- user-facing functions should verify the token and user identity explicitly
- service-role-only functions must reject non-service-role callers

If a future deploy omits `--no-verify-jwt`, gateway-level 401 failures can occur before the function executes.

## Git / Change Discipline

Codex should:
- avoid unrelated files in commits
- stage only intentional changes
- ignore generated/local noise unless the user explicitly wants cleanup
- never revert unrelated user work

Commit and push only when explicitly instructed.

## Preferred Documentation Behavior

When major context emerges that future sessions will need, Codex should prefer updating durable docs like this one instead of leaving the context only in chat.

Good candidates for documentation:
- product intent
- workflow rules
- architecture constraints
- active priorities
- non-obvious deployment rules

## Current Known Priorities

Priority order can change, but current recurring themes are:
- tax/report correctness
- security and premium enforcement
- upload pipeline hardening
- Smart Dashboard behavior quality
- polished UI/UX and motion quality
- public-repo readiness

## If Starting Fresh In A New Session

Before making major changes:
- read this file
- read `CLAUDE.md`
- inspect current git status
- inspect the latest commits
- validate assumptions against the actual codebase

Do not assume previous chat context still exists.
