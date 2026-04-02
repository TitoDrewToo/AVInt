import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Pricing — AVIntelligence",
  description: "Simple, transparent pricing for AI financial document analysis. Start free, upgrade when you need reports, dashboards, and advanced analytics.",
  openGraph: {
    title: "Pricing — AVIntelligence",
    description: "Simple, transparent pricing for AI financial document analysis. Start free, upgrade when you need reports, dashboards, and advanced analytics.",
    url: "https://www.avintph.com/pricing",
    siteName: "AVIntelligence",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pricing — AVIntelligence",
    description: "Simple, transparent pricing for AI financial document analysis.",
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
