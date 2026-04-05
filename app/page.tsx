import type { Metadata } from 'next'
import { Navbar } from "@/components/navbar"

export const metadata: Metadata = {
  title: 'AVIntelligence — AI Powered file storage and reports generator and analytics',
  description: 'Upload receipts, invoices, and payslips. AVIntelligence extracts, categorizes, and analyzes your financial documents automatically. Smart Storage, Smart Dashboard.',
}
import { Footer } from "@/components/footer"
import { HeroSection } from "@/components/sections/hero"
import { WhatWeDoSection } from "@/components/sections/what-we-do"
import { ProductsSection } from "@/components/sections/products"
import { ToolsSection } from "@/components/sections/tools"
import { HowItWorksSection } from "@/components/sections/how-it-works"
import { PricingPreviewSection } from "@/components/sections/pricing-preview"

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <HeroSection />
        <ToolsSection />
        <WhatWeDoSection />
        <HowItWorksSection />
        <ProductsSection />
        <PricingPreviewSection />
      </main>
      <Footer />
    </div>
  )
}
