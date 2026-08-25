"use client"

import { useEffect, useRef, useState } from "react"
import { MessageCircle, Send, X } from "lucide-react"

import { supabase } from "@/lib/supabase"

type Exchange = { id: string; question: string; answer?: string; pending?: boolean; error?: boolean }

export function DashboardAssistant() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const [exchanges, setExchanges] = useState<Exchange[]>([])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false) }
    window.addEventListener("keydown", closeOnEscape)
    return () => window.removeEventListener("keydown", closeOnEscape)
  }, [open])

  async function ask() {
    const text = question.trim()
    if (!text || loading) return
    setQuestion("")
    setOpen(true)
    setLoading(true)
    const id = `${Date.now()}`
    setExchanges((current) => [...current, { id, question: text, pending: true }])
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const response = await fetch("/api/dashboard-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ question: text }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "The dashboard assistant could not answer.")
      setExchanges((current) => current.map((exchange) => exchange.id === id ? { ...exchange, pending: false, answer: payload.answer } : exchange))
    } catch (error) {
      setExchanges((current) => current.map((exchange) => exchange.id === id ? { ...exchange, pending: false, error: true, answer: error instanceof Error ? error.message : "The dashboard assistant could not answer." } : exchange))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="cw-button-flow flex h-7 items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
        aria-expanded={open}
      >
        <MessageCircle className="h-3.5 w-3.5 text-primary" />
        Ask your data
      </button>

      {open && (
        <div className="glass-surface absolute right-0 top-9 z-50 w-[min(360px,calc(100vw-2rem))] rounded-xl p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-aldrich text-[10px] uppercase tracking-wider text-primary">Dashboard assistant</p>
              <p className="mt-1 text-xs text-muted-foreground">Ask about your normalized records.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="cw-button-flow glass-surface-sm flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground" aria-label="Close assistant">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mb-3 max-h-64 space-y-2 overflow-y-auto">
            {exchanges.length === 0 && <p className="rounded-lg border border-dashed border-border px-3 py-4 text-xs leading-relaxed text-muted-foreground">Try “What changed recently?” or “What chart would be useful from my data?”</p>}
            {exchanges.map((exchange) => (
              <div key={exchange.id} className="space-y-1.5">
                <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground">{exchange.question}</p>
                <p className={`rounded-lg border border-border px-3 py-2 text-xs leading-relaxed ${exchange.error ? "text-destructive" : "text-muted-foreground"}`}>
                  {exchange.pending ? "Reading your normalized data…" : exchange.answer}
                </p>
              </div>
            ))}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void ask() }} className="flex items-center gap-2">
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask your data…" className="min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
            <button type="submit" disabled={loading || !question.trim()} className="cw-button-flow flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50" aria-label="Ask">
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
