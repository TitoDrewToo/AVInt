"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { BarChart3, FileText, LogIn, Sparkles, Upload } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"

const tutorialSteps = [
  {
    icon: Upload,
    title: "Launch Smart Storage",
    body: "Try uploading a receipt/screenshot.",
  },
  {
    icon: FileText,
    title: "AI will structure your data",
    body: "Launch Smart Dashboard once done.",
  },
  {
    icon: BarChart3,
    title: "Add visuals to your workspace",
    body: "Try expenses.",
  },
] as const

export default function SignupWelcomePage() {
  const router = useRouter()
  const params = useSearchParams()
  const email = params.get("email")
  const returnTo = params.get("returnTo") || "/"
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const isPending = window.sessionStorage.getItem("avint_signup_welcome_pending") === "1"
    if (!isPending) {
      router.replace(returnTo)
      return
    }
    window.sessionStorage.removeItem("avint_signup_welcome_pending")
    setReady(true)
  }, [returnTo, router])

  if (!ready) {
    return null
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="relative flex-1 overflow-hidden px-6 py-20 md:py-24">
        <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-25" />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[18%] h-[34rem] w-[34rem] -translate-x-1/2 rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, var(--retro-glow-red) 0%, transparent 68%)",
            filter: "blur(52px)",
            opacity: 0.36,
          }}
        />

        <div className="relative mx-auto max-w-5xl">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
            <div className="max-w-xl">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/12 text-primary">
                <Sparkles className="h-6 w-6" />
              </div>
              <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.28em] text-primary/80">
                Signup Complete
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                Welcome to AVIntelligence
              </h1>
              <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                Your account has been created. Confirm your email, then come back and start with this workflow.
              </p>
              {email && (
                <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/6 p-4">
                  <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary/80">
                    Confirmation sent
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    We sent a confirmation email to <span className="font-medium text-foreground">{email}</span>.
                  </p>
                </div>
              )}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={returnTo}
                  className="cw-button-flow inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <LogIn className="h-4 w-4" />
                  Return to AVIntelligence
                </Link>
                <Link
                  href="/pricing"
                  className="cw-button-flow inline-flex items-center rounded-xl border border-border/70 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  View pricing
                </Link>
              </div>
            </div>

            <div className="glass-surface rounded-[2rem] border border-border/60 p-5 md:p-6">
              <div className="grid gap-4">
                {tutorialSteps.map((step) => {
                  const Icon = step.icon
                  return (
                    <div key={step.title} className="rounded-[1.5rem] border border-border/70 bg-background/35 p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="text-base font-medium text-foreground">{step.title}</p>
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
