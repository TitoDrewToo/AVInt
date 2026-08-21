import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "AVIntelligence Studio — Start a project",
  description: "Talk to AVIntelligence about web apps, internal tools, and AI systems built around your workflow.",
  openGraph: {
    title: "AVIntelligence Studio — Start a project",
    description: "Talk to AVIntelligence about web apps, internal tools, and AI systems built around your workflow.",
    url: "https://www.avintph.com/studio#studio-inquiry",
    siteName: "AVIntelligence",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AVIntelligence Studio — Start a project",
    description: "Talk to AVIntelligence about web apps, internal tools, and AI systems built around your workflow.",
  },
}

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
