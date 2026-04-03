"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

import { useEffect, useState, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"
function TrustedCounter() {
  const [current, setCurrent] = useState<number | null>(null)
  const [next, setNext] = useState<number | null>(null)
  const [phase, setPhase] = useState<"idle" | "exit" | "enter">("idle")

  const animateTo = (newCount: number) => {
    setPhase("exit")
    setTimeout(() => {
      setNext(newCount)
      setPhase("enter")
      setTimeout(() => {
        setCurrent(newCount)
        setNext(null)
        setPhase("idle")
      }, 350)
    }, 300)
  }

  useEffect(() => {
    supabase
      .from("user_counter")
      .select("total_users")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data?.total_users != null) setCurrent(data.total_users)
      })

    const channel = supabase
      .channel("user_counter_realtime")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "user_counter",
      }, (payload) => {
        animateTo(payload.new.total_users)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  if (current === null) return <span className="font-medium text-primary">—</span>

  return (
    <span className="relative inline-block overflow-hidden align-middle" style={{ height: "1.2em", minWidth: "1.5ch" }}>
      <style>{`
        @keyframes exitDown {
          from { transform: translateY(0); opacity: 1; }
          to { transform: translateY(100%); opacity: 0; }
        }
        @keyframes enterFromAbove {
          from { transform: translateY(-100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>
      {phase !== "enter" && (
        <span
          className="absolute inset-0 flex items-center justify-center font-medium text-primary"
          style={{
            animation: phase === "exit" ? "exitDown 0.3s cubic-bezier(0.4,0,0.2,1) forwards" : "none",
          }}
        >
          {current}
        </span>
      )}
      {phase === "enter" && next !== null && (
        <span
          className="absolute inset-0 flex items-center justify-center font-medium text-primary"
          style={{ animation: "enterFromAbove 0.35s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
        >
          {next}
        </span>
      )}
    </span>
  )
}

// Refined dimensional icon components
function ChartBarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="12" width="4" height="9" rx="1" className="fill-muted stroke-border" strokeWidth="0.5" />
      <rect x="10" y="8" width="4" height="13" rx="1" className="fill-primary/20 stroke-primary/40" strokeWidth="0.5" />
      <rect x="17" y="4" width="4" height="17" rx="1" className="fill-muted stroke-border" strokeWidth="0.5" />
      <path d="M5 11L12 6L19 3" className="stroke-primary/60" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="5" cy="11" r="1.5" className="fill-primary" />
      <circle cx="12" cy="6" r="1.5" className="fill-primary" />
      <circle cx="19" cy="3" r="1.5" className="fill-primary" />
    </svg>
  )
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="2" width="16" height="20" rx="2" className="fill-card stroke-border" strokeWidth="0.5" />
      <rect x="7" y="6" width="10" height="1.5" rx="0.5" className="fill-muted-foreground/30" />
      <rect x="7" y="10" width="8" height="1.5" rx="0.5" className="fill-muted-foreground/20" />
      <rect x="7" y="14" width="6" height="1.5" rx="0.5" className="fill-muted-foreground/20" />
      <rect x="14" y="14" width="3" height="1.5" rx="0.5" className="fill-primary/40" />
      <circle cx="18" cy="4" r="2" className="fill-primary" />
    </svg>
  )
}

function LoopCountUp({ target, suffix = "", className, loopDuration = 3500 }: { target: number; suffix?: string; className?: string; loopDuration?: number }) {
  const [val, setVal] = useState(0)
  const [blurred, setBlurred] = useState(true)

  useEffect(() => {
    let cancelled = false
    const run = () => {
      if (cancelled) return
      setVal(0)
      setBlurred(true)
      const blurEnd = loopDuration * 0.08
      setTimeout(() => { if (!cancelled) setBlurred(false) }, blurEnd)
      const steps = 45
      const stepDuration = (loopDuration * 0.75) / steps
      let step = 0
      const timer = setInterval(() => {
        step++
        const progress = step / steps
        const eased = 1 - Math.pow(1 - progress, 3)
        setVal(Math.floor(eased * target))
        if (step >= steps) {
          clearInterval(timer)
          if (!cancelled) setTimeout(run, loopDuration * 0.2)
        }
      }, stepDuration)
    }
    run()
    return () => { cancelled = true }
  }, [target, loopDuration])

  return (
    <span
      className={className}
      style={{
        filter: blurred ? "blur(5px)" : "blur(0)",
        transition: blurred ? "none" : "filter 0.25s ease",
        display: "inline-block",
      }}
    >
      {val}{suffix}
    </span>
  )
}

// Shared keyframes for all animated elements
const KEYFRAMES = `
  @keyframes shimmer {
    0% { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes docDotAnim {
    0%,100% { opacity:0.15; } 25% { opacity:1; }
  }
  @keyframes bar1 { 0%,100% { height:40%; } 50% { height:58%; } }
  @keyframes bar2 { 0%,100% { height:65%; } 50% { height:82%; } }
  @keyframes bar3 { 0%,100% { height:50%; } 50% { height:72%; } }
  @keyframes lineTrace {
    0%,100% { stroke-dashoffset: 60; opacity:0.4; }
    50% { stroke-dashoffset: 0; opacity:1; }
  }
  @keyframes dotPulse {
    0%,100% { opacity:0.3; r:2; }
    50% { opacity:1; r:3; }
  }
  @keyframes progressLoop {
    0% { width:0%; opacity:1; }
    75% { width:100%; opacity:1; }
    88% { width:100%; opacity:1; }
    96% { width:100%; opacity:0; }
    97% { width:0%; opacity:0; }
    100% { width:0%; opacity:1; }
  }
  .shimmer-bar {
    background: linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%);
    background-size: 200% 100%;
    animation: shimmer 1.8s ease-in-out infinite;
  }
  .shimmer-bar-red {
    background: linear-gradient(90deg, rgba(220,38,38,0.2) 25%, rgba(220,38,38,0.45) 50%, rgba(220,38,38,0.2) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.8s ease-in-out infinite 0.3s;
  }
  .bar-1 { animation: bar1 2.2s ease-in-out infinite 0s; }
  .bar-2 { animation: bar2 2.6s ease-in-out infinite 0.4s; }
  .bar-3 { animation: bar3 2.4s ease-in-out infinite 0.8s; }
  .progress-loop { animation: progressLoop 4.2s cubic-bezier(0.4,0,0.2,1) infinite; }
`

export function HeroSection() {
  const [session, setSession] = useState<Session | null>(null)
  const [authModalVisible, setAuthModalVisible] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  const handleToolClick = useCallback((e: React.MouseEvent, href: string) => {
    if (session) {
      // Logged in — open in new tab normally
      window.open(href, "_blank", "noopener,noreferrer")
    } else {
      // Not logged in — show auth modal inline, remember where to go after
      e.preventDefault()
      setPendingHref(href)
      setAuthModalVisible(true)
    }
  }, [session])

  const handleAuthSuccess = useCallback(() => {
    setAuthModalVisible(false)
    if (pendingHref) {
      window.open(pendingHref, "_blank", "noopener,noreferrer")
      setPendingHref(null)
    }
  }, [pendingHref])

  return (
    <>
      <AuthGuardModal isVisible={authModalVisible} onSuccess={handleAuthSuccess} />
      <section className="relative overflow-hidden px-6 py-24 md:py-32">
      <style>{KEYFRAMES}</style>
      <div className="mx-auto max-w-6xl">
        {/* Desktop: 40/60 split | Mobile: single column */}
        <div className="grid items-center gap-12 lg:grid-cols-[2fr_3fr]">

          {/* Left — Brand + content (unchanged) */}
          <div className="flex flex-col gap-6">
            <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground md:text-5xl lg:text-6xl">
              We develop products that simplify organization, decisions, and workflows.
            </h1>
            <p className="text-lg text-muted-foreground md:text-xl">
              Applied intelligence for real-world systems.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Link href="#tools">
                <Button size="lg" className="rounded-xl">
                  Explore Tools
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
              <Link href="#products">
                <Button variant="outline" size="lg" className="rounded-xl">
                  View Products
                </Button>
              </Link>
            </div>
            {/* Trust indicator */}
            <div className="pt-6">
              <span className="text-sm text-muted-foreground">
                Trusted by <TrustedCounter /> users worldwide
              </span>
            </div>
          </div>

          {/* Right — Product cards (desktop only) */}
          <div className="hidden lg:flex lg:flex-col lg:gap-3">

            {/* Smart Storage — Featured card */}
            <a
              href="/tools/smart-storage"
              rel="noopener noreferrer"
              onClick={(e) => handleToolClick(e, "/tools/smart-storage")}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md"
            >
              {/* Card header */}
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DocumentIcon className="h-5 w-5" />
                  <span className="text-sm font-semibold text-foreground">Smart Storage</span>
                </div>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                  Featured
                </span>
              </div>
              <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                Upload any financial document. AI extracts every field automatically and feeds your dashboard.
              </p>

              {/* Mini animated preview */}
              <div className="relative h-44 w-full overflow-hidden rounded-xl border border-border/40 bg-muted/20">
                {/* Documents panel */}
                <div className="absolute left-3 top-3 w-[48%] rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="mb-2 flex items-center gap-1.5">
                    <DocumentIcon className="h-3 w-3" />
                    <span className="text-[9px] text-muted-foreground">Documents</span>
                  </div>
                  <div className="space-y-1.5">
                    {[
                      { delay: "0s",    right: "shimmer-bar",     rw: "w-8" },
                      { delay: "0.6s",  right: "shimmer-bar",     rw: "w-10" },
                      { delay: "1.2s",  right: "shimmer-bar-red", rw: "w-6" },
                      { delay: "1.8s",  right: "shimmer-bar",     rw: "w-9" },
                    ].map((row, i) => (
                      <div key={i} className="flex items-center gap-1.5">
                        <div
                          className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary"
                          style={{ animation: `docDotAnim 2.4s ease-in-out infinite ${row.delay}` }}
                        />
                        <div className={`h-1.5 flex-1 rounded shimmer-bar`} />
                        <div className={`h-1.5 ${row.rw} flex-shrink-0 rounded ${row.right}`} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Analytics panel */}
                <div className="absolute right-3 top-3 w-[46%] rounded-xl border border-border bg-card p-3 shadow-sm">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[9px] text-muted-foreground">Analytics</span>
                    <div className="flex items-center gap-0.5">
                      <div className="h-1 w-1 rounded-full bg-primary" style={{ animation: "docDotAnim 1.5s ease-in-out infinite" }} />
                      <span className="text-[8px] text-primary">Live</span>
                    </div>
                  </div>
                  <div className="relative flex h-14 items-end gap-1 px-0.5">
                    <div className="flex-1 rounded-sm bg-muted bar-1" style={{ minHeight: "35%" }} />
                    <div className="flex-1 rounded-sm bar-2" style={{ background: "rgba(220,38,38,0.35)", minHeight: "60%" }} />
                    <div className="flex-1 rounded-sm bg-muted bar-3" style={{ minHeight: "45%" }} />
                    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
                      <polyline
                        points="15,44 45,30 75,20"
                        fill="none"
                        stroke="rgb(220,38,38)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeDasharray="60"
                        style={{ animation: "lineTrace 3s ease-in-out infinite" }}
                      />
                    </svg>
                  </div>
                </div>

                {/* Processing bar */}
                <div className="absolute bottom-3 left-3 right-3 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[9px] font-medium text-foreground">Processing</span>
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[8px] font-medium text-primary">Active</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary progress-loop" />
                  </div>
                </div>
              </div>

              {/* Document type tags */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["Receipts", "Invoices", "Payslips", "Contracts", "Bank Statements"].map((tag) => (
                  <span
                    key={tag}
                    className="rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </a>

            {/* Secondary row: Smart Dashboard + Pricing */}
            <div className="grid grid-cols-2 gap-3">

              {/* Smart Dashboard */}
              <a
                href="/tools/smart-dashboard"
                rel="noopener noreferrer"
                onClick={(e) => handleToolClick(e, "/tools/smart-dashboard")}
                className="group cursor-pointer rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md"
              >
                <div className="mb-2 flex items-center gap-2">
                  <ChartBarIcon className="h-5 w-5" />
                  <span className="text-sm font-semibold text-foreground">Smart Dashboard</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Income vs expenses, spending by category, tax exposure, and 7 auto-generated report types.
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {["Analytics", "Reports", "Trends"].map((tag) => (
                    <span key={tag} className="rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              </a>

              {/* Pricing */}
              <Link
                href="/pricing"
                className="group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:border-primary/30 hover:shadow-md"
              >
                <div className="mb-2">
                  <span className="text-sm font-semibold text-foreground">Pricing</span>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Free tier available. $6 day pass. Full access at $12/month.
                </p>
                <div className="mt-3 text-xs font-medium text-primary transition-colors group-hover:text-primary/80">
                  View plans →
                </div>
              </Link>

            </div>
          </div>

        </div>
      </div>
    </section>
    </>
  )
}
