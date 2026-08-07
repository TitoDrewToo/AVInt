export type PlanTier = "free" | "day_pass" | "pro"

export const PLAN_LIMITS = {
  free: {
    documents: 10,
    documentWindow: "calendar_month",
    reportExports: 1,
    advancedAnalytics: false,
    accountingExports: false,
    customDashboards: false,
    recurringExpenses: false,
    priorityProcessing: false,
  },
  day_pass: {
    documents: 50,
    documentWindow: "rolling_24_hours",
    reportExports: null,
    advancedAnalytics: true,
    accountingExports: true,
    customDashboards: true,
    recurringExpenses: false,
    priorityProcessing: false,
  },
  pro: {
    documents: 500,
    documentWindow: "calendar_month",
    reportExports: null,
    advancedAnalytics: true,
    accountingExports: true,
    customDashboards: true,
    recurringExpenses: true,
    priorityProcessing: true,
  },
} as const

export function planTierForSubscription(
  status: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
  now = new Date(),
): PlanTier {
  if (status === "pro") return "pro"
  if (
    (status === "day_pass" || status === "gift_code") &&
    currentPeriodEnd &&
    new Date(currentPeriodEnd).getTime() >= now.getTime()
  ) {
    return "day_pass"
  }
  return "free"
}

export function usageWindowForTier(
  tier: PlanTier,
  now = new Date(),
  currentPeriodEnd?: string | null,
): { start: string; end: string } {
  if (tier === "day_pass" && currentPeriodEnd) {
    const end = new Date(currentPeriodEnd)
    if (!Number.isNaN(end.getTime()) && end.getTime() >= now.getTime()) {
      return {
        start: new Date(end.getTime() - 24 * 60 * 60 * 1000).toISOString(),
        end: end.toISOString(),
      }
    }
  }

  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return { start: start.toISOString(), end: end.toISOString() }
}
