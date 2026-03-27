"use client"

import { useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Check, Minus, Plus } from "lucide-react"
import Link from "next/link"

interface PlanCardProps {
  name: string
  price: string | null
  suffix?: string
  description: string
  features: string[]
  highlighted?: boolean
  annualPrice?: string
  isAnnual?: boolean
}

function PlanCard({ name, price, suffix, description, features, highlighted, annualPrice, isAnnual }: PlanCardProps) {
  const displayPrice = isAnnual && annualPrice ? annualPrice : price

  return (
    <div className={`flex flex-col rounded-2xl border p-8 ${highlighted ? "border-primary bg-card shadow-lg" : "border-border bg-card"}`}>
      <h3 className="text-xl font-semibold text-foreground">{name}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 flex items-end gap-1">
        {displayPrice === null ? (
          <span className="text-4xl font-semibold text-foreground">Free</span>
        ) : (
          <>
            <span className="text-4xl font-semibold text-foreground">{displayPrice}</span>
            {suffix && <span className="mb-1 text-muted-foreground">{suffix}</span>}
            {name === "Pro" && isAnnual && (
              <span className="mb-1 ml-2 text-sm font-medium text-primary">30% off</span>
            )}
          </>
        )}
      </div>
      <ul className="mt-8 flex-1 space-y-4">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span className="text-muted-foreground">{f}</span>
          </li>
        ))}
      </ul>
      <Link href="/purchase/checkout">
        <Button
          size="lg"
          className={`mt-8 w-full rounded-xl ${!highlighted ? "bg-secondary text-secondary-foreground hover:bg-secondary/80" : ""}`}
        >
          {displayPrice === null ? "Get Started" : "Purchase"}
        </Button>
      </Link>
    </div>
  )
}

function GiftCodeCard() {
  const [quantity, setQuantity] = useState(1)

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-8">
      <h3 className="text-xl font-semibold text-foreground">Gift Codes</h3>
      <p className="mt-2 text-sm text-muted-foreground">Purchase access for others</p>
      <div className="mt-6 flex items-end gap-1">
        <span className="text-4xl font-semibold text-foreground">$6</span>
        <span className="mb-1 text-muted-foreground">/ code</span>
      </div>
      <ul className="mt-8 flex-1 space-y-4">
        {["24 hour access", "All available reports", "Full structured outputs", "Smart Dashboards", "Custom Dashboards"].map((f) => (
          <li key={f} className="flex items-start gap-3">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span className="text-muted-foreground">{f}</span>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-muted-foreground">
        Gift codes provide 24 hour access to all Smart Storage reports and dashboards.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-sm text-foreground">Quantity</span>
        <div className="flex items-center gap-2 rounded-lg border border-border">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-medium text-foreground">{quantity}</span>
          <button
            onClick={() => setQuantity(Math.min(10, quantity + 1))}
            className="flex h-8 w-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        <span className="text-sm text-muted-foreground">
          Total: <span className="font-medium text-foreground">${quantity * 6}</span>
        </span>
      </div>
      <Link href="/purchase/checkout">
        <Button size="lg" className="mt-6 w-full rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80">
          Generate Codes
        </Button>
      </Link>
    </div>
  )
}

const plans: PlanCardProps[] = [
  {
    name: "Free",
    price: null,
    description: "For individuals getting started",
    features: ["Secure storage", "Document classification", "Basic dashboard access"],
  },
  {
    name: "Day Pass",
    price: "$6",
    suffix: "/ day",
    description: "Full access for 24 hours",
    features: ["24 hour access", "All available reports", "Full structured outputs", "Smart Dashboards", "Custom Dashboards"],
  },
  {
    name: "Pro",
    price: "$12",
    annualPrice: "$100",
    suffix: "/ month",
    description: "For power users and teams",
    features: ["All available reports", "Advanced analytics", "Smart Dashboards", "Custom Dashboards"],
    highlighted: true,
  },
]

export default function PurchasePage() {
  const [isAnnual, setIsAnnual] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Choose your plan
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Select the access level that works for you
            </p>
          </div>

          {/* Toggle */}
          <div className="mt-12 flex items-center justify-center gap-3">
            <span className={`text-sm ${!isAnnual ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative h-6 w-11 rounded-full transition-colors ${isAnnual ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform ${isAnnual ? "translate-x-5" : "translate-x-0"}`} />
            </button>
            <span className={`text-sm ${isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
              Annually <span className="text-xs text-primary">(30% savings)</span>
            </span>
          </div>

          {/* Plan Cards */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.name} {...plan} isAnnual={isAnnual} />
            ))}
          </div>

          {/* Gift Code Card */}
          <div className="mt-8">
            <GiftCodeCard />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}