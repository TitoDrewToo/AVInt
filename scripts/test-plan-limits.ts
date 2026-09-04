import { PLAN_LIMITS, PLAN_PRICING, planTierForSubscription, usageWindowForTier } from "../supabase/functions/_shared/plan-limits"

function assert(name: string, condition: boolean) {
  if (!condition) throw new Error(`✗ ${name}`)
  console.log(`✓ ${name}`)
}

const now = new Date("2026-05-08T12:00:00.000Z")
const dayPassEnd = "2026-05-09T12:00:00.000Z"

assert("Free policy is a hard 10-document cap and five report exports", PLAN_LIMITS.free.documents === 10 && !PLAN_LIMITS.free.softCap && PLAN_LIMITS.free.reportExports === 5)
assert("Day Pass policy is a hard 50-document cap", PLAN_LIMITS.day_pass.documents === 50 && !PLAN_LIMITS.day_pass.softCap)
assert("Day Pass and Gift Code map to the 24-hour tier", planTierForSubscription("day_pass", dayPassEnd, now) === "day_pass" && planTierForSubscription("gift_code", dayPassEnd, now) === "day_pass")
assert("Pro policy is a soft 500-document fair-use cap with accounting exports", PLAN_LIMITS.pro.documents === 500 && PLAN_LIMITS.pro.softCap && PLAN_LIMITS.pro.accountingExports)
assert("Business maps to a soft 2,000-document tier with Pro capabilities", planTierForSubscription("business", null, now) === "business" && PLAN_LIMITS.business.documents === 2000 && PLAN_LIMITS.business.softCap && PLAN_LIMITS.business.accountingExports && PLAN_LIMITS.business.recurringExpenses)
assert("Business pricing is centralized", PLAN_PRICING.business.price === "$49" && PLAN_PRICING.business.annualPrice === "$490")
assert("Free and Pro use the UTC calendar month", usageWindowForTier("free", now).start === "2026-05-01T00:00:00.000Z" && usageWindowForTier("pro", now).end === "2026-06-01T00:00:00.000Z")
assert("Day Pass uses its 24-hour access window", usageWindowForTier("day_pass", now, dayPassEnd).start === "2026-05-08T12:00:00.000Z" && usageWindowForTier("day_pass", now, dayPassEnd).end === dayPassEnd)

console.log("8 passed, 0 failed")
