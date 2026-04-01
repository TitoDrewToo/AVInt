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

      {/* AI provider attribution — transparency requirement */}
      <div className="border-t border-border bg-background py-6">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-2 px-6 text-center">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Powered by</p>
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              OpenAI
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              Anthropic (Claude)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />
              Google Gemini
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground/60">
            AVIntelligence is an independent product and is not affiliated with or endorsed by OpenAI, Anthropic, or Google.
          </p>
        </div>
      </div>

      <Footer />
    </div>
  )
}
