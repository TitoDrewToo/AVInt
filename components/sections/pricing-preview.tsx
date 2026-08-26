"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Check } from "lucide-react"
import { FadeUp, StaggerContainer, StaggerItem } from "@/components/fade-up"

interface PricingCardProps {
  name: string
  price: string | null
  annualPrice?: string
  features: string[]
  isAnnual?: boolean
}

function PricingCard({ name, price, annualPrice, features, isAnnual }: PricingCardProps) {
  const displayPrice = isAnnual && annualPrice ? annualPrice : price
  const href = name === "Free"
    ? "/tools/smart-storage"
    : `/purchase/checkout?plan=${name === "Pro" ? (isAnnual ? "pro-annual" : "pro-monthly") : name === "Day Pass" ? "day-pass" : "gift-codes"}`

  return (
    <Link href={href} target={name === "Free" ? "_blank" : undefined} rel={name === "Free" ? "noopener noreferrer" : undefined} className="group block h-full">
      <div className="glass-surface hover-bloom flex h-full flex-col rounded-2xl p-6 transition-all group-hover:border-primary/20 group-hover:[box-shadow:0_0_30px_-14px_var(--retro-glow-red)]">
        <h3 className={name === "Free" ? "text-2xl font-semibold uppercase tracking-[0.18em] text-foreground" : "text-lg font-semibold text-foreground"}>{name}</h3>
        {displayPrice && (
          <div className="mt-4 flex items-center">
            <span className="text-3xl font-semibold text-foreground">{displayPrice}</span>
            {name === "Gift Codes" && <span className="ml-1 text-muted-foreground">/ code</span>}
            {name === "Day Pass" && <span className="ml-1 text-muted-foreground">/ day</span>}
            {name === "Pro" && <span className="ml-1 text-muted-foreground">/{isAnnual ? "year" : "month"}</span>}
            {isAnnual && annualPrice && <span className="ml-2 text-sm font-medium text-primary">30% off</span>}
          </div>
        )}
        <ul className="mt-6 flex-1 space-y-3">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm text-muted-foreground">{feature}</span>
            </li>
          ))}
        </ul>
        <span className="cw-button-flow mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-all group-hover:bg-primary/90">
          {name === "Free" ? "Start free" : name === "Gift Codes" ? "Generate codes" : "Purchase"}
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  )
}

const plans: PricingCardProps[] = [
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
  {
    name: "Gift Codes",
    price: "$6",
    features: ["Share a focused reporting session", "Smart Storage and dashboards", "A simple way to give someone a starting point"],
  },
]

export function PricingPreviewSection() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <section className="marketing-scroll-section marketing-scroll-section-final relative px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
      <div className="relative mx-auto max-w-6xl">
        <FadeUp>
          <p className="text-center text-sm font-medium uppercase tracking-wider text-primary">Access that scales with your workflow</p>
          <h2 className="mt-4 text-center text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">Start with your data. Go further when you need to.</h2>
          <p className="mx-auto mt-5 max-w-2xl text-center text-base leading-relaxed text-muted-foreground">Every plan starts with the same path: upload files, create structured records, and see what your data can support. Upgrade when you need more volume or deeper workspace tools.</p>
        </FadeUp>

        {/* Toggle */}
        <FadeUp delay={0.08}>
          <div className="mt-8 flex items-center justify-center gap-3">
            <span
              className={`text-sm ${
                !isAnnual ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className="relative h-6 w-11 rounded-full bg-primary transition-colors"
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  isAnnual ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <span
              className={`text-sm ${
                isAnnual ? "font-medium text-foreground" : "text-muted-foreground"
              }`}
            >
              Annually
              <span className="ml-1 text-xs text-primary">(30% savings)</span>
            </span>
          </div>
        </FadeUp>

        <StaggerContainer className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <StaggerItem key={plan.name}>
              <PricingCard {...plan} isAnnual={isAnnual} />
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  )
}
