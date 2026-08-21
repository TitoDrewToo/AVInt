import type { Metadata } from "next"
import StudioPage from "./studio/page"

export const metadata: Metadata = {
  title: "AVIntelligence Studio — Production Software, Built End to End",
  description: "AVIntelligence is a systems and web development studio. We design and build web apps, internal tools, and AI systems end to end — agency-grade work, without the agency overhead.",
  openGraph: {
    title: "AVIntelligence Studio — Production Software, Built End to End",
    description: "AVIntelligence is a systems and web development studio. We design and build web apps, internal tools, and AI systems end to end — agency-grade work, without the agency overhead.",
    url: "https://www.avintph.com/",
    siteName: "AVIntelligence",
    type: "website",
  },
}

// The studio is now the company's public front door. Product routes remain
// available as proof-of-work and R&D surfaces.
export default function HomePage() {
  return <StudioPage />
}
