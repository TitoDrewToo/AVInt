import { PLAN_LIMITS, planTierForSubscription, usageWindowForTier } from "../supabase/functions/_shared/plan-limits"

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`✗ ${name}`)
  console.log(`✓ ${name}`)
}

const now = new Date("2026-05-08T12:00:00.000Z")
const dayPassEnd = "2026-05-09T12:00:00.000Z"

assert("Free policy is 10 documents and one report export", PLAN_LIMITS.free.documents === 10 && PLAN_LIMITS.free.reportExports === 1)
assert("Day Pass and Gift Code map to the 24-hour tier", planTierForSubscription("day_pass", dayPassEnd, now) === "day_pass" && planTierForSubscription("gift_code", dayPassEnd, now) === "day_pass")
assert("Pro policy is 500 documents with accounting exports", PLAN_LIMITS.pro.documents === 500 && PLAN_LIMITS.pro.accountingExports)
assert("Free and Pro use the UTC calendar month", usageWindowForTier("free", now).start === "2026-05-01T00:00:00.000Z" && usageWindowForTier("pro", now).end === "2026-06-01T00:00:00.000Z")
assert("Day Pass uses its 24-hour access window", usageWindowForTier("day_pass", now, dayPassEnd).start === "2026-05-08T12:00:00.000Z" && usageWindowForTier("day_pass", now, dayPassEnd).end === dayPassEnd)

console.log("5 passed, 0 failed")
