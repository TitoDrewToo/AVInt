import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProcessingActivityDemo } from "@/components/smart-storage/processing-activity-demo"

export const metadata: Metadata = {
  title: "Processing Window Demo | AVIntelligence",
  robots: { index: false, follow: false },
}

export default function ProcessingDemoPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <div className="flex min-h-screen flex-col"><Navbar /><main className="flex-1 px-6 py-16"><div className="mx-auto max-w-3xl"><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Smart Storage · local preview</p><h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground">Processing activity window</h1><p className="mt-4 max-w-2xl text-muted-foreground">Review the truthful customer-facing states without starting an upload.</p><div className="mt-10"><ProcessingActivityDemo /></div></div></main><Footer /></div>
}
