"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

function TrustedCounter() {
  const [displayCount, setDisplayCount] = useState(1)
  const [direction, setDirection] = useState<"up" | null>(null)

  useEffect(() => {
    supabase
      .from("user_counter")
      .select("total_users")
      .eq("id", 1)
      .single()
      .then(({ data }) => {
        if (data?.total_users) setDisplayCount(data.total_users)
      })

    const channel = supabase
      .channel("user_counter_realtime")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "user_counter",
      }, (payload) => {
        const newCount = payload.new.total_users
        setDirection("up")
        setTimeout(() => {
          setDisplayCount(newCount)
          setTimeout(() => setDirection(null), 300)
        }, 200)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <span
      className="font-medium text-primary inline-block transition-all duration-200"
      style={{
        transform: direction === "up" ? "translateY(-4px)" : "translateY(0)",
        opacity: direction === "up" ? 0 : 1,
      }}
    >
      {displayCount}
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

              {/* Mid layer - Data table panel */}
              <div className="absolute left-0 top-20 w-72 rounded-2xl border border-border bg-card p-5 shadow-sm shadow-black/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DocumentIcon className="h-5 w-5" />
                    <span className="text-xs font-medium text-muted-foreground">Documents</span>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-primary" />
                </div>
                <div className="mt-4 space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-primary/40" />
                    <div className="h-2.5 flex-1 rounded bg-muted" />
                    <div className="h-2.5 w-12 rounded bg-muted" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                    <div className="h-2.5 flex-1 rounded bg-muted" />
                    <div className="h-2.5 w-16 rounded bg-muted" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                    <div className="h-2.5 flex-1 rounded bg-muted" />
                    <div className="h-2.5 w-10 rounded bg-primary/20" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                    <div className="h-2.5 flex-1 rounded bg-muted" />
                    <div className="h-2.5 w-14 rounded bg-muted" />
                  </div>
                </div>
              </div>

              {/* Foreground - Analytics chart panel (primary) */}
              <div className="absolute right-0 top-0 w-64 rounded-2xl border border-border bg-card p-5 shadow-md shadow-black/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Analytics</span>
                  <div className="flex items-center gap-1">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    <span className="text-[10px] text-primary">Live</span>
                  </div>
                </div>
                <div className="mt-4">
                  <ChartBarIcon className="h-28 w-full" />
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Jan</span>
                  <span className="text-muted-foreground">Feb</span>
                  <span className="text-muted-foreground">Mar</span>
                </div>
              </div>

              {/* Dashboard widget panel */}
              <div className="absolute bottom-8 left-8 w-56 rounded-2xl border border-border bg-card p-4 shadow-sm shadow-black/5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">Processing</span>
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    Active
                  </span>
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="flex-1 rounded-lg bg-muted p-2">
                    <div className="text-lg font-semibold text-foreground">24</div>
                    <div className="text-[10px] text-muted-foreground">Files</div>
                  </div>
                  <div className="flex-1 rounded-lg bg-primary/10 p-2">
                    <div className="text-lg font-semibold text-primary">89%</div>
                    <div className="text-[10px] text-muted-foreground">Complete</div>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-[89%] rounded-full bg-primary" />
                </div>
              </div>

              {/* Classification tags floating element */}
              <div className="absolute right-12 bottom-28 flex flex-wrap gap-1.5">
                <span className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
                  invoice
                </span>
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] text-primary shadow-sm">
                  receipt
                </span>
                <span className="rounded-md border border-border bg-card px-2 py-1 text-[10px] text-muted-foreground shadow-sm">
                  report
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
