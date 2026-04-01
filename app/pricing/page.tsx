"use client"

import { useState, useEffect } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Check, CheckCircle, Loader2 } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"

// Creem product IDs — update when adding annual / gift code products
const PRODUCT_IDS: Record<string, string> = {
  "Day Pass":    "prod_4KtNZA5eQ3LZ83nom02qsh",
  "Pro Monthly": "prod_6OwfR90bY2FIET4R8qbaop",
  // "Pro Annual":  "prod_xxx",  // not yet created in Creem
  // "Gift Codes":  "prod_xxx",  // not yet created in Creem
}

async function createCreemCheckout(
  productId: string,
  email: string | null,
  successUrl: string
): Promise<string | null> {
  try {
    const res = await fetch("/api/creem/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, email, success_url: successUrl }),
    })
    const { checkout_url, error } = await res.json()
    if (!checkout_url) { console.error("Creem checkout error:", error); return null }
    return checkout_url
  } catch (err) {
    console.error("createCreemCheckout failed:", err)
    return null
  }
}

interface PricingCardProps {
  name: string
  price: string | null
  annualPrice?: string
  description: string
  features: string[]
  productId: string | null
  isAnnual?: boolean
  highlighted?: boolean
  isSignedIn: boolean
  userEmail: string | null
  activeStatus: string | null
  onRequireAuth: (productId: string) => void
}

function isCardActive(name: string, activeStatus: string | null): boolean {
  if (!activeStatus) return false
  if (name === "Day Pass" && activeStatus === "day_pass") return true
  if (name === "Pro"      && activeStatus === "pro")      return true
  return false
}

function PricingCard({
  name, price, annualPrice, description, features,
  productId, isAnnual, highlighted, isSignedIn, userEmail, activeStatus, onRequireAuth,
}: PricingCardProps) {
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  const displayPrice    = isAnnual && annualPrice ? annualPrice : price
  const active          = isCardActive(name, activeStatus)
  const isPro           = activeStatus === "pro"
  const isDayPass       = activeStatus === "day_pass"
  const isGiftCode      = activeStatus === "gift_code"
  const canUpgradeToPro = (isDayPass || isGiftCode) && name === "Pro"
  const supersededByPro = isPro && name === "Day Pass"

  const handlePaidClick = async () => {
    if (!productId) return
    const returnUrl = `${window.location.origin}/purchase/process`

    if (!isSignedIn) {
      onRequireAuth(productId)
      return
    }

    setCheckoutLoading(true)
    const checkoutUrl = await createCreemCheckout(productId, userEmail, returnUrl)
    setCheckoutLoading(false)
    if (checkoutUrl) window.location.href = checkoutUrl
  }

  const renderButton = () => {
    if (name === "Free") {
      return isSignedIn ? null : (
        <Link href="/tools/smart-storage">
          <Button className="mt-8 w-full rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80" size="lg">
            Get Started
          </Button>
        </Link>
      )
    }

    if (name === "Gift Codes") {
      return (
        <Button className="mt-8 w-full rounded-xl bg-secondary text-secondary-foreground" size="lg" disabled>
          Coming Soon
        </Button>
      )
    }

    if (active) {
      return (
        <Link href="/tools/smart-storage">
          <Button className="mt-8 w-full rounded-xl" size="lg">
            Go to Smart Storage
          </Button>
        </Link>
      )
    }

    if (canUpgradeToPro) {
      return (
        <Button
          className="mt-8 w-full rounded-xl"
          size="lg"
          disabled={checkoutLoading || !productId}
          onClick={handlePaidClick}
        >
          {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Upgrade to Pro"}
        </Button>
      )
    }

    if (supersededByPro) {
      return (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Included in your Pro plan
        </p>
      )
    }

    if (!productId) {
      return (
        <Button className="mt-8 w-full rounded-xl bg-secondary text-secondary-foreground" size="lg" disabled>
          Coming Soon
        </Button>
      )
    }

    return (
      <Button
        className={`mt-8 w-full rounded-xl ${highlighted ? "" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
        size="lg"
        disabled={checkoutLoading}
        onClick={handlePaidClick}
      >
        {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Get Started"}
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
          {name === "Day Pass"   && <span className="ml-1 text-muted-foreground">/ day</span>}
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
  const [isAnnual,         setIsAnnual]         = useState(false)
  const [isSignedIn,       setIsSignedIn]       = useState(false)
  const [userEmail,        setUserEmail]        = useState<string | null>(null)
  const [activeStatus,     setActiveStatus]     = useState<string | null>(null)
  const [pendingProductId, setPendingProductId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setIsSignedIn(!!data.session)
      const email = data.session?.user?.email ?? null
      setUserEmail(email)
      if (email) await fetchSubscription(email)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setIsSignedIn(!!s)
      const email = s?.user?.email ?? null
      setUserEmail(email)
      if (email) await fetchSubscription(email)
      else setActiveStatus(null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const fetchSubscription = async (email: string) => {
    const { data } = await supabase
      .from("subscriptions")
      .select("status, current_period_end")
      .eq("email", email)
      .single()
    if (!data) return
    if (data.status === "day_pass" && data.current_period_end) {
      const expired = new Date(data.current_period_end) < new Date()
      setActiveStatus(expired ? null : "day_pass")
    } else {
      setActiveStatus(["pro", "gift_code"].includes(data.status) ? data.status : null)
    }
  }

  const handleRequireAuth = (productId: string) => setPendingProductId(productId)

  const handleAuthSuccess = async () => {
    const productId = pendingProductId
    setPendingProductId(null)
    if (!productId) return

    const { data } = await supabase.auth.getSession()
    const email = data.session?.user?.email ?? null
    const returnUrl = `${window.location.origin}/purchase/process`
    const checkoutUrl = await createCreemCheckout(productId, email, returnUrl)
    if (checkoutUrl) window.location.href = checkoutUrl
  }

  const getProductId = (planName: string): string | null => {
    if (planName === "Pro") {
      return isAnnual
        ? (PRODUCT_IDS["Pro Annual"] ?? PRODUCT_IDS["Pro Monthly"] ?? null)
        : (PRODUCT_IDS["Pro Monthly"] ?? null)
    }
    return PRODUCT_IDS[planName] ?? null
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <AuthGuardModal isVisible={!!pendingProductId} onSuccess={handleAuthSuccess} />
      <main className="flex-1 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Simple, transparent pricing
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
                productId={getProductId(plan.name)}
                isAnnual={isAnnual}
                isSignedIn={isSignedIn}
                userEmail={userEmail}
                activeStatus={activeStatus}
                onRequireAuth={handleRequireAuth}
              />
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
