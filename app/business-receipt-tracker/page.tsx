import type { Metadata } from "next"
import { AudienceLandingPage } from "@/components/audience-landing-page"

export const metadata: Metadata = {
  title: "Business Receipt Tracker — AVIntelligence",
  description: "Track business receipts with automatic extraction, searchable categories, recurring-expense visibility, and exportable reports.",
  openGraph: { title: "Business Receipt Tracker — AVIntelligence", description: "Track business receipts without a manual spreadsheet.", url: "https://www.avintph.com/business-receipt-tracker", siteName: "AVIntelligence", type: "website" },
}

export default function BusinessReceiptTrackerPage() { return <AudienceLandingPage data={{ eyebrow: "For small businesses", title: "A business receipt tracker that does the sorting for you.", description: "Keep receipts attached to useful data instead of buried in folders. Upload documents, find every transaction quickly, and see where recurring business spend is growing.", audience: "small businesses", examples: ["Office supplies", "Business internet", "Client dinner"], output: "A searchable receipt trail with category totals and a report you can export." }} /> }
