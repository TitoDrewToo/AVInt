import type { Metadata } from "next"
import { AudienceLandingPage } from "@/components/audience-landing-page"

export const metadata: Metadata = {
  title: "Invoice Organizer for Contractors — AVIntelligence",
  description: "Organize contractor invoices and job expenses automatically with searchable records, categories, and clean exportable reports.",
  openGraph: { title: "Invoice Organizer for Contractors — AVIntelligence", description: "Keep contractor invoices and job expenses organized from upload to export.", url: "https://www.avintph.com/invoice-organizer-for-contractors", siteName: "AVIntelligence", type: "website" },
}

export default function InvoiceOrganizerForContractorsPage() { return <AudienceLandingPage data={{ eyebrow: "For contractors", title: "Organize invoices before the paperwork piles up.", description: "Upload job invoices, fuel receipts, materials, and service bills. AVIntelligence turns each document into a record you can search, review, and export.", audience: "contractors", examples: ["Home Depot", "Shell", "Hiscox Business Insurance"], output: "A job-expense report grouped by vendor and category for cleaner books." }} /> }
