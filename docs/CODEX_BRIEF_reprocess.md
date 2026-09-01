# Codex brief — reprocess a healthy document

Two things at once: a capability users need, and the test that closes the
corrections work.

Scope: `app/tools/smart-storage/page.tsx` (the retry handler and its control),
`components/smart-storage/storage-item-menu.tsx`, and whatever API route is
needed to reach the existing reprocess path. **No migrations** — Claude has
already applied `20260901143637_maintain_updated_at_triggers`.

## The gap

`handleRetryProcessing` is gated:

```ts
if (file.attention_state === "normalization_failed") {
```

So reprocessing is only reachable for a file that **failed**. A user who
corrects a document, or who knows the extraction was poor, has no way to ask
for it to be re-read. There is a `reprocess-documents` edge function; nothing
in the UI reaches it for a healthy file.

## What to build

A **Reprocess** action available on any file in a terminal state (`done`,
`normalized`), alongside the existing failure-only Retry rather than replacing
it.

It must run the full path: extraction → `deriveRecords` → `persistDerived` →
`applyOverrides`. **Do not shortcut it.** Re-derivation followed by the
overlay is the entire point; a reprocess that skips `applyOverrides` would
silently discard the user's corrections, which is the worst possible outcome
for this feature.

Requirements:

- **Confirm before running.** Tell the user the document will be re-read and
  values may change, and that their corrections are preserved. Both halves
  matter — the second is what makes it safe to press.
- **Refuse when it cannot work**: no storage object, no extraction row. Say
  which, rather than failing generically.
- **No concurrent reprocess of the same file.** Guard on the file's processing
  state; a second run while the first is in flight will race
  `persistDerived`'s child pruning.
- **Keep reprocess attempts non-billable.** `components/systems/economics-overview.tsx`
  states this is the policy — do not change it, and make sure a user-triggered
  reprocess is recorded the same way as the existing path.
- Reuse the in-flight treatment from the ingestion work; no new animation
  vocabulary.

## Verification — and this is the part that matters

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, Deno type-check, deploy
edge functions with `--no-verify-jwt`.

You cannot run the live flow. Andrew will reprocess one specific document and
Claude will check the database:

> `test_receipt_coffee.png`, record `b3e87be7-7e5a-4b70-a7af-cd9955ee1819`.
> Its extraction says `total_amount: 8.99`. Three user revisions exist: the
> counterparty cleared, the amount corrected to 11, and a numeric `adjustment`
> attribute added.

Two things must both be true afterwards:

1. **`records.amount` is still 11**, not 8.99 — the correction survived
   re-derivation.
2. **Every derived attribute carries a fresh `updated_at`** — `vendor_name`,
   `merchant_domain`, `classification_rationale`, `jurisdiction`,
   `merchant_address_country`, `_raw_json`. This proves `persistDerived`
   actually ran.

The second check exists because the first alone proves nothing. The amount is
already 11 from the correction route applying it directly. Without evidence
that re-derivation ran, an unchanged 11 is indistinguishable from nothing
having happened at all — which is exactly the mistake that was made when this
was previously assumed to be tested.

State plainly that you did not run it. Do not push until Andrew has seen your
report.
