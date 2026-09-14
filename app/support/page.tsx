import { SupportForm } from "@/components/support-form"

export default function SupportPage() {
  return <main className="mx-auto min-h-screen max-w-2xl px-6 py-16"><p className="text-xs uppercase tracking-[0.2em] text-primary">AVIntelligence support</p><h1 className="mt-3 text-3xl font-semibold">How can we help?</h1><p className="mt-3 text-muted-foreground">Tell us what happened. We’ll include the relevant account and error context when you’re signed in.</p><SupportForm /></main>
}
