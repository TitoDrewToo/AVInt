"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

const RESET_PATHS = new Set([
  "/",
  "/products/smart-storage",
  "/products/smart-dashboard",
])

export function MarketingScrollReset() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === "undefined") return

    const shouldReset = RESET_PATHS.has(pathname)
    if (!shouldReset) return

    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = "manual"

    const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" })

    // Run immediately on mount/navigation and again on the next frame to beat
    // browser restoration when the page was refreshed mid-scroll.
    scrollToTop()
    const rafId = window.requestAnimationFrame(scrollToTop)

    return () => {
      window.cancelAnimationFrame(rafId)
      window.history.scrollRestoration = previous
    }
  }, [pathname])

  return null
}
