import type { Metadata } from "next"
import { AudienceLandingPage } from "@/components/audience-landing-page"

export const metadata: Metadata = {
  title: "Receipt to CSV Converter — AVIntelligence",
  description: "Convert receipt photos and PDFs into categorized CSV rows with normalized dates, vendors, amounts, and expense categories.",
  openGraph: { title: "Receipt to CSV Converter — AVIntelligence", description: "Convert receipts into categorized CSV rows and exportable expense reports.", url: "https://www.avintph.com/receipt-to-csv-converter", siteName: "AVIntelligence", type: "website" },
}

export default function ReceiptToCsvConverterPage() { return <AudienceLandingPage data={{ eyebrow: "For faster bookkeeping", title: "Convert receipts to CSV without typing every line.", description: "Upload receipt images and PDFs, let AVIntelligence extract the transaction details, then export normalized rows for your spreadsheet or accounting workflow.", audience: "bookkeeping workflows", examples: ["Vendor name", "Transaction date", "Expense category"], output: "A normalized CSV with vendor, date, amount, category, and currency columns." }} /> }
