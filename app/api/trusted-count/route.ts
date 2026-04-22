import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

import { serverError } from "@/lib/api-error"

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET() {
  const supabaseAdmin = getSupabaseAdmin()

  const [subscriptions, giftCodes] = await Promise.all([
    supabaseAdmin
      .from("subscriptions")
      .select("user_id,status")
      .in("status", ["pro", "day_pass"]),
    supabaseAdmin
      .from("gift_codes")
      .select("code,purchased_by_email,redeemed_by_user_id")
      .eq("status", "redeemed")
      .not("redeemed_by_user_id", "is", null),
  ])

  if (subscriptions.error) {
    return serverError(subscriptions.error, { route: "trusted-count", stage: "subscriptions" })
  }
  if (giftCodes.error) {
    return serverError(giftCodes.error, { route: "trusted-count", stage: "gift_codes" })
  }

  const countedUsers = new Set<string>()

  for (const row of subscriptions.data ?? []) {
    if (row.user_id) countedUsers.add(row.user_id)
  }

  for (const row of giftCodes.data ?? []) {
    const isUnlimitedFamilyCode = row.code?.toUpperCase().startsWith("AVINT-UNLIMITED-")
    const isPurchasedGiftCode = !!row.purchased_by_email
    if ((isUnlimitedFamilyCode || isPurchasedGiftCode) && row.redeemed_by_user_id) {
      countedUsers.add(row.redeemed_by_user_id)
    }
  }

  return NextResponse.json(
    { total_users: countedUsers.size },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } },
  )
}
