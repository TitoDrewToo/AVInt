"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"

export const MARKETING_SCROLL_RESET_PATHS = new Set([
  "/",
  "/products/smart-storage",
  "/products/smart-dashboard",
])

export function scrollMarketingPageToTop() {
  if (typeof window === "undefined") return

  const scrollToTop = () => window.scrollTo({ top: 0, left: 0, behavior: "auto" })

  scrollToTop()
  window.requestAnimationFrame(scrollToTop)
  window.setTimeout(scrollToTop, 0)
}

export function MarketingScrollReset() {
  const pathname = usePathname()

  useEffect(() => {
    if (typeof window === "undefined") return

    const shouldReset = MARKETING_SCROLL_RESET_PATHS.has(pathname)
    if (!shouldReset) return

    const previous = window.history.scrollRestoration
    window.history.scrollRestoration = "manual"

    // Run immediately on mount/navigation and again on the next frame to beat
    // browser restoration when the page was refreshed mid-scroll.
    scrollMarketingPageToTop()

    return () => {
      window.history.scrollRestoration = previous
    }
  }, [pathname])

  return null
}
