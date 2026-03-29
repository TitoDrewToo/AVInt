import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("status, plan, product_name, current_period_end")
    .eq("email", email)
    .single()

  if (error || !data) return null

  const isActive = ["pro", "day_pass"].includes(data.status)
  const isPro = data.status === "pro"
  const isDayPass = data.status === "day_pass"

  // Check day pass expiry
  if (isDayPass && data.current_period_end) {
    const expired = new Date(data.current_period_end) < new Date()
    if (expired) return {
      status: "expired",
      plan: data.plan,
      productName: data.product_name,
      currentPeriodEnd: data.current_period_end,
      isPro: false,
      isDayPass: false,
      isActive: false,
    }
  }

  return {
    status: data.status,
    plan: data.plan,
    productName: data.product_name,
    currentPeriodEnd: data.current_period_end,
    isPro,
    isDayPass,
    isActive,
  }
}
