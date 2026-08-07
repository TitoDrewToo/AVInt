export type PlanTier = "free" | "day_pass" | "pro" | "business"

export const PLAN_LIMITS = {
  free: {
    documents: 10,
    documentWindow: "calendar_month",
    softCap: false,
    nearLimitRatio: 0.8,
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
    softCap: false,
    nearLimitRatio: 0.8,
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
    softCap: true,
    nearLimitRatio: 0.8,
    reportExports: null,
    advancedAnalytics: true,
    accountingExports: true,
    customDashboards: true,
    recurringExpenses: true,
    priorityProcessing: true,
  },
  business: {
    documents: 2000,
    documentWindow: "calendar_month",
    softCap: true,
    nearLimitRatio: 0.8,
    reportExports: null,
    advancedAnalytics: true,
    accountingExports: true,
    customDashboards: true,
    recurringExpenses: true,
    priorityProcessing: true,
  },
} as const

export const PLAN_PRICING = {
  free: { price: "$0", annualPrice: null, featureLines: ["10 documents / month", "Smart Storage + document classification", "Basic dashboard", "1 report export / month"] },
  day_pass: { price: "$6", annualPrice: null, featureLines: ["50 documents (24-hour access)", "All reports + structured outputs", "Advanced Analytics + Smart & Custom Dashboards", "Export to QuickBooks & Xero"] },
  gift_code: { price: "$6", annualPrice: null, featureLines: ["50 documents (24-hour access)", "All reports + structured outputs", "Advanced Analytics + Smart & Custom Dashboards", "Export to QuickBooks & Xero"] },
  pro: { price: "$12", annualPrice: "$100", featureLines: ["500 documents / month", "All reports + structured outputs", "Advanced Analytics + Smart & Custom Dashboards", "Recurring-expense detection", "Export to QuickBooks & Xero", "Priority processing"] },
  business: { price: "$49", annualPrice: "$490", featureLines: ["2,000 documents / month", "Everything in Pro", "Team access + QuickBooks/Xero sync (coming soon)"] },
} as const

export function planTierForSubscription(
  status: string | null | undefined,
  currentPeriodEnd: string | null | undefined,
  now = new Date(),
): PlanTier {
  if (status === "pro") return "pro"
  if (status === "business") return "business"
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
