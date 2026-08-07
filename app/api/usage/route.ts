import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

import { computeEntitlement } from "@/lib/entitlement"
import { PLAN_LIMITS, usageWindowForTier } from "@/supabase/functions/_shared/plan-limits"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from("subscriptions")
    .select("status, plan, current_period_end")
    .eq("user_id", user.id)
    .maybeSingle()
  if (subscriptionError) return NextResponse.json({ error: subscriptionError.message }, { status: 500 })

  const entitlement = computeEntitlement(subscription)
  const limits = PLAN_LIMITS[entitlement.tier]
  const window = usageWindowForTier(entitlement.tier, new Date(), entitlement.expiresAt)
  const { count, error: usageError } = await supabaseAdmin
    .from("document_processing_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("period_start", window.start)
  if (usageError) return NextResponse.json({ error: usageError.message }, { status: 500 })

  const usedCount = count ?? 0
  const nearLimit = usedCount >= limits.documents * limits.nearLimitRatio
  return NextResponse.json({
    tier: entitlement.tier,
    usedCount,
    limit: limits.documents,
    softCap: limits.softCap,
    nearLimit,
    atLimit: usedCount >= limits.documents,
    message: nearLimit
      ? limits.softCap
        ? `You've processed ${usedCount} documents this period. You're nearing the ${limits.documents}-document fair-use level; processing will continue, but contact us if you need more.`
        : `You've used ${usedCount} of ${limits.documents} documents this period. Upgrade to continue processing after the cap.`
      : null,
  })
}
