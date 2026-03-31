"use client"

import { useState, useEffect } from "react"

type Overall = "operational" | "degraded" | "outage"

interface HealthResponse {
  overall: Overall
  providers: { supabase: string; lemon: string }
}

const CONFIG: Record<Overall, { dot: string; ping: string; label: string; detail: string }> = {
  operational: {
    dot:    "bg-green-500",
    ping:   "bg-green-500",
    label:  "All systems operational",
    detail: "Supabase and LemonSqueezy are running normally.",
  },
  degraded: {
    dot:    "bg-amber-400",
    ping:   "bg-amber-400",
    label:  "Degraded performance",
    detail: "One or more providers are experiencing issues.",
  },
  outage: {
    dot:    "bg-red-500",
    ping:   "bg-red-500",
    label:  "Service disruption",
    detail: "A provider outage may affect functionality.",
  },
}

export function SystemStatusIndicator() {
  const [status, setStatus] = useState<Overall>("operational")
  const [providers, setProviders] = useState<{ supabase: string; lemon: string } | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function poll() {
      try {
        const res = await fetch("/api/health")
        if (!res.ok || cancelled) return
        const data: HealthResponse = await res.json()
        if (!cancelled) {
          setStatus(data.overall)
          setProviders(data.providers)
        }
      } catch {
        // network error — leave current status as-is
      }
    }

    poll()
    const id = setInterval(poll, 5 * 60 * 1000) // re-check every 5 min
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const cfg = CONFIG[status]

  function providerLabel(indicator: string) {
    if (indicator === "none") return "Operational"
    if (indicator === "unknown") return "Unknown"
    if (indicator === "minor") return "Minor issues"
    if (indicator === "maintenance") return "Maintenance"
    if (indicator === "major" || indicator === "critical") return "Outage"
    return indicator
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-2 w-2 cursor-pointer focus:outline-none"
        title={cfg.label}
        aria-label={cfg.label}
      >
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${cfg.ping} opacity-50`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${cfg.dot}`} />
      </button>

      {open && (
        <>
          {/* backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          {/* popover */}
          <div className="absolute right-0 top-5 z-50 w-56 rounded-xl border border-border bg-card p-3 shadow-lg">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex h-2 w-2 rounded-full ${cfg.dot}`} />
              <p className="text-xs font-medium text-foreground">{cfg.label}</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">{cfg.detail}</p>
            {providers && (
              <div className="space-y-1.5 border-t border-border pt-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Supabase</span>
                  <span className={`text-xs font-medium ${providers.supabase === "none" ? "text-green-500" : "text-amber-400"}`}>
                    {providerLabel(providers.supabase)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">LemonSqueezy</span>
                  <span className={`text-xs font-medium ${providers.lemon === "none" ? "text-green-500" : "text-amber-400"}`}>
                    {providerLabel(providers.lemon)}
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
