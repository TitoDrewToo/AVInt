"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowUpRight, CalendarDays } from "lucide-react"

const bookingUrl = process.env.NEXT_PUBLIC_CALCOM_BOOKING_URL?.trim() ?? ""

function withPrefill(name?: string, email?: string): string | null {
  if (!bookingUrl) return null
  try {
    const url = new URL(bookingUrl)
    if (name) url.searchParams.set("name", name)
    if (email) url.searchParams.set("email", email)
    return url.toString()
  } catch {
    return null
  }
}

export function CalBookingLink({ name, email, className = "" }: { name?: string; email?: string; className?: string }) {
  const href = withPrefill(name, email)
  if (!href) return null
  return <a href={href} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary/15 ${className}`}>
    <CalendarDays className="h-4 w-4" />
    Book a call
    <ArrowUpRight className="h-4 w-4" />
  </a>
}

export function CalBookingEmbed({ name, email }: { name: string; email: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldLoad, setShouldLoad] = useState(false)
  const [failed, setFailed] = useState(false)
  const href = useMemo(() => withPrefill(name, email), [name, email])

  useEffect(() => {
    const element = containerRef.current
    if (!element || !href) return
    if (!("IntersectionObserver" in window)) {
      const browserWindow = window as Window & { requestIdleCallback?: (callback: () => void) => number; cancelIdleCallback?: (handle: number) => void }
      if (browserWindow.requestIdleCallback) {
        const idle = browserWindow.requestIdleCallback(() => setShouldLoad(true))
        return () => browserWindow.cancelIdleCallback?.(idle)
      }
      const timeout = globalThis.setTimeout(() => setShouldLoad(true), 1)
      return () => globalThis.clearTimeout(timeout)
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldLoad(true)
        observer.disconnect()
      }
    }, { rootMargin: "240px" })
    observer.observe(element)
    return () => observer.disconnect()
  }, [href])

  if (!href) return <div className="mt-8 rounded-2xl border border-dashed border-border/70 bg-background/20 p-5 text-left text-sm text-muted-foreground">Booking is not configured yet. You can still email developer@avintph.com and we’ll follow up.</div>

  return <div ref={containerRef} className="mt-8 rounded-2xl border border-border/70 bg-background/30 p-3 text-left" aria-live="polite">
    {failed ? <div className="rounded-xl border border-dashed border-border/70 bg-background/40 p-6"><p className="text-sm text-muted-foreground">The calendar could not load here. You can still choose a time on the booking page.</p><CalBookingLink name={name} email={email} className="mt-4" /></div> : shouldLoad ? <iframe title="Book a call" src={href} loading="lazy" onError={() => setFailed(true)} className="h-[680px] w-full rounded-xl border-0 bg-background" /> : <div className="flex min-h-40 items-center justify-center rounded-xl bg-background/40 p-6"><p className="text-sm text-muted-foreground">Your booking calendar will load here.</p></div>}
  </div>
}
