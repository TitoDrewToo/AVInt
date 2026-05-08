"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { prefetchSmartStorageData } from "@/lib/smart-storage-cache"

export function SmartStoragePrefetcher() {
  const router = useRouter()
  const pathname = usePathname()
  const prefetchedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    let idleHandle: number | null = null
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null
    const isSmartStorageRoute = pathname?.startsWith("/tools/smart-storage")

    const scheduleWarmup = (run: () => void) => {
      if (typeof window === "undefined") return
      if ("requestIdleCallback" in window) {
        idleHandle = window.requestIdleCallback(run, { timeout: 3000 })
        return
      }
      timeoutHandle = setTimeout(run, 1200)
    }

    const prefetchForUser = (userId: string | undefined) => {
      if (!userId || prefetchedUserIdRef.current === userId) return
      prefetchedUserIdRef.current = userId
      router.prefetch("/tools/smart-storage")
      if (isSmartStorageRoute) return
      scheduleWarmup(() => {
        if (!active) return
        void prefetchSmartStorageData(userId).catch((error) => {
          console.error("smart storage prefetch failed:", error)
        })
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
      if (idleHandle !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleHandle)
      }
      if (timeoutHandle) clearTimeout(timeoutHandle)
      subscription.unsubscribe()
    }
  }, [pathname, router])

  return null
}
