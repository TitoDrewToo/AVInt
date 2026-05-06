"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { prefetchSmartStorageData } from "@/lib/smart-storage-cache"

export function SmartStoragePrefetcher() {
  const router = useRouter()
  const prefetchedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    const prefetchForUser = (userId: string | undefined) => {
      if (!userId || prefetchedUserIdRef.current === userId) return
      prefetchedUserIdRef.current = userId
      router.prefetch("/tools/smart-storage")
      void prefetchSmartStorageData(userId).catch((error) => {
        console.error("smart storage prefetch failed:", error)
      })
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      prefetchForUser(data.session?.user.id)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      prefetchForUser(session?.user.id)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [router])

  return null
}
