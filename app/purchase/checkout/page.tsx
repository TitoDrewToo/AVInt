"use client"

import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"
import { ShieldCheck } from "lucide-react"

// Placeholder plan summary — will be driven by query params or session state later
const planSummary = {
  name: "Pro Subscription",
  price: "$12/month",
}

export default function CheckoutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card p-10 shadow-sm">

            {/* Processing indicator + title */}
            <div className="flex flex-col items-center text-center">
              <ProcessingIndicator active={true} />
              <h1 className="mt-6 text-2xl font-semibold text-foreground">
                Redirecting to secure checkout
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                You will complete your purchase securely via our payment partner.
              </p>
            </div>

            {/* Plan summary */}
            <div className="mt-8 rounded-xl border border-border bg-muted/30 p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Order summary
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{planSummary.name}</span>
                <span className="text-sm font-semibold text-foreground">{planSummary.price}</span>
              </div>
            </div>

            {/* Secure payment note */}
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span>Secure payment powered by Creem.</span>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
