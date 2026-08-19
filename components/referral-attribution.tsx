"use client"

import { useEffect } from "react"

import { captureRefFromUrl, handleAuthSessionReferral } from "@/lib/referral"
import { supabase } from "@/lib/supabase"

export function ReferralAttribution() {
  useEffect(() => {
    captureRefFromUrl()
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      void handleAuthSessionReferral(event, session).catch(() => {
        // Referral attribution is best effort and must not affect auth UX.
      })
    })

    return () => subscription.unsubscribe()
  }, [])

  return null
}
