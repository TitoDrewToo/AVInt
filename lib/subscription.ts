import { createClient, type SupabaseClient } from "@supabase/supabase-js"

let _admin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return _admin
}

export interface EntitlementRow {
  status: string | null
  plan?: string | null
  current_period_end: string | null
}

export interface Entitlement {
  status: string
  isActive: boolean
  isPro: boolean
  isDayPass: boolean
  isGiftCode: boolean
  expiresAt: string | null
  plan: string | null
}

const INACTIVE: Entitlement = {
  status: "none",
  isActive: false,
  isPro: false,
  isDayPass: false,
  isGiftCode: false,
  expiresAt: null,
  plan: null,
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
      isDayPass: false,
      isGiftCode: false,
      expiresAt: current_period_end,
      plan,
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
      isDayPass: true,
      isGiftCode: false,
      expiresAt: current_period_end,
      plan,
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
      isDayPass: false,
      isGiftCode: true,
      expiresAt: current_period_end,
      plan,
    }
  }

  return { ...INACTIVE, status, expiresAt: current_period_end, plan }
}

export interface SubscriptionInfo {
  status: string
  plan: string | null
  productName: string | null
  currentPeriodEnd: string | null
  isPro: boolean
  isDayPass: boolean
  isActive: boolean
}

export async function getUserSubscription(email: string): Promise<SubscriptionInfo | null> {
  if (!email) return null

  const { data, error } = await getSupabaseAdmin()
    .from("subscriptions")
    .select("status, plan, product_name, current_period_end")
    .eq("email", email)
    .maybeSingle()

  if (error || !data) return null

  const ent = computeEntitlement(data)

  return {
    status: ent.status,
    plan: data.plan,
    productName: data.product_name,
    currentPeriodEnd: data.current_period_end,
    isPro: ent.isPro,
    isDayPass: ent.isDayPass,
    isActive: ent.isActive,
  }
}
