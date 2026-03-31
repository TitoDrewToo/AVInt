"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

type Overall = "operational" | "degraded" | "outage"

interface HealthResponse {
  overall: Overall
  providers: {
    supabase: string
    lemon: string
    openai: string
    anthropic: string
    gemini: string
  }
}

const DOT: Record<Overall, string> = {
  operational: "bg-green-500",
  degraded:    "bg-amber-400",
  outage:      "bg-red-500",
}

const LABEL: Record<Overall, string> = {
  operational: "All systems operational",
  degraded:    "Degraded performance",
  outage:      "Service disruption",
}

function indicatorToStatus(s: string): Overall {
  if (["major", "critical"].includes(s)) return "outage"
  if (["minor", "maintenance"].includes(s)) return "degraded"
  return "operational"
}

function worstOf(...statuses: string[]): Overall {
  if (statuses.some((s) => ["major", "critical"].includes(s))) return "outage"
  if (statuses.some((s) => ["minor", "maintenance"].includes(s))) return "degraded"
  return "operational"
}

function StatusRow({ label, indicator }: { label: string; indicator: string }) {
  const status = indicatorToStatus(indicator)
  const color =
    status === "operational" ? "text-green-500" :
    status === "outage"      ? "text-red-500"   : "text-amber-400"
  const text =
    indicator === "none"        ? "Operational" :
    indicator === "unknown"     ? "Unknown"     :
    indicator === "minor"       ? "Minor issues":
    indicator === "maintenance" ? "Maintenance" :
    ["major", "critical"].includes(indicator) ? "Outage" : indicator

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium ${color}`}>{text}</span>
    </div>
  )
}

export function SystemStatusIndicator() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [open, setOpen] = useState(false)

  // Detect owner
  useEffect(() => {
    const ownerEmail = process.env.NEXT_PUBLIC_AA_BETA_EMAIL
    if (!ownerEmail) return
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user?.email === ownerEmail) setIsOwner(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setIsOwner(s?.user?.email === ownerEmail)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Poll health
  useEffect(() => {
    let cancelled = false
    async function poll() {
      try {
        const res = await fetch("/api/health")
        if (!res.ok || cancelled) return
        const data: HealthResponse = await res.json()
        if (!cancelled) setHealth(data)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 5 * 60 * 1000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const overall = health?.overall ?? "operational"
  const p = health?.providers

  // Grouped statuses for user view
  const aiStatus = p ? worstOf(p.openai, p.anthropic, p.gemini) : "operational"

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-2 w-2 cursor-pointer focus:outline-none"
        title={LABEL[overall]}
        aria-label={LABEL[overall]}
      >
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${DOT[overall]} opacity-50`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT[overall]}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-5 z-50 w-56 rounded-xl border border-border bg-card p-3 shadow-lg">
            {/* Header */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex h-2 w-2 rounded-full ${DOT[overall]}`} />
              <p className="text-xs font-medium text-foreground">{LABEL[overall]}</p>
            </div>

            {isOwner ? (
              /* Owner view — all providers */
              <div className="space-y-1.5 border-t border-border pt-2">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Infrastructure</p>
                <StatusRow label="Supabase"    indicator={p?.supabase  ?? "unknown"} />
                <StatusRow label="LemonSqueezy" indicator={p?.lemon    ?? "unknown"} />
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-2.5 mb-1.5">AI Providers</p>
                <StatusRow label="OpenAI"    indicator={p?.openai    ?? "unknown"} />
                <StatusRow label="Anthropic" indicator={p?.anthropic ?? "unknown"} />
                <StatusRow label="Gemini"    indicator={p?.gemini    ?? "unknown"} />
              </div>
            ) : (
              /* User view — grouped */
              <div className="space-y-1.5 border-t border-border pt-2">
                <StatusRow label="Database" indicator={p?.supabase ?? "unknown"} />
                <StatusRow label="Payments" indicator={p?.lemon    ?? "unknown"} />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">AI</span>
                  <span className={`text-xs font-medium ${
                    aiStatus === "operational" ? "text-green-500" :
                    aiStatus === "outage"      ? "text-red-500"   : "text-amber-400"
                  }`}>
                    {aiStatus === "operational" ? "Operational" :
                     aiStatus === "outage"      ? "Outage"      : "Minor issues"}
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
