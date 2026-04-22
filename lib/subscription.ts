// Server-only module. Constructs an admin Supabase client bearing
// SUPABASE_SERVICE_ROLE_KEY, so it must never be imported from client
// components. Pure entitlement logic lives in lib/entitlement.ts and
// is safe for either surface — import that one from client code.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { computeEntitlement } from "@/lib/entitlement"

let _admin: SupabaseClient | null = null
function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return _admin
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
