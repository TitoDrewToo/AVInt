"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

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

function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="7" height="7" rx="1.5" className="fill-muted stroke-border" strokeWidth="0.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" className="fill-primary/15 stroke-primary/30" strokeWidth="0.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" className="fill-muted stroke-border" strokeWidth="0.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" className="fill-muted stroke-border" strokeWidth="0.5" />
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
      // Blur for first ~5% of duration
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

function CountUp({ target, suffix = "", className }: { target: number; suffix?: string; className?: string }) {
  const [val, setVal] = useState(0)
  const [blurred, setBlurred] = useState(true)

  useEffect(() => {
    // Blur phase: 0-5% of duration
    const blurTimer = setTimeout(() => setBlurred(false), 400)
    const duration = 1800
    const steps = 40
    const increment = target / steps
    let current = 0
    const timer = setInterval(() => {
      current = Math.min(current + increment, target)
      setVal(Math.floor(current))
      if (current >= target) clearInterval(timer)
    }, duration / steps)
    return () => { clearInterval(timer); clearTimeout(blurTimer) }
  }, [target])

  return (
    <span
      className={className}
      style={{
        filter: blurred ? "blur(4px)" : "blur(0)",
        transition: "filter 0.3s ease",
      }}
    >
      {val}{suffix}
    </span>
  )
}

export function HeroSection() {
  return (
    <section className="relative overflow-hidden px-6 py-24 md:py-32">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Left side - Text */}
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
            {/* Trust indicators */}
            <div className="flex items-center gap-6 pt-8">
              <div className="flex -space-x-2">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="h-8 w-8 rounded-full border-2 border-background bg-muted"
                  />
                ))}
              </div>
              <span className="text-sm text-muted-foreground">
                Trusted by <TrustedCounter /> users worldwide
              </span>
            </div>
          </div>

          {/* Right side - Dimensional UI composition */}
          <div className="relative hidden lg:block">
            <div className="relative mx-auto h-[420px] w-full max-w-lg">
              {/* Background atmospheric layer */}
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-muted/50 via-transparent to-muted/30" />
              
              {/* Background structural grid hint */}
              <div className="absolute bottom-4 right-4 h-32 w-48 rounded-xl border border-border/50 bg-card/30 p-3 opacity-60">
                <GridIcon className="h-full w-full opacity-40" />
              </div>

              {/* Global keyframes */}
              <style>{`
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
                  70% { width:89%; opacity:1; }
                  85% { width:89%; opacity:1; }
                  95% { width:89%; opacity:0; }
                  96% { width:0%; opacity:0; }
                  100% { width:0%; opacity:1; }
                }
                @keyframes tagActive {
                  0%,30% { opacity:1; font-weight:600; border-color:rgba(220,38,38,0.6); background:rgba(220,38,38,0.1); color:rgb(220,38,38); }
                  35%,100% { opacity:0.4; font-weight:400; border-color:rgba(0,0,0,0.1); background:transparent; color:inherit; }
                }
                @keyframes cubeSwap {
                  0%,30% { opacity:0.5; transform:scale(1); }
                  35%,100% { opacity:0; transform:scale(0.8); }
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
                .progress-loop { animation: progressLoop 3.5s cubic-bezier(0.4,0,0.2,1) infinite; }
                .tag-invoice { animation: tagActive 3.6s ease-in-out infinite 0s; }
                .tag-receipt { animation: tagActive 3.6s ease-in-out infinite 1.2s; }
                .tag-report  { animation: tagActive 3.6s ease-in-out infinite 2.4s; }
                @keyframes cubeActive {
                  0%,22% { background:rgba(220,38,38,0.18); border-color:rgba(220,38,38,0.5); }
                  27%,100% { background:rgba(220,38,38,0.04); border-color:rgba(220,38,38,0.12); }
                }
                .cube-1 { animation: cubeActive 4.8s ease-in-out infinite 0s; }
                .cube-2 { animation: cubeActive 4.8s ease-in-out infinite 1.2s; }
                .cube-3 { animation: cubeActive 4.8s ease-in-out infinite 2.4s; }
                .cube-4 { animation: cubeActive 4.8s ease-in-out infinite 3.6s; }
                @keyframes shimmerText {
                  0% { background-position: -200% center; }
                  100% { background-position: 200% center; }
                }
                .shimmer-text {
                  background: linear-gradient(90deg, #d1d5db 25%, #f9fafb 50%, #d1d5db 75%);
                  background-size: 200% 100%;
                  animation: shimmerText 1.5s ease-in-out infinite;
                  -webkit-background-clip: text;
                  -webkit-text-fill-color: transparent;
                  background-clip: text;
                }
              `}</style>

              {/* Mid layer - Documents panel */}
              <div className="absolute left-0 top-20 w-72 rounded-2xl border border-border bg-card p-5 shadow-sm shadow-black/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DocumentIcon className="h-5 w-5" />
                    <span className="text-xs font-medium text-muted-foreground">Documents</span>
                  </div>
                  {/* Dot cycles through rows */}
                  <div className="h-2 w-2 rounded-full bg-primary" style={{ animation: "docDot 2.4s ease-in-out infinite" }} />
                </div>
                <div className="mt-4 space-y-2.5">
                  {[
                    { dotDelay: "0s",   barClass: "shimmer-bar", rightClass: "shimmer-bar",     rightW: "w-12" },
                    { dotDelay: "0.6s", barClass: "shimmer-bar", rightClass: "shimmer-bar",     rightW: "w-16" },
                    { dotDelay: "1.2s", barClass: "shimmer-bar", rightClass: "shimmer-bar-red", rightW: "w-10" },
                    { dotDelay: "1.8s", barClass: "shimmer-bar", rightClass: "shimmer-bar",     rightW: "w-14" },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className="h-2 w-2 rounded-full bg-primary"
                        style={{ animation: `docDotAnim 2.4s ease-in-out infinite ${row.dotDelay}` }}
                      />
                      <div className={`h-2.5 flex-1 rounded ${row.barClass}`} />
                      <div className={`h-2.5 ${row.rightW} rounded ${row.rightClass}`} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Foreground - Analytics panel */}
              <div className="absolute right-0 top-0 w-64 rounded-2xl border border-border bg-card p-5 shadow-md shadow-black/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Analytics</span>
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" style={{ animation: "docDot 1.5s ease-in-out infinite" }} />
                    <span className="text-[10px] text-primary">Live</span>
                  </div>
                </div>
                {/* Animated bars + line */}
                <div className="mt-4 h-28 w-full relative flex items-end gap-2 px-1">
                  <div className="flex-1 rounded-sm bg-muted bar-1" style={{ minHeight: "40%" }} />
                  <div className="flex-1 rounded-sm bar-2" style={{ background: "rgba(220,38,38,0.35)", minHeight: "65%" }} />
                  <div className="flex-1 rounded-sm bg-muted bar-3" style={{ minHeight: "50%" }} />
                  {/* SVG trend line overlay */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 60" preserveAspectRatio="none">
                    <polyline
                      points="15,42 45,28 75,18"
                      fill="none"
                      stroke="rgb(220,38,38)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="60"
                      style={{ animation: "lineTrace 3s ease-in-out infinite" }}
                    />
                    {([[15,42],[45,28],[75,18]] as [number,number][]).map(([x,y],i) => (
                      <circle key={i} cx={x} cy={y} r="2.5" fill="rgb(220,38,38)"
                        style={{ animation: `dotPulse 2s ease-in-out infinite ${i*0.4}s` }} />
                    ))}
                  </svg>
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Jan</span>
                  <span className="text-muted-foreground">Feb</span>
                  <span className="text-muted-foreground">Mar</span>
                </div>
              </div>

              {/* Processing panel */}
              <div className="absolute bottom-8 left-8 w-56 rounded-2xl border border-border bg-card p-4 shadow-sm shadow-black/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Processing</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">Active</span>
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="flex-1 rounded-lg bg-muted p-2">
                    <LoopCountUp target={24} className="text-lg font-semibold text-foreground" loopDuration={3500} />
                    <div className="text-[10px] text-muted-foreground">Files</div>
                  </div>
                  <div className="flex-1 rounded-lg bg-primary/10 p-2">
                    <LoopCountUp target={89} suffix="%" className="text-lg font-semibold text-primary" loopDuration={3500} />
                    <div className="text-[10px] text-muted-foreground">Complete</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary progress-loop" />
                </div>
              </div>

              {/* Classification tags + 4-cube grid */}
              <div className="absolute right-12 bottom-20">
                {/* Tags row */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "invoice", cls: "tag-invoice" },
                    { label: "receipt", cls: "tag-receipt" },
                    { label: "report",  cls: "tag-report"  },
                  ].map(({ label, cls }) => (
                    <span key={label} className={`rounded-md border px-2 py-1 text-[10px] shadow-sm ${cls}`}>
                      {label}
                    </span>
                  ))}
                </div>
                {/* 4-cube grid with cycling red highlight */}
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {["cube-1","cube-2","cube-3","cube-4"].map((cls) => (
                    <div
                      key={cls}
                      className={`h-7 w-14 rounded-md border ${cls}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
