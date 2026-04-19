"use client"

import Link from "next/link"
import { StorageIcon, DashboardIcon } from "@/components/sections/tools"
import { CollapseBoxGraphic, FloatingCubeGraphic } from "@/components/sections/graphics-staging"

import { useEffect, useState, useCallback, type MouseEvent } from "react"
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

export function HeroSection() {
  const [session, setSession] = useState<Session | null>(null)
  const [authModalVisible, setAuthModalVisible] = useState(false)
  const [pendingHref, setPendingHref] = useState<string | null>(null)
  const [storageHovered, setStorageHovered] = useState(false)
  const [dashboardHovered, setDashboardHovered] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  const handleToolClick = useCallback((e: MouseEvent<HTMLElement>, href: string) => {
    e.preventDefault()
    if (session) {
      // Logged in — open in new tab, homepage stays put
      window.open(href, "_blank", "noopener,noreferrer")
    } else {
      // Not logged in — show auth modal inline, remember where to go after
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
      <AuthGuardModal
        isVisible={authModalVisible}
        onSuccess={handleAuthSuccess}
        onClose={() => { setAuthModalVisible(false); setPendingHref(null) }}
      />
      <section className="relative overflow-hidden px-6 py-20 md:py-28">
        {/* Retro-futurism backdrop — grid + radial red glow, decorative only */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(color-mix(in oklab, var(--retro-glow-red) 22%, transparent) 1px, transparent 1px),
              linear-gradient(90deg, color-mix(in oklab, var(--retro-glow-red) 22%, transparent) 1px, transparent 1px)
            `,
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at center, black 42%, transparent 82%)",
            WebkitMaskImage: "radial-gradient(ellipse at center, black 42%, transparent 82%)",
            opacity: 0.9,
          }}
        />
        <div className="relative mx-auto max-w-6xl">
          {/* Trusted counter */}
          <div className="relative z-[1] mb-8">
            <span className="text-sm text-muted-foreground">
              Trusted by <TrustedCounter /> users worldwide
            </span>
          </div>

          {/* Two combined cards — equal columns */}
          <div className="relative z-[1] grid gap-4 md:grid-cols-2">

            {/* Smart Storage */}
            <div
              onMouseEnter={() => setStorageHovered(true)}
              onMouseLeave={() => setStorageHovered(false)}
              onClick={(e) => handleToolClick(e, "/tools/smart-storage")}
              className="cw-launcher-card glass-surface group relative flex min-h-[28rem] cursor-pointer flex-col overflow-hidden rounded-2xl p-5 md:min-h-[30rem]"
            >
              <div className="absolute inset-0 overflow-hidden">
                <CollapseBoxGraphic embedded hovered={storageHovered} className="absolute inset-0" />
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--background) 74%, transparent) 0%, color-mix(in oklab, var(--background) 34%, transparent) 24%, transparent 52%, transparent 80%, color-mix(in oklab, var(--background) 36%, transparent) 100%)",
                }}
              />
              <div className="relative z-[1] flex h-full max-w-[24rem] flex-col">
              <div className="mb-2 flex items-center gap-2">
                <div className="cw-button-flow glass-surface-sm flex h-9 w-9 items-center justify-center rounded-xl transition-all group-hover:[box-shadow:0_0_24px_-4px_var(--retro-glow-red)]">
                  <StorageIcon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Smart Storage</h3>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                <span className="block whitespace-nowrap">Secure cloud storage. AI-structured data. Reports ready.</span>
                <span className="block whitespace-nowrap text-xs text-muted-foreground/70">Tax-ready insights, smart flags, and exportable summaries when you need them.</span>
              </p>
              {/* Tags */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["Receipts", "Invoices", "Payslips", "Contracts"].map((tag) => (
                  <span key={tag} className="rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                ))}
              </div>

              {/* Actions */}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
                <Link href="/products/smart-storage"
                  onClick={(e) => e.stopPropagation()}
                  className="cw-button-flow inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg border border-border/60 px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                  Learn more
                </Link>
                <button
                  onClick={(e) => handleToolClick(e, "/tools/smart-storage")}
                  className="cw-button-flow inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  {session ? "Launch Smart Storage →" : "Try for free"}
                </button>
              </div>
              </div>
            </div>

            {/* Smart Dashboard */}
            <div
              onMouseEnter={() => setDashboardHovered(true)}
              onMouseLeave={() => setDashboardHovered(false)}
              onClick={(e) => handleToolClick(e, "/tools/smart-dashboard")}
              className="cw-launcher-card glass-surface group relative flex min-h-[28rem] cursor-pointer flex-col overflow-hidden rounded-2xl p-5 md:min-h-[30rem]"
            >
              <div className="absolute inset-0 overflow-hidden">
                <FloatingCubeGraphic embedded hovered={dashboardHovered} className="absolute inset-0" />
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--background) 74%, transparent) 0%, color-mix(in oklab, var(--background) 34%, transparent) 24%, transparent 54%, transparent 82%, color-mix(in oklab, var(--background) 38%, transparent) 100%)",
                }}
              />
              <div className="relative z-[1] flex h-full max-w-[18.5rem] flex-col">
              <div className="mb-2 flex items-center gap-2">
                <div className="cw-button-flow glass-surface-sm flex h-9 w-9 items-center justify-center rounded-xl transition-all group-hover:[box-shadow:0_0_24px_-4px_var(--retro-glow-red)]">
                  <DashboardIcon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold text-foreground">Smart Dashboard</h3>
              </div>
              <p className="mb-1 text-sm leading-relaxed text-muted-foreground">
                AI-powered custom dashboards and visuals.
              </p>
              <p className="mb-4 text-xs text-muted-foreground/70">
                Interactive dashboards built from real activity data.
              </p>
              {/* Tags */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {["Analytics", "Reports", "Trends"].map((tag) => (
                  <span key={tag} className="rounded border border-border/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                ))}
              </div>

              {/* Actions */}
              <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
                <Link href="/products/smart-dashboard"
                  onClick={(e) => e.stopPropagation()}
                  className="cw-button-flow inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg border border-border/60 px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
                  Learn more
                </Link>
                <button
                  onClick={(e) => handleToolClick(e, "/tools/smart-dashboard")}
                  className="cw-button-flow inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                  {session ? "Launch Smart Dashboard →" : "Try for free"}
                </button>
              </div>
              </div>
            </div>

          </div>
        </div>
      </section>
    </>
  )
}
