"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { ArrowUpRight, CheckCircle2, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react"
import { motion } from "framer-motion"
import { supabase } from "@/lib/supabase"
import { CREEM_PRODUCTS, type CreemPlan } from "@/lib/creem-products"

const STAGES = [
  { eyebrow: "Session", title: "Preparing your secure handoff", body: "Preserving your plan and return path before leaving AVIntelligence.", icon: ShieldCheck },
  { eyebrow: "Order", title: "Building your checkout payload", body: "Packaging the selected plan for Creem securely on the server.", icon: CreditCard },
  { eyebrow: "Redirect", title: "Opening Creem secure checkout", body: "Your browser is moving to the external payment flow.", icon: ArrowUpRight },
] as const
const PLAN_DETAILS: Record<CreemPlan, { name: string; price: string; cadence: string }> = {
  "pro-monthly": { name: "Pro Subscription", price: "$12", cadence: "monthly" },
  "pro-annual": { name: "Pro Subscription", price: "$100", cadence: "annual" },
  "day-pass": { name: "Day Pass Access", price: "$6", cadence: "24 hours" },
  "gift-codes": { name: "Gift Code Bundle", price: "$6", cadence: "per code" },
}

export function PurchaseHandoff() {
  const params = useSearchParams()
  const requestedPlan = params.get("plan") as CreemPlan | null
  const plan: CreemPlan = requestedPlan && requestedPlan in CREEM_PRODUCTS ? requestedPlan : "pro-monthly"
  const selected = useMemo(() => PLAN_DETAILS[plan], [plan])
  const [activeStage, setActiveStage] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const timers = STAGES.map((_, index) => window.setTimeout(() => setActiveStage(index), index * 1250))
    const redirectTimer = window.setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch("/api/creem/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, email: session?.user?.email ?? undefined }),
        })
        const data = await response.json()
        if (!response.ok || typeof data.checkout_url !== "string") throw new Error(data.error ?? "Checkout could not be prepared")
        window.location.assign(data.checkout_url)
      } catch (checkoutError) {
        setError(checkoutError instanceof Error ? checkoutError.message : "Checkout could not be prepared")
      }
    }, 3100)
    return () => { timers.forEach((timer) => window.clearTimeout(timer)); window.clearTimeout(redirectTimer) }
  }, [plan])

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-border/60 bg-card/90 p-5 shadow-2xl md:p-7">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_80%_0%,color-mix(in_oklab,var(--retro-glow-red)_20%,transparent),transparent_68%)]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-medium uppercase tracking-[0.24em] text-primary/80">AVIntelligence</p><h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Redirecting to secure checkout</h1></div><div className="cw-button-flow glass-surface-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-primary"><LockKeyhole className="h-5 w-5" /></div></div>
            <div className="mt-6 rounded-[1.5rem] border border-border/60 bg-background/55 p-4 backdrop-blur-md"><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Order summary</p><div className="mt-3 flex items-center justify-between gap-4"><div><p className="text-base font-semibold text-foreground">{selected.name}</p><p className="mt-1 text-sm text-muted-foreground">{selected.price} / {selected.cadence}</p></div><span className="rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">Creem</span></div><div className="mt-5 overflow-hidden rounded-full border border-border/70 bg-muted/35"><motion.div className="h-2 rounded-full bg-primary" animate={{ width: `${((activeStage + 1) / STAGES.length) * 100}%` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} /></div></div>
            <div className="mt-5 space-y-3">{STAGES.map((stage, index) => { const Icon = stage.icon; const isActive = index === activeStage; const isDone = index < activeStage; return <motion.div key={stage.eyebrow} animate={{ opacity: isActive || isDone ? 1 : 0.48, y: 0, scale: isActive ? 1.01 : 1 }} initial={{ opacity: 0.45, y: 8 }} className={`rounded-[1.25rem] border p-4 ${isActive ? "border-primary/30 bg-primary/6" : "border-border/60 bg-background/30"}`}><div className="flex items-start gap-3"><div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${isDone || isActive ? "bg-primary/12 text-primary" : "bg-muted text-muted-foreground"}`}>{isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}</div><div><p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{stage.eyebrow}</p><p className="mt-1 text-sm font-medium text-foreground">{stage.title}</p><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{stage.body}</p></div></div></motion.div> })}</div>
            {error ? <p role="alert" className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : <p className="mt-5 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Secure handoff to Creem</p>}
          </div>
        </div>
      </main>
    </div>
  )
}
