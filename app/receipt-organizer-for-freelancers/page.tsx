import type { Metadata } from "next"
import { AudienceLandingPage } from "@/components/audience-landing-page"

export const metadata: Metadata = {
  title: "Receipt Organizer for Freelancers — AVIntelligence",
  description: "Organize freelance receipts automatically. Extract vendors, dates, amounts, and categories into searchable records and useful outputs.",
  openGraph: { title: "Receipt Organizer for Freelancers — AVIntelligence", description: "Turn freelance receipts into searchable records and clean expense reports.", url: "https://www.avintph.com/receipt-organizer-for-freelancers", siteName: "AVIntelligence", type: "website" },
}

export default function ReceiptOrganizerForFreelancersPage() { return <AudienceLandingPage data={{ eyebrow: "For freelancers", title: "A receipt organizer that keeps freelance expenses moving.", description: "Stop rebuilding your expense history from inboxes and camera rolls. Upload receipts once and get the vendors, dates, categories, and reports you need for every client and quarter.", audience: "freelancers", examples: ["Adobe Creative Cloud", "WeWork", "Delta Air Lines"], output: "A categorized freelance expense report, ready to review or export." }} /> }
