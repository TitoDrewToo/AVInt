import { Navbar } from "@/components/navbar"
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
        <WhatWeDoSection />
        <ProductsSection />
        <ToolsSection />
        <HowItWorksSection />
        <PricingPreviewSection />
      </main>
      <Footer />
    </div>
  )
}
