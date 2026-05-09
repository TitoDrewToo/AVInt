"use client"

import { useEffect, useRef } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { prefetchSmartStorageLaunchData } from "@/lib/smart-storage-cache"

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

    const scheduleSoon = (run: () => void, delay = 450) => {
      if (typeof window === "undefined") return
      timeoutHandles.push(setTimeout(run, delay))
    }

    const scheduleWarmup = (run: () => void, fallbackDelay = 1200) => {
      if (typeof window === "undefined") return
      if ("requestIdleCallback" in window) {
        idleHandles.push(window.requestIdleCallback(run, { timeout: 3000 }))
        return
      }
      timeoutHandles.push(setTimeout(run, fallbackDelay))
    }

    scheduleSoon(() => {
      if (!active) return
      if (!isSmartStorageRoute) router.prefetch("/tools/smart-storage")
      if (!isSmartDashboardRoute) router.prefetch("/tools/smart-dashboard")
    }, 400)

    const prefetchForUser = (userId: string | undefined) => {
      if (!userId || prefetchedUserIdRef.current === userId) return
      prefetchedUserIdRef.current = userId
      if (isSmartStorageRoute) return
      scheduleWarmup(() => {
        if (!active) return
        void prefetchSmartStorageLaunchData(userId).catch((error) => {
          console.error("smart storage launch prefetch failed:", error)
        })
      }, 2400)
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
      if ("cancelIdleCallback" in window) {
        idleHandles.forEach((handle) => window.cancelIdleCallback(handle))
      }
      timeoutHandles.forEach(clearTimeout)
      subscription.unsubscribe()
    }
  }, [pathname, router])

  return null
}
