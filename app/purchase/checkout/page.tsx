"use client"

import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"

export default function CheckoutPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="flex flex-col items-center gap-6 text-center">
          <ProcessingIndicator active={true} />
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Redirecting to secure checkout…
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You will be redirected to our payment processor shortly.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}