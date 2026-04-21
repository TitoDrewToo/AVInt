"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { ArrowUpRight, CheckCircle2, CreditCard, LockKeyhole, RefreshCcw, ShieldCheck, Sparkles } from "lucide-react"

type PreviewPlan = "pro-monthly" | "pro-annual" | "day-pass" | "gift-codes"

const PLAN_OPTIONS: Array<{
  id: PreviewPlan
  label: string
  name: string
  price: string
  cadence: string
}> = [
  { id: "pro-monthly", label: "Pro Monthly", name: "Pro Subscription", price: "$12", cadence: "monthly" },
  { id: "pro-annual", label: "Pro Annual", name: "Pro Subscription", price: "$100", cadence: "annual" },
  { id: "day-pass", label: "Day Pass", name: "Day Pass Access", price: "$6", cadence: "24 hours" },
  { id: "gift-codes", label: "Gift Codes", name: "Gift Code Bundle", price: "$6", cadence: "per code" },
]

const STAGES = [
  {
    key: "session",
    eyebrow: "Session",
    title: "Preparing your secure handoff",
    body: "We preserve plan context, auth state, and return routing before leaving AVIntelligence.",
    icon: ShieldCheck,
  },
  {
    key: "order",
    eyebrow: "Order",
    title: "Building your checkout payload",
    body: "Plan details, pricing, and post-purchase return targets are packaged for Creem.",
    icon: CreditCard,
  },
  {
    key: "redirect",
    eyebrow: "Redirect",
    title: "Opening Creem secure checkout",
    body: "Your transition finishes here, then the browser hands off into the external payment flow.",
    icon: ArrowUpRight,
  },
] as const

const STAGE_DURATION_MS = 1450

export function PurchaseFlowPreview() {
  const [selectedPlan, setSelectedPlan] = useState<PreviewPlan>("pro-monthly")
  const [activeStage, setActiveStage] = useState(0)
  const [runId, setRunId] = useState(0)

  useEffect(() => {
    setActiveStage(0)

    const timers = STAGES.map((_, index) =>
      window.setTimeout(() => setActiveStage(index), index * STAGE_DURATION_MS)
    )

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer))
    }
  }, [runId, selectedPlan])

  const selected = useMemo(
    () => PLAN_OPTIONS.find((option) => option.id === selectedPlan) ?? PLAN_OPTIONS[0],
    [selectedPlan]
  )

  const progress = ((activeStage + 1) / STAGES.length) * 100

  return (
    <section className="relative overflow-hidden px-6 py-24">
      <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-20" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[18%] h-[28rem] w-[42rem] -translate-x-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--retro-glow-red) 22%, transparent) 0%, transparent 68%)",
          filter: "blur(44px)",
        }}
      />

      <div className="relative mx-auto max-w-6xl">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="max-w-xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-primary/80">
              Purchase Transition Preview
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
              Preview the screen that bridges pricing into Creem.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              This is a standalone motion prototype. If the choreography feels right, I can map the same transition
              into the real purchase path before redirecting to checkout.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {PLAN_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedPlan(option.id)}
                  className={`cw-button-flow rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedPlan === option.id
                      ? "bg-primary text-primary-foreground"
                      : "glass-surface-sm text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setRunId((value) => value + 1)}
              className="cw-button-flow glass-surface-sm mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm text-foreground"
            >
              <RefreshCcw className="h-4 w-4" />
              Replay transition
            </button>
          </div>

          <div className="relative">
            <div className="glass-surface relative overflow-hidden rounded-[2rem] border border-border/60 p-5 md:p-6">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-32"
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--retro-glow-red) 16%, transparent) 0%, transparent 100%)",
                }}
              />

              <div className="relative z-[1]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-primary/80">
                      AVIntelligence
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-foreground">Redirecting to secure checkout</h2>
                  </div>
                  <div className="cw-button-flow glass-surface-sm flex h-11 w-11 items-center justify-center rounded-2xl text-primary">
                    <LockKeyhole className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-6 rounded-[1.5rem] border border-border/60 bg-background/55 p-4 backdrop-blur-md">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Order summary</p>
                      <p className="mt-3 text-base font-semibold text-foreground">{selected.name}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {selected.price} <span className="text-muted-foreground/70">/ {selected.cadence}</span>
                      </p>
                    </div>
                    <div className="rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
                      Creem
                    </div>
                  </div>

                  <div className="mt-5 overflow-hidden rounded-full border border-border/70 bg-muted/35">
                    <motion.div
                      key={`${selectedPlan}-${runId}`}
                      className="h-2 rounded-full bg-primary"
                      initial={{ width: "0%" }}
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>

                  <div className="mt-6 space-y-3">
                    {STAGES.map((stage, index) => {
                      const Icon = stage.icon
                      const isActive = index === activeStage
                      const isDone = index < activeStage

                      return (
                        <motion.div
                          key={`${stage.key}-${selectedPlan}-${runId}`}
                          initial={{ opacity: 0.45, y: 8 }}
                          animate={{
                            opacity: isActive || isDone ? 1 : 0.48,
                            y: 0,
                            scale: isActive ? 1.01 : 1,
                          }}
                          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                          className={`rounded-[1.25rem] border p-4 ${
                            isActive
                              ? "border-primary/30 bg-primary/6"
                              : "border-border/60 bg-background/30"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                                isDone || isActive
                                  ? "bg-primary/12 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                {stage.eyebrow}
                              </p>
                              <p className="mt-1 text-sm font-medium text-foreground">{stage.title}</p>
                              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{stage.body}</p>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>

                  <motion.div
                    key={`footer-${selectedPlan}-${runId}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: activeStage === STAGES.length - 1 ? 1 : 0.55, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.35 }}
                    className="mt-5 flex items-center justify-between gap-4 rounded-[1.25rem] border border-border/60 bg-background/35 px-4 py-3"
                  >
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Leave app to pay securely
                    </div>
                    <div className="text-sm font-medium text-foreground">creem.io</div>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
