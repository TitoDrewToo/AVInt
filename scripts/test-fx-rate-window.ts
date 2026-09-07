import assert from "node:assert/strict"

import { fetchRatesFromDb, MAX_RATE_AGE_DAYS, rateKey } from "@/lib/fx"

/**
 * Contract for the staleness bound added 7 Sep 2026.
 *
 * Before it, fetchRatesFromDb selected the newest rate on or before the
 * transaction date with no lower bound, so a 2026 transaction resolved to a
 * June 2025 rate — fourteen months stale — and rendered it as fact. Worse, the
 * lookup therefore always succeeded, so ensureRatesExist computed
 * `missing = []` and never invoked fx-backfill: the stale-rate fallback
 * suppressed the very signal that would have refilled the table.
 *
 * The bound is what makes a missing rate visible. These assertions guard both
 * halves: that an out-of-window rate is reported missing, and that the query
 * itself carries the lower bound so a large table cannot return one.
 */

type Call = { column: string; value: string }

function stubSupabase(row: { rate: number; rate_date: string } | null) {
  const calls: Call[] = []
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    lte: (column: string, value: string) => { calls.push({ column: `lte:${column}`, value }); return builder },
    gte: (column: string, value: string) => { calls.push({ column: `gte:${column}`, value }); return builder },
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => ({ data: row, error: null }),
  }
  return { client: { from: () => builder }, calls }
}

async function main() {
  assert.equal(MAX_RATE_AGE_DAYS, 7,
    "the staleness bound is report math — changing it needs Andrew's approval and a drift check")

  const tuple = { date: "2026-06-30", from: "USD", to: "PHP" }
  const key = rateKey(tuple.date, tuple.from, tuple.to)

  // In window: 6 days old, accepted, and the real rate_date is surfaced so the
  // UI can disclose what it converted with.
  const fresh = stubSupabase({ rate: 56.1, rate_date: "2026-06-24" })
  const freshResult = await fetchRatesFromDb(fresh.client, [tuple])
  assert.equal(freshResult[key]?.rate, 56.1, "a 6-day-old rate must be accepted")
  assert.equal(freshResult[key]?.actual_rate_date, "2026-06-24",
    "actual_rate_date must be returned so the converted figure can disclose it")

  // Out of window: one day past the bound, rejected even though the database
  // handed it back. The defensive check must not rely on the query alone.
  const stale = stubSupabase({ rate: 56.451, rate_date: "2026-06-22" })
  const staleResult = await fetchRatesFromDb(stale.client, [tuple])
  assert.deepEqual(staleResult, {},
    "an 8-day-old rate is out of window and must be reported missing, not converted")

  // The original defect: a rate over a year old. This is the exact shape that
  // was silently converting 2026 transactions at a June 2025 rate.
  const ancient = stubSupabase({ rate: 56.451, rate_date: "2025-06-30" })
  assert.deepEqual(await fetchRatesFromDb(ancient.client, [tuple]), {},
    "a 2025 rate must never satisfy a 2026 transaction")

  // A rate dated after the transaction is not a rate for it.
  const future = stubSupabase({ rate: 56.1, rate_date: "2026-07-05" })
  assert.deepEqual(await fetchRatesFromDb(future.client, [tuple]), {},
    "a rate dated after the transaction must be rejected")

  // The query itself must carry the lower bound, so the database cannot return
  // an out-of-window row in the first place.
  const lower = fresh.calls.find((call) => call.column === "gte:rate_date")
  assert.ok(lower, "fetchRatesFromDb must apply a gte(rate_date) lower bound in the query")
  assert.equal(lower.value, "2026-06-23",
    `lower bound must be exactly MAX_RATE_AGE_DAYS (${MAX_RATE_AGE_DAYS}) before the transaction date`)
  assert.ok(fresh.calls.some((call) => call.column === "lte:rate_date" && call.value === tuple.date),
    "the upper bound on rate_date must remain")

  console.log(`fx rate window contract: 8 assertions passed (MAX_RATE_AGE_DAYS = ${MAX_RATE_AGE_DAYS})`)
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1 })
