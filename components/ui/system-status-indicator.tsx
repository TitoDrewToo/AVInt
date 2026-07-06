"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabase"

type Overall = "operational" | "degraded" | "outage"

interface HealthResponse {
  overall: Overall
  providers: {
    supabase: string
    vercel: string
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

const AI_STATUS_PAGES = {
  openai: "https://status.openai.com/",
  anthropic: "https://status.claude.com/",
  gemini: "https://aistudio.google.com/status",
} as const

function isAffectedProvider(indicator: string): boolean {
  return ["minor", "maintenance", "major", "critical"].includes(indicator)
}

function openAffectedAiStatusPages(providers: HealthResponse["providers"]) {
  for (const key of Object.keys(AI_STATUS_PAGES) as Array<keyof typeof AI_STATUS_PAGES>) {
    if (isAffectedProvider(providers[key])) {
      window.open(AI_STATUS_PAGES[key], "_blank", "noopener,noreferrer")
    }
  }
}

function StatusRow({
  label,
  indicator,
  href,
  operationalText,
}: {
  label: string
  indicator: string
  href?: string
  operationalText?: string
}) {
  const status = indicatorToStatus(indicator)
  const color =
    status === "operational" ? "text-green-500" :
    status === "outage"      ? "text-red-500"   : "text-amber-400"
  const text =
    indicator === "none"        ? operationalText ?? "Operational" :
    indicator === "unknown"     ? "Unknown"     :
    indicator === "minor"       ? "Minor issues":
    indicator === "maintenance" ? "Maintenance" :
    ["major", "critical"].includes(indicator) ? "Outage" : indicator

  const content = (
    <>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-right text-xs font-medium ${color}`}>{text}</span>
    </>
  )

  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-sm transition-colors hover:text-foreground"
    >
      {content}
    </a>
  ) : (
    <div className="flex items-center justify-between gap-3">
      {content}
    </div>
  )
}

export function SystemStatusIndicator() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [isOwner, setIsOwner] = useState(false)
  const [open, setOpen] = useState(false)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showPanel = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setOpen(true)
  }

  const scheduleClosePanel = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    closeTimerRef.current = setTimeout(() => {
      setOpen(false)
      closeTimerRef.current = null
    }, 260)
  }

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

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current)
    }
  }, [])

  const overall = health?.overall ?? "operational"
  const p = health?.providers

  // Grouped statuses for user view
  const aiStatus = p ? worstOf(p.openai, p.anthropic, p.gemini) : "operational"
  const canOpenAiStatus = !isOwner && aiStatus !== "operational" && !!p

  const handleAiStatusClick = () => {
    if (!canOpenAiStatus || !p) return
    openAffectedAiStatusPages(p)
  }

  const statusTitle = canOpenAiStatus
    ? `${LABEL[overall]} — click to view affected AI provider status`
    : LABEL[overall]

  return (
    <div
      className="relative"
      onMouseEnter={showPanel}
      onMouseLeave={scheduleClosePanel}
      onFocus={showPanel}
      onBlur={scheduleClosePanel}
    >
      <button
        type="button"
        className="relative flex h-2 w-2 cursor-pointer focus:outline-none"
        title={statusTitle}
        aria-label={statusTitle}
        aria-expanded={open}
        onClick={handleAiStatusClick}
      >
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${DOT[overall]} opacity-50`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${DOT[overall]}`} />
      </button>

      {open && (
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
                <StatusRow label="Supabase" indicator={p?.supabase ?? "unknown"} href="https://status.supabase.com/" />
                <StatusRow label="Vercel Hosting" indicator={p?.vercel ?? "unknown"} href="https://www.vercel-status.com/" />
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mt-2.5 mb-1.5">AI Providers</p>
                <StatusRow label="OpenAI" indicator={p?.openai ?? "unknown"} href="https://status.openai.com/" />
                <StatusRow label="Anthropic" indicator={p?.anthropic ?? "unknown"} href="https://status.claude.com/" />
                <StatusRow
                  label="Gemini"
                  indicator={p?.gemini ?? "unknown"}
                  href="https://aistudio.google.com/status"
                />
              </div>
            ) : (
              /* User view — DB and AI only */
              <div className="space-y-1.5 border-t border-border pt-2">
                <StatusRow label="Database" indicator={p?.supabase ?? "unknown"} />
                {canOpenAiStatus ? (
                  <button
                    type="button"
                    onClick={handleAiStatusClick}
                    className="flex w-full items-center justify-between rounded-sm transition-colors hover:text-foreground"
                    title="View affected AI provider status pages"
                  >
                    <span className="text-xs text-muted-foreground">AI</span>
                    <span className={`text-xs font-medium ${
                      aiStatus === "outage" ? "text-red-500" : "text-amber-400"
                    }`}>
                      {aiStatus === "outage" ? "Outage — click for details" : "Minor issues — click for details"}
                    </span>
                  </button>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">AI</span>
                    <span className="text-xs font-medium text-green-500">Operational</span>
                  </div>
                )}
              </div>
            )}
        </div>
      )}
    </div>
  )
}
