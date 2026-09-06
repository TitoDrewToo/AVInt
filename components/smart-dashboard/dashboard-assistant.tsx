"use client"

import { useEffect, useRef, useState } from "react"
import { BarChart3, Check, Loader2, Plus, Send, Sparkles, X } from "lucide-react"
import { Tip } from "@/components/ui/tip"

import { supabase } from "@/lib/supabase"

type Proposal = { widget_type: string; title: string; description: string | null; insight: string | null; definition: Record<string, unknown> }
type Preview = { data: Array<{ label: string; value: number; currency?: string }>; coverage: { statement: string } }
type Exchange = { id: string; question: string; answer?: string; pending?: boolean; error?: boolean; proposal?: Proposal; preview?: Preview; saving?: boolean; saved?: boolean }

export function DashboardAssistant({ pageSlug = "personal", dateFrom = "", dateTo = "", onVisualSaved }: { pageSlug?: string; dateFrom?: string; dateTo?: string; onVisualSaved?: () => void | Promise<void> }) {
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
        body: JSON.stringify({ question: text, pageSlug, dateFrom: dateFrom || null, dateTo: dateTo || null }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "The dashboard assistant could not answer.")
      setExchanges((current) => current.map((exchange) => exchange.id === id ? { ...exchange, pending: false, answer: payload.answer, proposal: payload.proposal ?? undefined, preview: payload.preview ?? undefined } : exchange))
    } catch (error) {
      setExchanges((current) => current.map((exchange) => exchange.id === id ? { ...exchange, pending: false, error: true, answer: error instanceof Error ? error.message : "The dashboard assistant could not answer." } : exchange))
    } finally {
      setLoading(false)
    }
  }

  async function addVisual(exchangeId: string, proposal: Proposal) {
    setExchanges((current) => current.map((exchange) => exchange.id === exchangeId ? { ...exchange, saving: true, error: false } : exchange))
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token
      const response = await fetch("/api/dashboard-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ action: "save", pageSlug, proposal }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error ?? "The visual could not be added.")
      setExchanges((current) => current.map((exchange) => exchange.id === exchangeId ? { ...exchange, saving: false, saved: true } : exchange))
      await onVisualSaved?.()
    } catch (error) {
      setExchanges((current) => current.map((exchange) => exchange.id === exchangeId ? { ...exchange, saving: false, error: true, answer: error instanceof Error ? error.message : "The visual could not be added." } : exchange))
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
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Explore & build
      </button>

      {open && (
        <div className="glass-surface absolute right-0 top-9 z-50 w-[min(420px,calc(100vw-2rem))] rounded-xl p-3 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-aldrich text-[10px] uppercase tracking-wider text-primary">Dashboard Copilot</p>
              <p className="mt-1 text-xs text-muted-foreground">Analyze your data or build a refreshable visual.</p>
            </div>
            <Tip text="Close Dashboard Copilot."><button type="button" onClick={() => setOpen(false)} className="cw-button-flow glass-surface-sm flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground" aria-label="Close assistant">
              <X className="h-3.5 w-3.5" />
            </button></Tip>
          </div>
          <div className="mb-3 max-h-[min(55vh,420px)] space-y-2 overflow-y-auto">
            {exchanges.length === 0 && <div className="rounded-lg border border-dashed border-border px-3 py-4 text-xs leading-relaxed text-muted-foreground"><p>Try “What changed recently?” or “Show monthly expenses by category.”</p><p className="mt-2 text-[11px]">Copilot previews new visuals first. Nothing is added without your approval.</p></div>}
            {exchanges.map((exchange) => (
              <div key={exchange.id} className="space-y-1.5">
                <p className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-foreground">{exchange.question}</p>
                <p className={`rounded-lg border border-border px-3 py-2 text-xs leading-relaxed ${exchange.error ? "text-destructive" : "text-muted-foreground"}`}>
                  {exchange.pending ? "Reading your normalized data…" : exchange.answer}
                </p>
                {exchange.proposal && exchange.preview && (
                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <div className="flex items-start gap-2">
                      <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground">{exchange.proposal.title}</p>
                        {exchange.proposal.description && <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{exchange.proposal.description}</p>}
                        <div className="mt-2 space-y-1">
                          {exchange.preview.data.slice(0, 4).map((row) => <div key={`${row.label}-${row.currency ?? ""}`} className="flex items-center justify-between gap-3 text-[11px]"><span className="truncate text-muted-foreground">{row.label}</span><span className="font-medium text-foreground">{row.value.toLocaleString()}</span></div>)}
                          {exchange.preview.data.length === 0 && <p className="text-[11px] text-muted-foreground">No current rows match this visual yet.</p>}
                        </div>
                        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">{exchange.preview.coverage.statement}</p>
                      </div>
                    </div>
                    <button type="button" disabled={exchange.saving || exchange.saved} onClick={() => void addVisual(exchange.id, exchange.proposal!)} className="cw-button-flow mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-60">
                      {exchange.saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : exchange.saved ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                      {exchange.saving ? "Adding…" : exchange.saved ? `Added to ${pageSlug}` : `Add to ${pageSlug}`}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <form onSubmit={(event) => { event.preventDefault(); void ask() }} className="flex items-center gap-2">
            <input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={600} placeholder="Ask or request a visual…" className="min-w-0 flex-1 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
            <Tip text="Send this request to Dashboard Copilot."><button type="submit" disabled={loading || !question.trim()} className="cw-button-flow flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground disabled:opacity-50" aria-label="Ask">
              <Send className="h-3.5 w-3.5" />
            </button></Tip>
          </form>
        </div>
      )}
    </div>
  )
}
