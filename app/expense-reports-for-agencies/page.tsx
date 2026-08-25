import type { Metadata } from "next"
import { AudienceLandingPage } from "@/components/audience-landing-page"

export const metadata: Metadata = {
  title: "Expense Reports for Agencies — AVIntelligence",
  description: "Give agencies a faster way to organize project expenses, vendor receipts, and recurring software spend into exportable reports.",
  openGraph: { title: "Expense Reports for Agencies — AVIntelligence", description: "Turn agency receipts and invoices into categorized, exportable expense reports.", url: "https://www.avintph.com/expense-reports-for-agencies", siteName: "AVIntelligence", type: "website" },
}

export default function ExpenseReportsForAgenciesPage() { return <AudienceLandingPage data={{ eyebrow: "For agencies", title: "Expense reports your agency can actually use.", description: "Bring project receipts, contractor invoices, and software subscriptions into one searchable workflow so producers and operators spend less time chasing line items.", audience: "agencies", examples: ["Meta Ads", "Figma", "Contractor invoice"], output: "A vendor-and-category expense report that makes project review and team workflows easier." }} /> }
