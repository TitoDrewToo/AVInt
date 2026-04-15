"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { CheckCircle, Copy, Check } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { FadeUp, PopIn } from "@/components/fade-up"

function CopyableCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-3">
      <span className="font-mono text-sm font-medium tracking-wider text-foreground">{code}</span>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

function SuccessContent() {
  const params = useSearchParams()
  const type = params.get("type") // "subscription" | "gift"
  const isGift = type === "gift"

  const [giftCodes, setGiftCodes] = useState<string[]>([])
  const [loadingCodes, setLoadingCodes] = useState(isGift)

  useEffect(() => {
    if (!isGift) return

    const fetchCodes = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const email = session?.user?.email
      if (!email) { setLoadingCodes(false); return }

      // Fetch gift codes purchased by this user in the last 10 minutes
      const { data } = await supabase
        .from("gift_codes")
        .select("code")
        .eq("purchased_by_email", email)
        .eq("status", "pending")
        .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })

      if (data && data.length > 0) {
        setGiftCodes(data.map((r) => r.code))
      }
      setLoadingCodes(false)
    }

    fetchCodes()
  }, [isGift])

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">

            {/* Success icon */}
            <PopIn className="flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle className="h-7 w-7 text-primary" />
              </div>
            </PopIn>

            {isGift ? (
              <>
                <FadeUp delay={0.08}>
                  <h1 className="mt-6 text-2xl font-semibold text-foreground">Gift codes ready</h1>
                </FadeUp>
                <FadeUp delay={0.14}>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Share these codes — each grants 24-hour full access.
                  </p>
                </FadeUp>

                <FadeUp delay={0.2} className="mt-8 text-left">
                  {loadingCodes ? (
                    <div className="flex items-center justify-center py-6">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    </div>
                  ) : giftCodes.length > 0 ? (
                    <div className="space-y-2">
                      {giftCodes.map((code) => (
                        <CopyableCode key={code} code={code} />
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
                      Codes are being generated — check your email or refresh in a moment.
                    </p>
                  )}
                  <p className="mt-3 text-xs text-muted-foreground">
                    Each code grants 24-hour access to Smart Storage, all reports, and dashboards.
                  </p>
                </FadeUp>
              </>
            ) : (
              <>
                <FadeUp delay={0.08}>
                  <h1 className="mt-6 text-2xl font-semibold text-foreground">You&apos;re all set</h1>
                </FadeUp>
                <FadeUp delay={0.14}>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Your access is now active. Head to Smart Storage to get started.
                  </p>
                </FadeUp>
              </>
            )}

            <FadeUp delay={0.28}>
              <Link href="/tools/smart-storage">
                <Button size="lg" className="mt-8 w-full rounded-xl">
                  Go to Smart Storage
                </Button>
              </Link>
            </FadeUp>

            <FadeUp delay={0.34}>
              <Link href="/pricing">
                <p className="mt-3 cursor-pointer text-xs text-muted-foreground underline-offset-2 hover:underline">
                  Back to pricing
                </p>
              </Link>
            </FadeUp>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default function PurchaseSuccessPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex flex-1 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </main>
        <Footer />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
