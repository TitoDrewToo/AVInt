"use client"

import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"

// Reserved route — future LemonSqueezy return handler
// This page will handle post-checkout redirects from LemonSqueezy
// and route users to /purchase/success or /purchase/cancel accordingly
// Do not add UI content here — this is a processing transition only

export default function PurchasePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="flex flex-col items-center gap-4 text-center">
          <ProcessingIndicator active={true} />
          <p className="text-sm text-muted-foreground">Processing purchase…</p>
        </div>
      </main>
      <Footer />
    </div>
  )
}