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
                @keyframes docDot {
                  0%,100% { opacity:0.2; } 25% { opacity:1; }
                }
                @keyframes barFloat {
                  0%,100% { height: var(--h-base); }
                  50% { height: var(--h-peak); }
                }
                @keyframes lineTrace {
                  0% { stroke-dashoffset: 60; }
                  100% { stroke-dashoffset: 0; }
                }
                @keyframes progressFill {
                  0% { width: 0%; }
                  60% { width: 89%; }
                  100% { width: 89%; }
                }
                @keyframes countUp24 {
                  0% { content: "0"; } 20%{ content:"5"; } 40%{content:"12";} 60%{content:"18";} 80%{content:"22";} 100%{content:"24";}
                }
                @keyframes tagCycle {
                  0%,28% { opacity:1; transform:scale(1); }
                  33%,99% { opacity:0.3; transform:scale(0.97); }
                  100% { opacity:1; }
                }
                .shimmer-bar {
                  background: linear-gradient(90deg, hsl(var(--muted)) 25%, hsl(var(--muted-foreground)/0.15) 50%, hsl(var(--muted)) 75%);
                  background-size: 200% 100%;
                  animation: shimmer 2s ease-in-out infinite;
                }
                .shimmer-bar-red {
                  background: linear-gradient(90deg, hsl(var(--primary)/0.3) 25%, hsl(var(--primary)/0.6) 50%, hsl(var(--primary)/0.3) 75%);
                  background-size: 200% 100%;
                  animation: shimmer 2s ease-in-out infinite;
                }
                .progress-fill { animation: progressFill 2.5s cubic-bezier(0.4,0,0.2,1) forwards; }
                .tag-invoice { animation: tagCycle 3.6s ease-in-out infinite 0s; }
                .tag-receipt { animation: tagCycle 3.6s ease-in-out infinite 1.2s; }
                .tag-report  { animation: tagCycle 3.6s ease-in-out infinite 2.4s; }
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
                    { dotDelay: "0s", barClass: "shimmer-bar", rightClass: "shimmer-bar", rightW: "w-12" },
                    { dotDelay: "0.6s", barClass: "shimmer-bar", rightClass: "shimmer-bar", rightW: "w-16" },
                    { dotDelay: "1.2s", barClass: "shimmer-bar", rightClass: "shimmer-bar-red", rightW: "w-10" },
                    { dotDelay: "1.8s", barClass: "shimmer-bar", rightClass: "shimmer-bar", rightW: "w-14" },
                  ].map((row, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: "hsl(var(--primary))",
                          animation: `docDot 2.4s ease-in-out infinite ${row.dotDelay}`,
                        }}
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
                  {[
                    { base: "40%", peak: "55%", delay: "0s", dim: true },
                    { base: "65%", peak: "80%", delay: "0.4s", dim: false },
                    { base: "50%", peak: "70%", delay: "0.8s", dim: true },
                  ].map((bar, i) => (
                    <div key={i} className="flex-1 rounded-sm" style={{
                      background: bar.dim ? "hsl(var(--muted))" : "hsl(var(--primary)/0.4)",
                      "--h-base": bar.base,
                      "--h-peak": bar.peak,
                      height: bar.base,
                      animation: `barFloat ${2 + i * 0.3}s ease-in-out infinite ${bar.delay}`,
                    } as React.CSSProperties} />
                  ))}
                  {/* SVG trend line overlay */}
                  <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 60" preserveAspectRatio="none">
                    <polyline
                      points="15,42 45,28 75,18"
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray="60"
                      style={{ animation: "lineTrace 2s ease-in-out infinite alternate" }}
                    />
                    {[[15,42],[45,28],[75,18]].map(([x,y],i) => (
                      <circle key={i} cx={x} cy={y} r="2.5" fill="hsl(var(--primary))"
                        style={{ animation: `docDot 2s ease-in-out infinite ${i*0.4}s` }} />
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
                    <CountUp target={24} className="text-lg font-semibold text-foreground" />
                    <div className="text-[10px] text-muted-foreground">Files</div>
                  </div>
                  <div className="flex-1 rounded-lg bg-primary/10 p-2">
                    <CountUp target={89} suffix="%" className="text-lg font-semibold text-primary" />
                    <div className="text-[10px] text-muted-foreground">Complete</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary progress-fill" />
                </div>
              </div>

              {/* Classification tags */}
              <div className="absolute right-12 bottom-28 flex flex-wrap gap-1.5">
                {[
                  { label: "invoice", cls: "tag-invoice" },
                  { label: "receipt", cls: "tag-receipt" },
                  { label: "report",  cls: "tag-report"  },
                ].map(({ label, cls }) => (
                  <span
                    key={label}
                    className={`rounded-md border px-2 py-1 text-[10px] shadow-sm transition-all ${cls}`}
                    style={{
                      borderColor: "hsl(var(--primary)/0.3)",
                      background: "hsl(var(--primary)/0.08)",
                      color: "hsl(var(--primary))",
                    }}
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
