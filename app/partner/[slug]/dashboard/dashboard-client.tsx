"use client"

import { useEffect, useState } from "react"
import { Archive, FileSpreadsheet, Loader2, Plus } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

type Firm = { id: string; name: string; slug: string; seats_purchased: number; seats_used: number; partner_rate_cents: number; founding: boolean }
type Client = { user_id: string; created_at: string; email: string | null }

export function FirmDashboard({ slug }: { slug: string }) {
  const [firm, setFirm] = useState<Firm | null>(null)
  const [clients, setClients] = useState<Client[]>([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void load()
    async function load() {
      const { data, error: sessionError } = await supabase.auth.getSession().catch(() => ({ data: { session: null }, error: new Error("session unavailable") }))
      if (sessionError) { setError("Could not verify your firm administrator session."); setLoading(false); return }
      if (!data.session) { setError("Sign in with your firm administrator account."); setLoading(false); return }
      const response = await fetch(`/api/firm/dashboard?slug=${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } })
      const body = await response.json()
      if (!response.ok) setError(body.error ?? "Could not load dashboard")
      else { setFirm(body.firm); setClients(body.clients ?? []) }
      setLoading(false)
    }
  }, [slug])

  async function download(userId: string, format: "csv" | "zip") {
    setBusy(`${userId}:${format}`)
    const { data, error: sessionError } = await supabase.auth.getSession().catch(() => ({ data: { session: null }, error: new Error("session unavailable") }))
    if (sessionError) { setError("Your session could not be verified."); setBusy(null); return }
    if (!data.session) { setError("Your session has expired."); setBusy(null); return }
    const response = await fetch(`/api/firm/clients/${userId}/export?format=${format}&slug=${encodeURIComponent(slug)}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } })
    if (!response.ok) { setError((await response.json()).error ?? "Download failed"); setBusy(null); return }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = format === "csv" ? "schedule-c.csv" : "audit-evidence.zip"; anchor.click(); URL.revokeObjectURL(url); setBusy(null)
  }

  async function buySeats() {
    const units = window.prompt("How many annual client seats should be added?", "10")
    if (!units) return
    const { data, error: sessionError } = await supabase.auth.getSession().catch(() => ({ data: { session: null }, error: new Error("session unavailable") })); if (sessionError || !data.session) { setError("Your session could not be verified."); return }
    const response = await fetch("/api/firm/checkout", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }, body: JSON.stringify({ units: Number(units), slug, success_url: `${window.location.origin}/partner/${slug}/dashboard` }) })
    const body = await response.json(); if (!response.ok) { setError(body.error ?? "Checkout failed"); return }; if (body.checkout_url) window.location.href = body.checkout_url
  }

  if (loading) return <div className="glass-surface rounded-3xl p-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
  if (error && !firm) return <div className="glass-surface rounded-3xl p-8 text-destructive" role="alert">{error}</div>
  if (!firm) return null
  return <div className="space-y-6"><div className="grid gap-4 md:grid-cols-3"><div className="glass-surface rounded-2xl p-6"><p className="text-sm text-muted-foreground">Seats used</p><p className="mt-2 text-3xl font-semibold text-foreground">{firm.seats_used} <span className="text-base font-normal text-muted-foreground">/ {firm.seats_purchased}</span></p></div><div className="glass-surface rounded-2xl p-6"><p className="text-sm text-muted-foreground">Seats remaining</p><p className="mt-2 text-3xl font-semibold text-primary">{Math.max(0, firm.seats_purchased - firm.seats_used)}</p></div><div className="glass-surface flex items-end rounded-2xl p-6"><Button onClick={() => void buySeats()} className="rounded-xl"><Plus className="h-4 w-4" /> Buy more seats</Button></div></div><div className="glass-surface rounded-3xl p-6 md:p-8"><h2 className="text-2xl font-semibold text-foreground">Enrolled clients</h2>{clients.length === 0 ? <p className="mt-5 text-muted-foreground">No clients have enrolled yet.</p> : <div className="mt-6 divide-y divide-border/60">{clients.map((client) => <div key={client.user_id} className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium text-foreground">{client.email ?? "Client account"}</p><p className="mt-1 text-xs text-muted-foreground">Enrolled {new Date(client.created_at).toLocaleDateString()}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy === `${client.user_id}:csv`} onClick={() => void download(client.user_id, "csv")}><FileSpreadsheet className="h-4 w-4" /> Schedule C CSV</Button><Button variant="outline" size="sm" disabled={busy === `${client.user_id}:zip`} onClick={() => void download(client.user_id, "zip")}><Archive className="h-4 w-4" /> Evidence ZIP</Button></div></div>)}</div>}{error ? <p className="mt-4 text-sm text-destructive" role="alert">{error}</p> : null}</div></div>
}
