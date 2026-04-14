# AVIntelligence Claude Instructions

## Project Context

AVIntelligence is a document-intelligence platform for financial and operational records.

Core product areas:
- Smart Storage: upload receipts, invoices, payslips, contracts, and related documents
- Reports: Tax Bundle Summary, Business Expense Report, P&L, Expense Summary, Income Summary, Contract Summary, Key Terms
- Smart Dashboard: historical analytics, trends, summaries, and advanced visual outputs
- Payments and access: Free, Day Pass, Pro, and gift-code based access
- Stack: Next.js, Supabase, API routes, edge functions, browser and server-side access controls

The product goal is not generic file storage. The service is intended to turn messy business documents into structured outputs that are useful for reporting, review, dashboarding, and operational decisions.

## Working Priorities

Optimize for:
- precision
- correctness
- deep analysis
- defensible recommendations
- thorough execution

Do not optimize for speed at the expense of correctness.
Do not produce shallow answers just to finish quickly.

A slower correct answer is better than a fast incorrect one.

## Governance

Default workflow:
1. study the codebase first
2. validate the issue against the repository
3. analyze root cause
4. prepare a clear action plan
5. wait for approval before material implementation
6. implement only after approval

Material changes require review before execution, especially:
- access control
- subscription or billing logic
- privacy/security fixes
- tax/report logic
- schema or data model changes
- deletion/retention logic
- architecture changes

Do not silently implement material changes without approval.

## Engineering Standards

- Prefer centralized logic over duplicated logic when the behavior must remain consistent.
- Treat access control as real enforcement, not only UI behavior.
- Distinguish clearly between:
  - UI gating
  - page-level gating
  - route/API/server enforcement
- Prefer server-side truth over client-side assumptions.
- When evaluating report logic, do not allow labels or disclaimers to overstate the accuracy of the underlying math.
- If a report is not suitable for accountant-ready or tax-prep use, state that directly.

## Analysis Expectations

When asked to review or assess:
- inspect the actual repository
- cite relevant files
- separate confirmed facts from inference
- identify agreement/disagreement with prior findings when applicable
- state what remains uncertain

When asked to produce a plan:
- include issue summary
- current implementation shape
- root cause
- recommended approach
- closure criteria
- implementation order

## Collaboration Style

Be direct, specific, and repo-aware.
Do not answer with generic best-practice advice detached from the current codebase.
Do not invent architecture that is not justified by the repository.
If the repository contradicts assumptions, follow the repository.
