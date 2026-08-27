"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { Session } from "@supabase/supabase-js"
import { ArrowUpRight, Check } from "lucide-react"
import { motion } from "framer-motion"
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/fade-up"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"

interface PricingCardProps {
  name: string
  price: string | null
  annualPrice?: string
  features: string[]
  isAnnual?: boolean
  hasActiveAccess?: boolean
  entitlementLoading?: boolean
}

function PricingCard({ name, price, annualPrice, features, isAnnual, hasActiveAccess, entitlementLoading }: PricingCardProps) {
  const displayPrice = isAnnual && annualPrice ? annualPrice : price
  const launchInstead = Boolean(hasActiveAccess)
  const annualPro = name === "Pro" && isAnnual
  const href = launchInstead || name === "Free"
    ? "/tools/smart-storage"
    : `/purchase/checkout?plan=${name === "Pro" ? (isAnnual ? "pro-annual" : "pro-monthly") : name === "Day Pass" ? "day-pass" : "gift-codes"}`

  return (
    <Link href={href} target={launchInstead || name === "Free" ? "_blank" : undefined} rel={launchInstead || name === "Free" ? "noopener noreferrer" : undefined} className="group block h-full">
      <motion.div
        animate={annualPro ? {
          borderColor: ["color-mix(in oklab, var(--primary) 32%, var(--border))", "var(--primary)", "color-mix(in oklab, var(--primary) 32%, var(--border))"],
          boxShadow: ["0 0 0 0 transparent", "0 0 28px -8px var(--retro-glow-red)", "0 0 0 0 transparent"],
        } : {
          borderColor: "color-mix(in oklab, var(--border) 60%, transparent)",
          boxShadow: "0 0 0 0 transparent",
        }}
        transition={annualPro ? { duration: 1.1, ease: "easeInOut", repeat: 1 } : { duration: 0.35, ease: "easeOut" }}
        className={`glass-surface hover-bloom relative flex h-full min-h-[26rem] flex-col overflow-hidden rounded-2xl border p-6 transition-all group-hover:border-primary/20 group-hover:[box-shadow:0_0_30px_-14px_var(--retro-glow-red)] ${annualPro ? "border-primary/50 bg-primary/[0.035]" : "border-border/60"}`}
      >
        {annualPro && <motion.div initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ duration: 0.35, ease: "easeOut" }} className="pointer-events-none absolute inset-x-0 top-0 h-px origin-left bg-primary shadow-[0_0_18px_2px_var(--retro-glow-red)]" aria-hidden />}
        {annualPro && <motion.span initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="absolute right-5 top-0 rounded-b-md bg-primary px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-foreground shadow-[0_0_16px_-4px_var(--retro-glow-red)]">30% off</motion.span>}
        <h3 className={name === "Free" ? "text-2xl font-semibold uppercase tracking-[0.18em] text-foreground" : "text-lg font-semibold text-foreground"}>{name}</h3>
        {displayPrice && (
          <motion.div layout key={`${displayPrice}-${isAnnual}`} initial={{ opacity: 0.55, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }} className="mt-4 flex min-h-11 items-center">
            <span className="text-3xl font-semibold text-foreground">{displayPrice}</span>
            {name === "Gift Codes" && <span className="ml-1 text-muted-foreground">/ code</span>}
            {name === "Day Pass" && <span className="ml-1 text-muted-foreground">/ day</span>}
            {name === "Pro" && <span className="ml-1 text-muted-foreground">/{isAnnual ? "year" : "month"}</span>}
          </motion.div>
        )}
        <ul className="mt-6 flex-1 space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
        <motion.span
          animate={annualPro ? { scale: [1, 1.025, 1], boxShadow: ["0 0 0 0 transparent", "0 0 22px -6px var(--retro-glow-red)", "0 0 0 0 transparent"] } : { scale: 1, boxShadow: "0 0 0 0 transparent" }}
          transition={annualPro ? { duration: 0.85, ease: "easeOut" } : { duration: 0.25, ease: "easeOut" }}
          whileTap={{ scale: 0.98 }}
          className={`cw-button-flow mt-7 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all group-hover:bg-primary/90 ${annualPro ? "bg-primary text-primary-foreground" : "bg-primary text-primary-foreground"}`}
        >
          {entitlementLoading ? "Checking access…" : launchInstead ? "Launch Smart Storage" : name === "Free" ? "Start free" : name === "Gift Codes" ? "Generate codes" : "Purchase"}
          <ArrowUpRight className="h-4 w-4" />
        </motion.span>
      </motion.div>
    </Link>
  )
}

const plans: PricingCardProps[] = [
  {
    name: "Gift Codes",
    price: "$6",
    features: ["Share a focused reporting session", "Smart Storage and dashboards", "A simple way to give someone a starting point"],
  },
  {
    name: "Free",
    price: null,
    features: ["10 documents / month", "Smart Storage and classification", "Basic dashboard", "1 report export / month"],
  },
  {
    name: "Day Pass",
    price: "$6",
    features: ["50 documents", "All report and structured outputs", "Advanced Analytics", "QuickBooks and Xero exports"],
  },
  {
    name: "Pro",
    price: "$12",
    annualPrice: "$100",
    features: ["500 documents / month", "Advanced Analytics and custom dashboards", "Recurring-expense detection", "QuickBooks and Xero exports", "Claude connector and priority processing"],
  },
]

function BillingToggle({ isAnnual, onToggle, className = "" }: { isAnnual: boolean; onToggle: () => void; className?: string }) {
  return <div className={`flex items-center justify-center gap-3 ${className}`}>
    <span className={`text-sm ${!isAnnual ? "font-medium text-foreground" : "text-muted-foreground"}`}>Monthly</span>
    <button type="button" onClick={onToggle} aria-pressed={isAnnual} aria-label="Switch between monthly and annual pricing" className="group relative h-11 w-14 shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background">
      <span aria-hidden className="absolute left-1/2 top-1/2 h-6 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/35 bg-primary/10 transition-colors group-hover:border-primary/60 group-hover:bg-primary/15" />
      <span aria-hidden className={`absolute left-1/2 top-1/2 block h-4 w-4 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_10px_-3px_var(--retro-glow-red)] transition-transform duration-300 ${isAnnual ? "translate-x-[5px]" : "-translate-x-[19px]"}`} />
    </button>
    <span className={`text-sm ${isAnnual ? "font-medium text-foreground" : "text-muted-foreground"}`}>Annually<span className="ml-1 text-xs text-primary">(30% savings)</span></span>
  </div>
}

export function PricingPreviewSection() {
  const [isAnnual, setIsAnnual] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const entitlement = useEntitlement(session)

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session)
    }).catch(() => {
      if (active) setSession(null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <section className="marketing-scroll-section marketing-scroll-section-final relative px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
      <div className="relative mx-auto max-w-6xl">
        <FadeUp>
          <p className="text-center text-sm font-medium uppercase tracking-wider text-primary">Access that scales with your workflow</p>
          <h2 className="mt-4 text-center text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">Start with your data. Go further when you need to.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-relaxed text-muted-foreground">Every plan starts with the same path: upload files, create structured records, and see what your data can support. Upgrade when you need more volume or deeper workspace tools.</p>
        </FadeUp>

        <FadeUp delay={0.08}>
          <BillingToggle isAnnual={isAnnual} onToggle={() => setIsAnnual((value) => !value)} className="mt-8 sm:flex" />
        </FadeUp>

        <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.slice(0, 3).map((plan) => <StaggerItem key={plan.name}><PricingCard {...plan} isAnnual={isAnnual} hasActiveAccess={entitlement.isActive} entitlementLoading={entitlement.loading} /></StaggerItem>)}
          <FadeUp delay={0.08} className="col-span-full sm:hidden"><BillingToggle isAnnual={isAnnual} onToggle={() => setIsAnnual((value) => !value)} className="py-2" /></FadeUp>
          <StaggerItem><PricingCard {...plans[3]} isAnnual={isAnnual} hasActiveAccess={entitlement.isActive} entitlementLoading={entitlement.loading} /></StaggerItem>
        </StaggerContainer>
      </div>
    </section>
  )
}
