"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CheckCircle, Gift, Loader2 } from "lucide-react"
import Link from "next/link"
import { supabase } from "@/lib/supabase"
import { PopIn, FadeUp } from "@/components/fade-up"

export default function RedeemPage() {
  const router = useRouter()
  const [code, setCode]           = useState("")
  const [loading, setLoading]     = useState(false)
  const [success, setSuccess]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null) // null = loading

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setIsSignedIn(!!data.session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setIsSignedIn(!!s)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleRedeem = async () => {
    if (!code.trim()) return
    setError(null)
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setError("Please sign in to redeem a gift code.")
      setLoading(false)
      return
    }

    try {
      const res = await fetch("/api/redeem-gift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code:    code.trim(),
          user_id: session.user.id,
          email:   session.user.email,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "Failed to redeem code. Please try again.")
      } else {
        setSuccess(true)
        setTimeout(() => router.replace("/tools/smart-storage"), 3000)
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />
      <main className="flex flex-1 items-center justify-center px-6 py-24">
        <div className="w-full max-w-md">

          {success ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <PopIn>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle className="h-8 w-8 text-primary" />
                </div>
              </PopIn>
              <FadeUp delay={0.15}>
                <h1 className="text-2xl font-semibold text-foreground">Access activated!</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your 24-hour access is now live. Redirecting you to Smart Storage…
                </p>
              </FadeUp>
            </div>
          ) : (
            <FadeUp>
            <div className="rounded-2xl border border-border bg-card p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <Gift className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">Redeem gift code</h1>
                  <p className="text-sm text-muted-foreground">Enter your code to activate 24h access</p>
                </div>
              </div>

              <div className="mt-8 space-y-4">
                <Input
                  placeholder="AVINT-XXXX-XXXX-XXXX"
                  value={code}
                  onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null) }}
                  onKeyDown={(e) => e.key === "Enter" && handleRedeem()}
                  className="font-mono tracking-wider"
                  disabled={loading}
                />

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                {isSignedIn === false && (
                  <p className="text-sm text-muted-foreground">
                    You&apos;ll need to{" "}
                    <button
                      onClick={() => {/* open account panel */}}
                      className="text-primary underline underline-offset-2 hover:no-underline"
                    >
                      sign in
                    </button>
                    {" "}before redeeming.
                  </p>
                )}

                <Button
                  className="w-full rounded-xl"
                  size="lg"
                  disabled={!code.trim() || loading}
                  onClick={handleRedeem}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Activate access"}
                </Button>

                <p className="text-center text-xs text-muted-foreground">
                  Gift codes grant 24-hour full access to all tools.{" "}
                  <Link href="/pricing" className="underline underline-offset-2 hover:no-underline">
                    See pricing
                  </Link>
                </p>
              </div>
            </div>
            </FadeUp>
          )}

        </div>
      </main>
      <Footer />
    </div>
  )
}
