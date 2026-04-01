"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
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

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-6">
      <h3 className="text-lg font-semibold text-foreground">{name}</h3>
      {displayPrice && (
        <div className="mt-4 flex items-center">
          <span className="text-3xl font-semibold text-foreground">
            {displayPrice}
          </span>
          {name === "Gift Codes" && (
            <span className="ml-1 text-muted-foreground">/ code</span>
          )}
          {name === "Day Pass" && (
            <span className="ml-1 text-muted-foreground">/ day</span>
          )}
          {name === "Pro" && (
            <>
              <span className="ml-1 text-muted-foreground">
                /{isAnnual ? "year" : "month"}
              </span>
              {isAnnual && (
                <span className="ml-2 text-sm font-medium text-primary">
                  30% off
                </span>
              )}
            </>
          )}
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
    </div>
  )
}

const plans: PricingCardProps[] = [
  {
    name: "Gift Codes",
    price: "$6",
    features: [
      "Smart Storage",
      "Smart Dashboards",
    ],
  },
  {
    name: "Free",
    price: null,
    features: ["Secure Storage", "Basic dashboard access"],
  },
  {
    name: "Day Pass",
    price: "$6",
    features: [
      "Smart Storage",
      "Smart Dashboards",
    ],
  },
  {
    name: "Pro",
    price: "$12",
    annualPrice: "$100",
    features: ["Smart Storage", "Smart Dashboards"],
  },
]

export function PricingPreviewSection() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <section className="border-t border-border bg-muted/30 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <FadeUp>
          <h2 className="text-center text-sm font-medium uppercase tracking-wider text-primary">
            Pricing
          </h2>
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

        <FadeUp delay={0.1} className="mt-12 text-center">
          <Link href="/pricing">
            <Button variant="outline" className="rounded-xl">
              View Pricing
            </Button>
          </Link>
        </FadeUp>
      </div>
    </section>
  )
}
