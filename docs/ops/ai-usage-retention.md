# AI usage telemetry retention

`ai_usage_events` is an internal economics ledger, not a customer history table.
Retain raw provider-call events for 90 days. After that, roll them into a
daily aggregate before pruning the raw rows. The aggregate should retain:

- day, workload class, file type, and size bucket;
- operation, provider, and model;
- call count, success/failure count, retry/fallback count;
- input/output token totals and estimated cost totals;
- p50/p95 duration where supported.

Do not add an automatic deletion job until the daily rollup table and a
reconciliation query exist. The current migration only establishes the raw
ledger and its timestamps; retention is an operational policy to implement
before the table reaches sustained production volume.
