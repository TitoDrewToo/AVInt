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

let embedScriptPromise: Promise<void> | null = null
let calInitialized = false

type CalApi = ((...args: unknown[]) => void) & { q?: unknown[]; t?: Date }

function bootstrapCal() {
  if (typeof window.Cal === "function") return
  const cal = ((...args: unknown[]) => {
    cal.q ??= []
    cal.q.push(args)
  }) as CalApi
  cal.q = []
  cal.t = new Date()
  window.Cal = cal
}

function loadCalEmbed(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Calendar is only available in a browser"))
  bootstrapCal()
  if (embedScriptPromise) return embedScriptPromise
  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-cal-embed="true"]')
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true })
      existing.addEventListener("error", () => reject(new Error("The calendar embed could not load")), { once: true })
      return
    }

    const script = document.createElement("script")
    script.async = true
    script.src = "https://app.cal.com/embed/embed.js"
    script.dataset.calEmbed = "true"
    script.addEventListener("load", () => resolve(), { once: true })
    script.addEventListener("error", () => reject(new Error("The calendar embed could not load")), { once: true })
    document.head.appendChild(script)
  }).catch((error) => {
    embedScriptPromise = null
    throw error
  })

  embedScriptPromise = promise
  initializeCal()
  return promise
}

function initializeCal() {
  if (calInitialized || typeof window === "undefined" || typeof window.Cal !== "function") return
  window.Cal("init", { origin: "https://cal.com" })
  calInitialized = true
}

export function toCalLink(value: string | undefined): string | null {
  if (!value?.trim()) return null
  try {
    return new URL(value).pathname.replace(/^\/+|\/+$/g, "") || null
  } catch {
    return null
  }
}

declare global {
  interface Window {
    Cal?: CalApi
  }
}

export function CalBookingLink({ name, email, className = "", onUnavailable }: { name?: string; email?: string; className?: string; onUnavailable?: () => void }) {
  const href = withPrefill(name, email)
  const calLink = toCalLink(href ?? undefined)
  const loadingRef = useRef(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!href || !calLink) return
    let active = true
    loadCalEmbed().catch(() => {
      if (active) onUnavailable?.()
    })
    return () => {
      active = false
    }
  }, [calLink, href, onUnavailable])

  if (!href || !calLink) return null

  async function openCalendar() {
    if (loadingRef.current) return

    loadingRef.current = true
    setLoading(true)
    try {
      await loadCalEmbed()
      const cal = window.Cal as CalApi | undefined
      if (!cal) throw new Error("The calendar embed did not initialise")
      cal("modal", { calLink, config: JSON.parse(config) })
    } catch {
      onUnavailable?.()
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }

  const config = JSON.stringify({ ...(name ? { name } : {}), ...(email ? { email } : {}) })

  return <button type="button" data-cal-link={calLink} data-cal-config={config} onClick={openCalendar} disabled={loading} className={`inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:border-primary/60 hover:bg-primary/15 disabled:cursor-wait disabled:opacity-70 ${className}`}>
    <CalendarDays className="h-4 w-4" />
    {loading ? "Opening calendar…" : "Book a call"}
    <ArrowUpRight className="h-4 w-4" />
  </button>
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
