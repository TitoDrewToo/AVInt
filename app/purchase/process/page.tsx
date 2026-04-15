"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"
import { supabase } from "@/lib/supabase"
import { FadeUp, PopIn } from "@/components/fade-up"

// Creem redirects here after successful payment.
// Creem may append ?checkout_id=, ?order_id=, or similar params to the success URL.
// We accept any of these to verify the user came from a real checkout, then poll
// the DB until the webhook has updated the subscription, then route to success.
// If no recognized param → user landed here manually → send to cancel.

function ProcessContent() {
  const router = useRouter()
  const params = useSearchParams()
  // Creem appends checkout_id; fall back to order_id for legacy compatibility
  const checkoutParam = params.get("checkout_id") ?? params.get("order_id") ?? params.get("subscription_id")
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    if (!checkoutParam) {
      // No recognized param — user navigated here manually
      router.replace("/purchase/cancel")
      return
    }

    // Poll subscription status — webhook usually fires within 2–5s of redirect
    let attempts = 0
    const MAX_ATTEMPTS = 8
    const INTERVAL_MS = 2000

    const poll = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const email = session?.user?.email
      if (!email) {
        // Not signed in — still show success (webhook will update when they sign in)
        router.replace("/purchase/success?type=subscription")
        return
      }

      const { data } = await supabase
        .from("subscriptions")
        .select("status, plan, current_period_end")
        .eq("email", email)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      // Webhook has fired — subscription is active
      if (data && ["pro", "day_pass", "gift_code"].includes(data.status)) {
        const type = data.status === "gift_code" ? "gift" : "subscription"
        router.replace(`/purchase/success?type=${type}`)
        return
      }

      // Also check if a gift code was just created for this email
      const { data: giftCodes } = await supabase
        .from("gift_codes")
        .select("id")
        .eq("purchased_by_email", email)
        .gte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
        .limit(1)

      if (giftCodes && giftCodes.length > 0) {
        router.replace("/purchase/success?type=gift")
        return
      }

      attempts++
      if (attempts >= MAX_ATTEMPTS) {
        // Webhook delayed — proceed to success anyway, it will resolve async
        router.replace("/purchase/success?type=subscription")
        return
      }

      setTimeout(poll, INTERVAL_MS)
    }

    // Small initial delay to give the webhook a head start
    setTimeout(poll, 1500)
  }, [checkoutParam, router])

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card/90 p-10 text-center shadow-sm">
            <PopIn>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <ProcessingIndicator active={true} />
              </div>
            </PopIn>
            <FadeUp delay={0.08}>
              <h1 className="mt-6 text-2xl font-semibold text-foreground">Confirming your purchase…</h1>
            </FadeUp>
            <FadeUp delay={0.14}>
              <p className="mt-2 text-sm text-muted-foreground">
                We&apos;re checking for the payment confirmation and updating your access.
              </p>
            </FadeUp>
            <FadeUp delay={0.2}>
              <div className="mt-8 overflow-hidden rounded-full border border-border/70 bg-muted/40">
                <div className="h-2 w-full origin-left animate-pulse bg-primary/70" />
              </div>
            </FadeUp>
            <FadeUp delay={0.26}>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground/80">
                Secure handoff from Creem to AVIntelligence
              </p>
            </FadeUp>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default function PurchaseProcessPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex flex-1 items-center justify-center px-6">
          <div className="rounded-2xl border border-border bg-card/90 p-10 shadow-sm">
            <ProcessingIndicator active={true} />
          </div>
        </main>
        <Footer />
      </div>
    }>
      <ProcessContent />
    </Suspense>
  )
}
