import type { Metadata } from 'next'
import { Navbar } from "@/components/navbar"

export const metadata: Metadata = {
  title: 'AVIntelligence — AI Powered file storage and reports generator and analytics',
  description: 'Upload receipts, invoices, and payslips. AVIntelligence extracts, categorizes, and analyzes your financial documents automatically. Smart Storage, Smart Dashboard.',
}
import { Footer } from "@/components/footer"
import { HeroSection } from "@/components/sections/hero"
import { WhatWeDoSection } from "@/components/sections/what-we-do"
import { HowItWorksSection } from "@/components/sections/how-it-works"
import { ProductsSection } from "@/components/sections/products"
import { PricingPreviewSection } from "@/components/sections/pricing-preview"
import { HomeInteractiveTrail } from "@/components/home-interactive-trail"
import { HomeDefaultSphere } from "@/components/home-default-sphere"

export default function HomePage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <HomeDefaultSphere className="pointer-events-none fixed inset-0 z-0" />
      <Navbar />
      <main className="relative z-[1] flex-1">
        <HeroSection />
        <WhatWeDoSection />
        <HomeInteractiveTrail>
          <HowItWorksSection />
          <ProductsSection />
          <PricingPreviewSection />
        </HomeInteractiveTrail>
      </main>
      <Footer />
    </div>
  )
}
