"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { prefetchSmartStorageLaunchData } from "@/lib/smart-storage-cache"

const DATA_WARMUP_DELAY_MS = 900
const DASHBOARD_ROUTE_PREFETCH_DELAY_MS = 350

export function SmartStoragePrefetcher() {
  const router = useRouter()
  const pathname = usePathname()
  const prefetchedUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    let active = true
    const idleHandles: number[] = []
    const timeoutHandles: ReturnType<typeof setTimeout>[] = []
    const isSmartStorageRoute = pathname?.startsWith("/tools/smart-storage")
    const isSmartDashboardRoute = pathname?.startsWith("/tools/smart-dashboard")

    const scheduleSoon = (run: () => void, delay = 0) => {
      if (typeof window === "undefined") return
      timeoutHandles.push(setTimeout(run, delay))
    }

    const scheduleDataWarmup = (run: () => void) => {
      if (typeof window === "undefined") return
      timeoutHandles.push(setTimeout(() => {
        if (!active) return
        if ("requestIdleCallback" in window) {
          idleHandles.push(window.requestIdleCallback(run, { timeout: 3000 }))
          return
        }
        run()
      }, DATA_WARMUP_DELAY_MS))
    }

    scheduleSoon(() => {
      if (!active) return
      if (!isSmartStorageRoute) router.prefetch("/tools/smart-storage")
    })

    scheduleSoon(() => {
      if (!active) return
      if (!isSmartDashboardRoute) router.prefetch("/tools/smart-dashboard")
    }, DASHBOARD_ROUTE_PREFETCH_DELAY_MS)

    const prefetchForUser = (userId: string | undefined) => {
      if (!userId || prefetchedUserIdRef.current === userId) return
      prefetchedUserIdRef.current = userId
      if (isSmartStorageRoute) return
      scheduleDataWarmup(() => {
        if (!active) return
        void prefetchSmartStorageLaunchData(userId).catch((error) => {
          console.error("smart storage launch prefetch failed:", error)
        })
      })
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      prefetchForUser(data.session?.user.id)
    }).catch(() => {
      // Prefetch is optional and must not surface auth lock contention.
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      prefetchForUser(session?.user.id)
    })

    return () => {
      active = false
      if ("cancelIdleCallback" in window) {
        idleHandles.forEach((handle) => window.cancelIdleCallback(handle))
      }
      timeoutHandles.forEach(clearTimeout)
      subscription.unsubscribe()
    }
  }, [pathname, router])

  return null
}
