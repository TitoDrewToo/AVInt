"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, Sparkles, X } from "lucide-react"

import { supabase } from "@/lib/supabase"

const chromeFontStyle = {
  fontFamily: 'var(--font-aldrich), "Aldrich", var(--font-geist), "Geist", "Geist Fallback", sans-serif',
} as const

type Exchange = {
  id: string
  question: string
  answer?: string
  bullets?: string[]
  sources?: string[]
  isError?: boolean
  pending?: boolean
}

export function ProductAssistantPreview() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerInputRef = useRef<HTMLInputElement | null>(null)
  const scrollViewportRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [exchanges, setExchanges] = useState<Exchange[]>([])

  const hasConversation = exchanges.length > 0

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false)
    }

    window.addEventListener("mousedown", onPointerDown)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("mousedown", onPointerDown)
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  function scrollThreadToBottom() {
    window.requestAnimationFrame(() => {
      if (!scrollViewportRef.current) return
      scrollViewportRef.current.scrollTop = scrollViewportRef.current.scrollHeight
    })
  }

  async function ask(question: string) {
    const trimmed = question.trim()
    if (!trimmed || loading) return

    setOpen(true)
    setLoading(true)
    setInput("")

    const exchangeId = `${Date.now()}`
    setExchanges((current) => [
      ...current,
      {
        id: exchangeId,
        question: trimmed,
        pending: true,
      },
    ])
    scrollThreadToBottom()

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setExchanges((current) =>
          current.map((exchange) =>
            exchange.id === exchangeId
              ? {
                  ...exchange,
                  pending: false,
                  isError: true,
                  answer: "Sign in is required before the assistant can answer product-specific questions.",
                  bullets: [
                    "Open the account menu and sign in.",
                    "Subscribed users will be able to use the assistant directly from the navbar.",
                  ],
                }
              : exchange,
          ),
        )
        scrollThreadToBottom()
        return
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ question: trimmed }),
      })

      const payload = await res.json()
      if (!res.ok) {
        const message =
          payload.error === "Active premium access required"
            ? "The assistant is reserved for users with active premium access."
            : payload.error ?? "The assistant could not answer right now."

        setExchanges((current) =>
          current.map((exchange) =>
            exchange.id === exchangeId
              ? {
                  ...exchange,
                  pending: false,
                  isError: true,
                  answer: message,
                  bullets:
                    payload.error === "Active premium access required"
                      ? [
                          "This guide is intended for subscribed users.",
                          "You can enable access with Pro, Day Pass, or Gift Code entitlement.",
                        ]
                      : undefined,
                }
              : exchange,
          ),
        )
        scrollThreadToBottom()
        return
      }

      setExchanges((current) =>
        current.map((exchange) =>
          exchange.id === exchangeId
            ? {
                ...exchange,
                pending: false,
                answer: payload.answer,
                bullets: payload.bullets,
                sources: payload.sources,
              }
            : exchange,
        ),
      )
      scrollThreadToBottom()
    } catch {
      setExchanges((current) =>
        current.map((exchange) =>
          exchange.id === exchangeId
            ? {
                ...exchange,
                pending: false,
                isError: true,
                answer: "The assistant is temporarily unavailable. Please try again in a moment.",
              }
            : exchange,
        ),
      )
      scrollThreadToBottom()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <div className="cw-button-flow flex h-11 w-[320px] items-center rounded-xl border border-white/10 bg-background/35 pl-3 pr-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-primary/30 focus-within:border-primary/35 focus-within:ring-2 focus-within:ring-primary/60">
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary/90" />
        <input
          ref={triggerInputRef}
          type="text"
          value={input}
          onChange={(event) => {
            setInput(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              void ask(input)
            }
          }}
          placeholder="Ask AVIntelligence..."
          aria-label="Ask AVIntelligence"
          aria-expanded={open}
          className="h-full w-full bg-transparent px-3 text-sm text-foreground/72 placeholder:text-foreground/62 focus:outline-none"
          style={chromeFontStyle}
        />
      </div>

      {open && (
        <div className="glass-surface absolute left-0 top-full z-[70] mt-3 w-[640px] overflow-hidden rounded-2xl border border-white/10 shadow-[0_28px_120px_-42px_rgba(255,58,58,0.7)]">
          <div aria-hidden className="retro-grid-bg pointer-events-none absolute inset-0 opacity-30" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40"
            style={{
              background: "radial-gradient(ellipse at top, var(--retro-glow-red) 0%, transparent 72%)",
              filter: "blur(34px)",
              opacity: 0.28,
            }}
          />

          <div className="relative border-b border-white/10 px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-primary/85" style={chromeFontStyle}>
                  User Guide
                </p>
                <p className="mt-2 max-w-[32rem] text-sm leading-relaxed text-muted-foreground">
                  Product guidance, UI explanations, workflow coaching, and next-step help.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cw-button-flow glass-surface-sm flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-primary"
                aria-label="Close assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div
            ref={scrollViewportRef}
            data-assistant-scroll
            className="relative max-h-[34rem] overflow-y-auto px-5 py-5"
          >
            {!hasConversation ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-dashed border-white/10 bg-background/35 p-4 text-sm text-muted-foreground">
                  This window will populate with real user and assistant exchanges as questions are submitted.
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {exchanges.map((exchange) => (
                  <div key={exchange.id} className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2.5 text-sm text-foreground/88">
                        {exchange.question}
                      </div>
                    </div>

                    <div
                      className={`rounded-2xl border p-4 ${
                        exchange.isError
                          ? "border-red-500/20 bg-red-500/5"
                          : "border-white/10 bg-background/50"
                      }`}
                    >
                      <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80" style={chromeFontStyle}>
                        AVIntelligence Guide
                      </p>
                      {exchange.pending ? (
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/8">
                          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/70" />
                        </div>
                      ) : (
                        <p className="mt-2 text-sm leading-relaxed text-foreground/84">{exchange.answer}</p>
                      )}

                      {exchange.bullets?.length ? (
                        <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                          {exchange.bullets.map((bullet) => (
                            <li key={bullet} className="flex gap-2">
                              <span className="mt-[0.35rem] h-1.5 w-1.5 shrink-0 rounded-full bg-primary/80" />
                              <span>{bullet}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {exchange.sources?.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {exchange.sources.map((source) => (
                            <span
                              key={source}
                              className="rounded-full border border-white/10 bg-background/55 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-muted-foreground"
                              style={chromeFontStyle}
                            >
                              {source}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {input.trim() ? (
            <div className="relative border-t border-white/10 px-5 py-3">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/15 bg-primary/5 px-3 py-2.5">
                <p className="min-w-0 flex-1 truncate text-xs text-foreground/72">
                  Press Enter to ask: <span className="text-foreground">{input}</span>
                </p>
                <button
                  type="button"
                  onClick={() => void ask(input)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-primary transition-all hover:bg-primary/10 disabled:opacity-40"
                  aria-label="Send question"
                  disabled={loading}
                >
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
