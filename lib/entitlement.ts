// Pure entitlement logic — safe for client and server imports.
//
// Split from lib/subscription.ts because that module also constructs a
// SUPABASE_SERVICE_ROLE_KEY-bearing admin client; importing it from client
// components relied on Next's tree-shaking to strip the server globals. Any
// refactor that broke that assumption (e.g. adding a top-level side effect)
// would ship the service key into the client bundle. This module has no
// server-only dependencies, so that risk is structurally eliminated.

import { planTierForSubscription, type PlanTier } from "@/supabase/functions/_shared/plan-limits"

export interface EntitlementRow {
  status: string | null
  plan?: string | null
  current_period_end: string | null
}

export interface Entitlement {
  status: string
  isActive: boolean
  isPro: boolean
  isBusiness: boolean
  isDayPass: boolean
  isGiftCode: boolean
  expiresAt: string | null
  plan: string | null
  tier: PlanTier
}

const INACTIVE: Entitlement = {
  status: "none",
  isActive: false,
  isPro: false,
  isBusiness: false,
  isDayPass: false,
  isGiftCode: false,
  expiresAt: null,
  plan: null,
  tier: "free",
}

// Single source of truth for premium access. Day passes and redeemed gift
// codes expire on current_period_end; pro lifecycles are managed by webhooks
// so a matching status is sufficient.
export function computeEntitlement(row: EntitlementRow | null | undefined): Entitlement {
  if (!row || !row.status) return INACTIVE

  const { status, current_period_end, plan = null } = row
  const expired =
    !!current_period_end && new Date(current_period_end).getTime() < Date.now()

  if (status === "pro") {
    return {
      status: "pro",
      isActive: true,
      isPro: true,
      isBusiness: false,
      isDayPass: false,
      isGiftCode: false,
      expiresAt: current_period_end,
      plan,
      tier: "pro",
    }
  }

  if (status === "business") {
    return {
      status: "business",
      isActive: true,
      isPro: true,
      isBusiness: true,
      isDayPass: false,
      isGiftCode: false,
      expiresAt: current_period_end,
      plan,
      tier: "business",
    }
  }

  if (status === "day_pass") {
    if (!current_period_end || expired) {
      return { ...INACTIVE, status: "expired", expiresAt: current_period_end }
    }
    return {
      status: "day_pass",
      isActive: true,
      isPro: false,
      isBusiness: false,
      isDayPass: true,
      isGiftCode: false,
      expiresAt: current_period_end,
      plan,
      tier: "day_pass",
    }
  }

  if (status === "gift_code") {
    if (!current_period_end || expired) {
      return { ...INACTIVE, status: "expired", expiresAt: current_period_end }
    }
    return {
      status: "gift_code",
      isActive: true,
      isPro: false,
      isBusiness: false,
      isDayPass: false,
      isGiftCode: true,
      expiresAt: current_period_end,
      plan,
      tier: "day_pass",
    }
  }

  return {
    ...INACTIVE,
    status,
    expiresAt: current_period_end,
    plan,
    tier: planTierForSubscription(status, current_period_end),
  }
}

export function isUnlimitedEntitlement(entitlement: Pick<Entitlement, "expiresAt">): boolean {
  return !!entitlement.expiresAt && new Date(entitlement.expiresAt).getFullYear() >= 2099
}

export function pricingStatusForEntitlement(entitlement: Entitlement): string | null {
  if (!entitlement.isActive) return null
  if (entitlement.status === "business") return "business"
  return isUnlimitedEntitlement(entitlement) ? "pro" : entitlement.status
}
