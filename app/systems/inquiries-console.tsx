"use client"

import { useCallback, useEffect, useState } from "react"
import { Mail, RefreshCw } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

type Status = "new" | "contacted" | "qualified" | "closed"
type Inquiry = { id: string; source: "partner" | "studio"; name: string; organization: string | null; email: string; client_count?: number | null; message: string; status: Status; created_at: string }
const statuses: Status[] = ["new", "contacted", "qualified", "closed"]

export function InquiriesConsole() {
  const [token, setToken] = useState<string | null>(null)
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true); setError("")
    const { data } = await supabase.auth.getSession()
    const accessToken = data.session?.access_token ?? null
    setToken(accessToken)
    if (!accessToken) { setError("System admin access required."); setLoading(false); return }
    const response = await fetch("/api/internal/inquiries", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) setError(body.error ?? "Could not load inquiries")
    else setInquiries(body.inquiries ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  async function updateStatus(inquiry: Inquiry, status: Status) {
    if (!token) return
    const response = await fetch("/api/internal/inquiries", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id: inquiry.id, source: inquiry.source, status }) })
    if (!response.ok) { const body = await response.json().catch(() => ({})); setError(body.error ?? "Could not update status"); return }
    setInquiries((current) => current.map((item) => item.id === inquiry.id && item.source === inquiry.source ? { ...item, status } : item))
  }

  return <section className="glass-surface rounded-3xl p-6 md:p-8">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Lead pipeline</p><h2 className="mt-3 text-2xl font-semibold text-foreground">Partner + studio inquiries</h2><p className="mt-2 text-sm text-muted-foreground">Move every inbound conversation through the same follow-up stages.</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="rounded-xl"><RefreshCw className="h-4 w-4" /> Refresh</Button></div>
    {error ? <p className="mt-5 text-sm text-destructive" role="alert">{error}</p> : null}
    {loading ? <p className="mt-8 text-sm text-muted-foreground">Loading inquiries…</p> : inquiries.length === 0 ? <p className="mt-8 text-sm text-muted-foreground">No inquiries yet.</p> : <div className="mt-8 space-y-3">{inquiries.map((inquiry) => <article key={`${inquiry.source}-${inquiry.id}`} className="rounded-2xl border border-border/70 bg-background/30 p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-primary">{inquiry.source}</span><p className="font-medium text-foreground">{inquiry.name}{inquiry.organization ? ` · ${inquiry.organization}` : ""}</p></div><a className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline" href={`mailto:${inquiry.email}`}><Mail className="h-3.5 w-3.5" />{inquiry.email}</a><p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{inquiry.message}</p><p className="mt-3 text-xs text-muted-foreground">{inquiry.client_count == null ? "" : `${inquiry.client_count} approximate clients · `}{new Date(inquiry.created_at).toLocaleString()}</p></div><select aria-label={`Status for ${inquiry.name}`} value={inquiry.status} onChange={(event) => void updateStatus(inquiry, event.target.value as Status)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div></article>)}</div>}
  </section>
}
