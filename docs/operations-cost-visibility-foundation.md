# Operations cost visibility foundation

The operational view should answer four questions without exposing provider secrets or customer content:

1. What did AI and infrastructure cost during the selected period?
2. What are the average daily and monthly run rates?
3. How many active subscriptions currently offset those costs?
4. Which assumptions make the estimate incomplete?

## Backend now available

- `ai_usage_events` remains the source of recorded provider usage and estimated AI cost.
- `platform_cost_events` records non-AI infrastructure/vendor estimates (hosting, database, storage, bandwidth, security scans, email, and other).
- `platform_monthly_cost_summary` aggregates non-AI cost by month, category, and provider.
- `GET /api/systems/operations/costs` is internal-only and gated by `AVINT_OPERATIONS_USER_IDS`.

The endpoint returns monthly AI cost, other platform cost, total cost, event count, active subscriptions, and an introductory-plan revenue estimate. It explicitly states assumptions and excludes annual, firm, Creem, refunds, taxes, and payment fees until billing telemetry is mapped.

## Later UI pass

Place this under Systems / Operations, not the customer dashboard. Recommended cards:

- current month estimated cost;
- estimated subscription revenue;
- net operating position (estimate);
- average daily run rate;
- cost by provider/category;
- usage versus plan limits;
- missing-cost-data warnings.

Revenue should be labelled “estimated” until Creem webhook events and annual/firm entitlements are reconciled. Cost events are append-only and must never contain prompts, source content, signed URLs, API keys, or raw provider payloads.
