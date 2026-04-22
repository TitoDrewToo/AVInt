# AVIntelligence Review Scope

This document defines project-specific review boundaries for Codex, Claude,
Gemini, Copilot, and any other AI reviewer used on AVIntelligence.

## Review Rule

Do not re-raise known deferred roadmap items as active findings.

Only mention a deferred item if the current code introduces a new
vulnerability, breaks the accepted posture, makes the deferred risk materially
worse, or the user explicitly asks to review that deferred area.

## Known Deferred Items

The following are accepted deferred workstreams and should not be repeated as
new review findings:

- paid security upgrade:
  - WAF
  - DDoS layer beyond platform defaults
  - managed malware scanning
  - managed monitoring or SIEM
  - external pentest or SOC 2-style vendor work
- CSP enforcement:
  - current posture is report-only by design
  - enforcement is a future hardening step after observation
- CodeWiki/internal AI assistant grounding
- full UI/UX refresh
- fixed Creem hosted checkout links versus server-created checkout migration
- full automated test suite or broad E2E coverage, unless explicitly requested
- deep file malware scanning beyond the current free prescan checks
- paid security subscriptions or outsourced scanning services
- admin/support dashboarding

## Current Accepted Payment Posture

The active customer purchase path is:

1. pricing page
2. fixed Creem hosted checkout link
3. Creem webhook
4. subscription or gift-code record update
5. `/purchase/process`
6. `/purchase/success`

`/api/creem/checkout` and `/api/creem/cancel` are hardened support routes, but
they are not the active customer-facing purchase path today. Do not recommend
switching to server-created checkouts as a security finding unless there is a
specific exploit or product requirement.

## Review Priority

Prioritize new, actionable risks in:

- auth and authorization
- RLS and service-role query scoping
- upload and storage access
- payment webhook correctness
- gift-code abuse
- route-level rate limiting
- sensitive logs and error exposure
- dependency advisories
- prompt/AI trust boundaries that affect user data or cost

## Reporting Standard

For every finding, include:

- severity
- evidence from the current repo
- exploit or failure path
- whether it affects production today
- recommended fix

If a concern maps to a known deferred item, mark it as deferred and do not
include it in the active fix queue.
