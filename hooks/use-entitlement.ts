"use client"

import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { computeEntitlement, computeFirmClientEntitlement, type Entitlement } from "@/lib/entitlement"

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

export interface UseEntitlementResult extends Entitlement {
  loading: boolean
}

// Client hook that resolves the current user's premium entitlement via the
// shared computeEntitlement helper. All premium gates should source their
// access decision from this hook so day-pass expiry is enforced consistently.
export function useEntitlement(session: Session | null | undefined): UseEntitlementResult {
  const [entitlement, setEntitlement] = useState<Entitlement>(INACTIVE)
  const [loading, setLoading] = useState<boolean>(true)

  const userId = session?.user?.id ?? null

  useEffect(() => {
    let cancelled = false

    if (!userId) {
      setEntitlement(INACTIVE)
      setLoading(false)
      return
    }

    setLoading(true)
    supabase
      .from("subscriptions")
      .select("status, plan, current_period_end")
      .eq("user_id", userId)
      .maybeSingle()
      .then(async ({ data }) => {
        if (cancelled) return
        const subscriptionEntitlement = computeEntitlement(data)
        if (subscriptionEntitlement.isActive) {
          setEntitlement(subscriptionEntitlement)
          setLoading(false)
          return
        }
        const { data: firmClients } = await supabase
          .from("firm_clients")
          .select("created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
        if (cancelled) return
        setEntitlement(computeFirmClientEntitlement(firmClients?.[0]?.created_at))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  return { ...entitlement, loading }
}
