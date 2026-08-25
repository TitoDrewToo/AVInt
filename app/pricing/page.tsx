import type { Metadata } from "next"

import { Footer } from "@/components/footer"
import { Navbar } from "@/components/navbar"
import { PricingPreviewSection } from "@/components/sections/pricing-preview"

export const metadata: Metadata = {
  title: "Pricing — AVIntelligence",
  description: "Choose the AVIntelligence plan that fits how much structured data you want to work with.",
  robots: { index: false, follow: false },
}

export default function PricingPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Navbar />
      <main className="relative z-[1] flex-1 overflow-hidden"><PricingPreviewSection /></main>
      <Footer />
    </div>
  )
}
