"use client"

import { useState, useEffect } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Check, CheckCircle, ShieldCheck, X } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { computeEntitlement } from "@/lib/subscription"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"

const CHECKOUT_URLS: Record<string, string> = {
  "Day Pass": "https://www.creem.io/payment/prod_RBLECFWVb9ObYTbyzHqRN",
  "Gift Codes": "https://www.creem.io/payment/prod_1E1svEziUd9azxQBFJ0OGE",
  "Pro Monthly": "https://www.creem.io/payment/prod_6L974BwObN2XQwqi9qxnGF",
  "Pro Annual": "https://www.creem.io/payment/prod_5hA2fqm9pKV27X9XurBwQs",
}

interface PricingCardProps {
  name: string
  price: string | null
  annualPrice?: string
  description: string
  features: string[]
  isAnnual?: boolean
  highlighted?: boolean
  isSignedIn: boolean
  activeStatus: string | null
  onRequireAuth: (checkoutUrl: string) => void
  onRedirect: (checkoutUrl: string) => void
}

function CheckoutRedirectModal({
  isVisible,
  onClose,
}: {
  isVisible: boolean
  onClose: () => void
}) {
  useEffect(() => {
    if (!isVisible) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [isVisible, onClose])

  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 font-sans">
      <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" onClick={onClose} />
      <div className="glass-surface relative z-10 my-auto w-full max-w-sm overflow-hidden rounded-2xl p-8 shadow-xl">
        <button
          onClick={onClose}
          aria-label="Close"
          className="cw-button-flow glass-surface-sm absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-primary hover:[box-shadow:0_0_20px_-4px_var(--retro-glow-red)]"
        >
          <X className="h-4 w-4" />
        </button>
        <div aria-hidden className="retro-grid-bg pointer-events-none absolute inset-0 opacity-40" />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, var(--retro-glow-red) 0%, transparent 65%)",
            filter: "blur(40px)",
            opacity: 0.5,
          }}
        />

        <div className="relative text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ProcessingIndicator active={true} />
          </div>
          <h2 className="mt-6 text-xl font-semibold text-foreground">Redirecting to creem.io</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Opening secure checkout for your purchase. You&apos;ll complete payment on Creem.
          </p>
        </div>

        <div className="relative mt-8 rounded-xl border border-border bg-muted/25 p-5">
          <div className="overflow-hidden rounded-full border border-border/70 bg-muted/40">
            <div className="h-2 w-full origin-left animate-pulse bg-primary/70" />
          </div>
          <div className="mt-4 flex items-center justify-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground/85">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
            Secure handoff from pricing to Creem
          </div>
        </div>
      </div>
    </div>
  )
}

function isCardActive(name: string, activeStatus: string | null): boolean {
  if (!activeStatus) return false
  if (name === "Day Pass" && activeStatus === "day_pass") return true
  if (name === "Pro" && activeStatus === "pro") return true
  if (name === "Gift Codes" && activeStatus === "gift_code") return true
  return false
}

function PricingCard({
  name, price, annualPrice, description, features,
  isAnnual, highlighted, isSignedIn, activeStatus, onRequireAuth, onRedirect,
}: PricingCardProps) {
  const displayPrice = isAnnual && annualPrice ? annualPrice : price
  const checkoutUrl = name === "Pro"
    ? (isAnnual ? CHECKOUT_URLS["Pro Annual"] : CHECKOUT_URLS["Pro Monthly"])
    : CHECKOUT_URLS[name] ?? "#"

  // Is this card the user's current active plan?
  const active = isCardActive(name, activeStatus) && name !== "Gift Codes"

  // Does the user have a higher/equal plan that makes this card irrelevant?
  const isPro = activeStatus === "pro"
  const isDayPass = activeStatus === "day_pass"
  const isGiftCode = activeStatus === "gift_code"

  // Day pass or gift code users can upgrade to Pro
  const canUpgradeToPro = (isDayPass || isGiftCode) && name === "Pro"
  // Pro users shouldn't see a Day Pass button — they already have more
  const supersededByPro = isPro && name === "Day Pass"

  const handlePaidClick = () => {
    if (!isSignedIn) {
      onRequireAuth(checkoutUrl)
    } else {
      onRedirect(checkoutUrl)
    }
  }

  const renderButton = () => {
    // Free card
    if (name === "Free") {
      return isSignedIn ? null : (
        <Link href="/tools/smart-storage">
          <Button className="mt-8 w-full rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80" size="lg">
            Get Started
          </Button>
        </Link>
      )
    }

    // Gift Codes — always purchasable (buying for someone else)
    if (name === "Gift Codes") {
      return (
        <Button
          className="mt-8 w-full rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80"
          size="lg"
          onClick={handlePaidClick}
        >
          Purchase Code
        </Button>
      )
    }

    // This card is the user's active plan
    if (active) {
      return (
        <Link href="/tools/smart-storage">
          <Button className="mt-8 w-full rounded-xl" size="lg">
            Go to Smart Storage
          </Button>
        </Link>
      )
    }

    // Pro card — day pass or gift code user can upgrade immediately
    if (canUpgradeToPro) {
      return (
        <Button
          className="mt-8 w-full rounded-xl"
          size="lg"
          onClick={handlePaidClick}
        >
          Upgrade to Pro
        </Button>
      )
    }

    // Day Pass card — pro user already has full access, no action needed
    if (supersededByPro) {
      return (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Included in your Pro plan
        </p>
      )
    }

    // Default — not signed in or no active sub
    return (
      <Button
        className={`mt-8 w-full rounded-xl ${highlighted ? "" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
        size="lg"
        onClick={handlePaidClick}
      >
        Get Started
      </Button>
    )
  }

  return (
    <div className={`relative flex flex-col rounded-2xl border p-8 transition-all ${
      active
        ? "border-primary bg-card shadow-lg ring-1 ring-primary/30"
        : highlighted
        ? "border-primary bg-card shadow-lg"
        : "border-border bg-card"
    }`}>
      {/* Active badge */}
      {active && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            <CheckCircle className="h-3 w-3" />
            Active
          </span>
        </div>
      )}

      <h3 className="text-xl font-semibold text-foreground">{name}</h3>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      {displayPrice !== null && (
        <div className="mt-6 flex items-center">
          <span className="text-4xl font-semibold text-foreground">{displayPrice}</span>
          {name === "Gift Codes" && <span className="ml-1 text-muted-foreground">/ code</span>}
          {name === "Day Pass" && <span className="ml-1 text-muted-foreground">/ day</span>}
          {name === "Pro" && (
            <>
              <span className="ml-1 text-muted-foreground">/{isAnnual ? "year" : "month"}</span>
              {isAnnual && <span className="ml-2 text-sm font-medium text-primary">30% off</span>}
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

      {renderButton()}
    </div>
  )
}

const plans = [
  {
    name: "Gift Codes",
    price: "$6",
    description: "Transferable 24-hour access",
    features: ["Smart Storage", "All available reports", "Full structured outputs", "Advanced Analytics", "Smart Dashboards", "Custom Dashboards"],
  },
  {
    name: "Free",
    price: null,
    description: "For individuals getting started",
    features: ["Secure Storage", "Document classification", "Basic dashboard access"],
  },
  {
    name: "Day Pass",
    price: "$6",
    description: "Full access for 24 hours",
    features: ["Smart Storage", "All available reports", "Full structured outputs", "Advanced Analytics", "Smart Dashboards", "Custom Dashboards"],
  },
  {
    name: "Pro",
    price: "$12",
    annualPrice: "$100",
    description: "For power users and convenience",
    features: ["Smart Storage", "All available reports", "Full structured outputs", "Advanced Analytics", "Smart Dashboards", "Custom Dashboards"],
    highlighted: true,
  },
]

export default function PricingPage() {
  const [isAnnual, setIsAnnual] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [activeStatus, setActiveStatus] = useState<string | null>(null)
  const [pendingCheckoutUrl, setPendingCheckoutUrl] = useState<string | null>(null)
  const [redirectingCheckoutUrl, setRedirectingCheckoutUrl] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setIsSignedIn(!!data.session)
      if (data.session?.user?.email) {
        await fetchSubscription(data.session.user.email)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setIsSignedIn(!!s)
      if (s?.user?.email) {
        await fetchSubscription(s.user.email)
      } else {
        setActiveStatus(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchSubscription = async (email: string) => {
    const { data } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("email", email)
      .maybeSingle()
    const ent = computeEntitlement(data)
    setActiveStatus(ent.isActive ? ent.status : null)
  }

  const handleRequireAuth = (checkoutUrl: string) => setPendingCheckoutUrl(checkoutUrl)

  const handleRedirect = (checkoutUrl: string) => {
    setRedirectingCheckoutUrl(checkoutUrl)
  }

  useEffect(() => {
    if (!redirectingCheckoutUrl) return
    const timeoutId = window.setTimeout(() => {
      window.location.href = redirectingCheckoutUrl
    }, 950)
    return () => window.clearTimeout(timeoutId)
  }, [redirectingCheckoutUrl])

  const handleAuthSuccess = () => {
    const checkoutUrl = pendingCheckoutUrl
    setPendingCheckoutUrl(null)
    if (checkoutUrl) {
      handleRedirect(checkoutUrl)
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <AuthGuardModal
        isVisible={!!pendingCheckoutUrl}
        onSuccess={handleAuthSuccess}
        onClose={() => setPendingCheckoutUrl(null)}
      />
      <CheckoutRedirectModal
        isVisible={!!redirectingCheckoutUrl}
        onClose={() => setRedirectingCheckoutUrl(null)}
      />
      <main className="flex-1 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              So much more, for less.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">Choose the plan that works best for you</p>
          </div>
          <div className="mt-12 flex items-center justify-center gap-3">
            <span className={`text-sm ${!isAnnual ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative h-6 w-11 rounded-full transition-colors ${isAnnual ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-card shadow-sm transition-transform ${isAnnual ? "translate-x-5" : "translate-x-0"}`} />
            </button>
            <span className={`text-sm ${isAnnual ? "text-foreground" : "text-muted-foreground"}`}>
              Annually<span className="ml-1 text-xs text-primary">(30% savings)</span>
            </span>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <PricingCard
                key={plan.name}
                {...plan}
                isAnnual={isAnnual}
                isSignedIn={isSignedIn}
                activeStatus={activeStatus}
                onRequireAuth={handleRequireAuth}
                onRedirect={handleRedirect}
              />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
