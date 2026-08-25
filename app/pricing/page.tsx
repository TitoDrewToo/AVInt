import type { Metadata } from "next"
import Link from "next/link"
import { Check, ArrowUpRight } from "lucide-react"

import { Footer } from "@/components/footer"
import { Navbar } from "@/components/navbar"
import { StartFreeButton } from "@/components/start-free-button"

export const metadata: Metadata = {
  title: "Pricing — AVIntelligence",
  description: "Choose the AVIntelligence plan that fits how much structured data you want to work with.",
}

const plans = [
  {
    name: "Free",
    price: "$0",
    annualPrice: undefined,
    featured: false,
    cadence: "to explore",
    description: "A focused starting point for turning a small set of documents into usable records.",
    features: ["10 documents / month", "Smart Storage and classification", "Basic dashboard", "1 report export / month"],
    action: "free",
  },
  {
    name: "Day Pass",
    price: "$6",
    annualPrice: undefined,
    featured: false,
    cadence: "24 hours",
    description: "A short, concentrated window when you need more room to process a set of files.",
    features: ["50 documents", "All report and structured outputs", "Advanced Analytics", "QuickBooks and Xero exports"],
    action: "contact",
  },
  {
    name: "Pro",
    price: "$12",
    annualPrice: "$100",
    cadence: "month",
    description: "The full workspace for recurring ingestion, dashboards, and connected intelligence.",
    features: ["500 documents / month", "Advanced Analytics and custom dashboards", "Recurring-expense detection", "QuickBooks and Xero exports", "Claude connector and priority processing"],
    action: "contact",
    featured: true,
  },
] as const

export default function PricingPage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Navbar />
      <main className="relative z-[1] flex-1 overflow-hidden px-6 py-20 md:py-28">
        <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-30" />
        <div aria-hidden className="pointer-events-none absolute left-1/2 top-24 h-80 w-[38rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-medium uppercase tracking-[0.24em] text-primary">Access that scales with your workflow</p>
            <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight text-foreground md:text-6xl">Start with your data. Go further when you need to.</h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">Every plan starts with the same path: upload files, create structured records, and see what your data can support. Upgrade when you need more volume or deeper workspace tools.</p>
          </div>
          <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {plans.map((plan) => (
              <article key={plan.name} className={`glass-surface relative flex h-full flex-col rounded-3xl p-6 md:p-7 ${plan.featured ? "border-primary/40 shadow-[0_0_42px_-22px_var(--retro-glow-red)]" : ""}`}>
                {plan.featured && <span className="absolute right-6 top-6 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-primary">Most access</span>}
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary/80">{plan.name}</p>
                <div className="mt-6 flex items-baseline gap-2"><span className="text-4xl font-semibold tracking-tight text-foreground">{plan.price}</span><span className="text-sm text-muted-foreground">/ {plan.cadence}</span></div>
                {plan.annualPrice && <p className="mt-2 text-xs text-primary">Annual access: {plan.annualPrice} / year</p>}
                <p className="mt-5 min-h-14 text-sm leading-relaxed text-muted-foreground">{plan.description}</p>
                <ul className="mt-7 flex-1 space-y-3 border-t border-border/60 pt-6">
                  {plan.features.map((feature) => <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground/80"><Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden /><span>{feature}</span></li>)}
                </ul>
                <div className="mt-8">{plan.action === "free" ? <StartFreeButton tool="smart-storage" /> : <Link href="/studio#studio-inquiry" className="cw-button-flow inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-5 py-3 text-sm font-medium text-primary hover:bg-primary hover:text-primary-foreground">Talk with us about {plan.name}<ArrowUpRight className="h-4 w-4" aria-hidden /></Link>}</div>
              </article>
            ))}
          </div>
          <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-border/60 bg-background/30 p-5 text-center"><p className="text-sm leading-relaxed text-muted-foreground">Pricing is intentionally simple while we are building with early users. Your account and data remain yours, and you can start with the free workspace before deciding what deserves a paid commitment.</p></div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
