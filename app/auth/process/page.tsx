"use client"

import { Suspense, useEffect, useMemo, useRef } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, LogIn, LogOut, UserPlus } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ProcessingIndicator } from "@/components/ui/processing-indicator"
import { FadeUp, PopIn } from "@/components/fade-up"
import { supabase } from "@/lib/supabase"

type AuthAction = "login" | "signup" | "logout"

function safeInternalPath(raw: string | null, fallback = "/"): string {
  if (!raw) return fallback
  if (!raw.startsWith("/")) return fallback
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback
  return raw
}

function getAction(raw: string | null): AuthAction {
  if (raw === "signup" || raw === "logout") return raw
  return "login"
}

function AuthProcessContent() {
  const router = useRouter()
  const params = useSearchParams()
  const ranRef = useRef(false)
  const action = getAction(params.get("action"))
  const next = safeInternalPath(params.get("next"), action === "logout" ? "/" : "/tools/smart-storage")
  const email = params.get("email")

  const copy = useMemo(() => {
    if (action === "signup") {
      return {
        icon: UserPlus,
        title: "Preparing your workspace...",
        body: "Your account is created. We are setting up the next step.",
        note: "Secure handoff from signup to AVIntelligence",
      }
    }
    if (action === "logout") {
      return {
        icon: LogOut,
        title: "Signing you out...",
        body: "We are closing the current session and clearing access on this device.",
        note: "Secure handoff from account to public access",
      }
    }
    return {
      icon: LogIn,
      title: "Signing you in...",
      body: "We are confirming your session and returning you to your workspace.",
      note: "Secure handoff from auth to AVIntelligence",
    }
  }, [action])

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const finish = async () => {
      if (action === "logout") {
        await supabase.auth.signOut()
        window.setTimeout(() => router.replace(next), 650)
        return
      }

      if (action === "signup") {
        const target = `/signup/welcome?email=${encodeURIComponent(email ?? "")}&returnTo=${encodeURIComponent(next)}`
        window.setTimeout(() => router.replace(target), 650)
        return
      }

      const {
        data: { session },
      } = await supabase.auth.getSession()

      window.setTimeout(() => {
        router.replace(session ? next : "/")
      }, 650)
    }

    finish()
  }, [action, email, next, router])

  const Icon = copy.icon

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
        <div aria-hidden className="retro-grid-bg pointer-events-none absolute inset-0 opacity-25" />
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "radial-gradient(ellipse at center, var(--retro-glow-red) 0%, transparent 68%)",
            filter: "blur(52px)",
            opacity: 0.34,
          }}
        />
        <div className="relative mx-auto w-full max-w-md">
          <div className="glass-surface overflow-hidden rounded-2xl border border-border/70 p-10 text-center shadow-sm">
            <PopIn>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary shadow-[0_0_30px_-12px_var(--retro-glow-red)]">
                {action === "signup" ? <CheckCircle2 className="h-6 w-6" /> : <ProcessingIndicator active={true} />}
              </div>
            </PopIn>
            <FadeUp delay={0.08}>
              <div className="mt-6 flex items-center justify-center gap-2 text-primary">
                <Icon className="h-4 w-4" />
                <p className="text-[11px] font-medium uppercase tracking-[0.22em]">{action}</p>
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-foreground">{copy.title}</h1>
            </FadeUp>
            <FadeUp delay={0.14}>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
            </FadeUp>
            <FadeUp delay={0.2}>
              <div className="mt-8 overflow-hidden rounded-full border border-border/70 bg-muted/40">
                <div className="h-2 w-full origin-left animate-pulse rounded-full bg-primary/70" />
              </div>
            </FadeUp>
            <FadeUp delay={0.26}>
              <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground/80">{copy.note}</p>
            </FadeUp>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

export default function AuthProcessPage() {
  return (
    <Suspense fallback={null}>
      <AuthProcessContent />
    </Suspense>
  )
}
