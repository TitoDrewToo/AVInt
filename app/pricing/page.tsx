"use client"

import { useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"

interface PricingCardProps {
  name: string
  price: string | null
  annualPrice?: string
  description: string
  features: string[]
  isAnnual?: boolean
  highlighted?: boolean
}

function PricingCard({
  name,
  price,
  annualPrice,
  description,
  features,
  isAnnual,
  highlighted,
}: PricingCardProps) {
  const displayPrice = isAnnual && annualPrice ? annualPrice : price

  return (
    <div
      className={`flex flex-col rounded-2xl border p-8 ${
        highlighted
          ? "border-primary bg-card shadow-lg"
          : "border-border bg-card"
      }`}
    >
      <h3 className="text-xl font-semibold text-foreground">{name}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {displayPrice !== null && (
        <div className="mt-6 flex items-center">
          <span className="text-4xl font-semibold text-foreground">
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
      {displayPrice === null && (
        <div className="mt-6">
          <span className="text-4xl font-semibold text-foreground">Free</span>
        </div>
      )}
      <ul className="mt-8 flex-1 space-y-4">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span className="text-muted-foreground">{feature}</span>
          </li>
        ))}
      </ul>
      <Button
        className={`mt-8 w-full rounded-xl ${
          highlighted ? "" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
        }`}
        size="lg"
      >
        {name === "Gift Codes" ? "Purchase Code" : "Get Started"}
      </Button>
    </div>
  )
}

const plans: PricingCardProps[] = [
  {
    name: "Gift Codes",
    price: "$6",
    description: "Transferable 24-hour access",
    features: [
      "24 hour access",
      "All available reports",
      "Full structured outputs",
      "Smart Dashboards",
      "Custom Dashboards",
    ],
  },
  {
    name: "Free",
    price: null,
    description: "For individuals getting started",
    features: [
      "Secure storage",
      "Document classification",
      "Basic dashboard access",
    ],
  },
  {
    name: "Day Pass",
    price: "$6",
    description: "Full access for 24 hours",
    features: [
      "24 hour access",
      "All available reports",
      "Full structured outputs",
      "Smart Dashboards",
      "Custom Dashboards",
    ],
  },
  {
    name: "Pro",
    price: "$12",
    annualPrice: "$100",
    description: "For power users and teams",
    features: [
      "All available reports",
      "Advanced analytics",
      "Smart Dashboards",
      "Custom Dashboards",
    ],
    highlighted: true,
  },
]

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          {/* Header */}
          <div className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Simple, transparent pricing
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Choose the plan that works best for you
            </p>
          </div>

          {/* Toggle */}
          <div className="mt-12 flex items-center justify-center gap-3">
            <span
              className={`text-sm ${
                !isAnnual ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              Monthly
            </span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                isAnnual ? "bg-primary" : "bg-muted"
              }`}
            >
              <span
                className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform ${
                  isAnnual ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
            <span
              className={`text-sm ${
                isAnnual ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              Annually
              <span className="ml-1 text-xs text-primary">(30% savings)</span>
            </span>
          </div>

          {/* Cards */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <PricingCard key={plan.name} {...plan} isAnnual={isAnnual} />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
