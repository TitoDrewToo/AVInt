"use client"

import { useEffect, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"
import { supabase } from "@/lib/supabase"

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
        <div className="flex flex-col items-center gap-4 text-center">
          <ProcessingIndicator active={true} />
          <p className="text-sm font-medium text-foreground">Confirming your purchase…</p>
          <p className="text-xs text-muted-foreground">This takes just a moment</p>
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
        <main className="flex flex-1 items-center justify-center">
          <ProcessingIndicator active={true} />
        </main>
        <Footer />
      </div>
    }>
      <ProcessContent />
    </Suspense>
  )
}
