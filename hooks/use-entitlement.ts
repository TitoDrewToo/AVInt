"use client"

import { useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import { supabase } from "@/lib/supabase"
import { computeEntitlement, type Entitlement } from "@/lib/subscription"

const INACTIVE: Entitlement = {
  status: "none",
  isActive: false,
  isPro: false,
  isDayPass: false,
  isGiftCode: false,
  expiresAt: null,
  plan: null,
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
      .then(({ data }) => {
        if (cancelled) return
        setEntitlement(computeEntitlement(data))
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  return { ...entitlement, loading }
}
