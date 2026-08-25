"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Archive, Mail, RefreshCw, Search } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

type Status = "new" | "contacted" | "qualified" | "closed"
type Inquiry = { id: string; source: "partner" | "studio"; name: string; organization: string | null; email: string; client_count?: number | null; message: string; status: Status; created_at: string }
const statuses: Status[] = ["new", "contacted", "qualified", "closed"]

function formatDate(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

export function InquiriesConsole({ view = "active" }: { view?: "active" | "archive" }) {
  const [token, setToken] = useState<string | null>(null)
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")

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

  const visible = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return inquiries.filter((inquiry) => view === "archive" ? inquiry.status === "closed" : inquiry.status !== "closed").filter((inquiry) => !normalizedQuery || [inquiry.name, inquiry.email, inquiry.organization, inquiry.message, inquiry.source].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery))
  }, [inquiries, query, view])
  const activeCount = inquiries.filter((inquiry) => inquiry.status !== "closed").length
  const archivedCount = inquiries.length - activeCount
  const heading = view === "archive" ? "Archived inquiries" : "Partner + studio inquiries"
  const description = view === "archive" ? "Closed conversations remain available for reference without crowding the active pipeline." : "Keep active conversations visible, then close them when no further follow-up is needed."

  return <section aria-labelledby="inquiries-heading" className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="glass-surface rounded-2xl p-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Active</p><p className="mt-2 text-3xl font-semibold text-foreground">{activeCount}</p><p className="mt-1 text-xs text-muted-foreground">Needs a next step</p></div>
      <div className="glass-surface rounded-2xl p-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Archived</p><p className="mt-2 text-3xl font-semibold text-foreground">{archivedCount}</p><p className="mt-1 text-xs text-muted-foreground">Closed conversations</p></div>
      <div className="glass-surface rounded-2xl p-5"><p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Sources</p><p className="mt-2 text-3xl font-semibold text-primary">{new Set(inquiries.map((inquiry) => inquiry.source)).size}</p><p className="mt-1 text-xs text-muted-foreground">Partner and studio</p></div>
    </div>
    <div className="glass-surface rounded-3xl p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">{view === "archive" ? "Conversation archive" : "Lead pipeline"}</p><h2 id="inquiries-heading" className="mt-3 text-2xl font-semibold text-foreground md:text-3xl">{heading}</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="rounded-xl"><RefreshCw className="h-4 w-4" /> Refresh</Button></div>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><span className="sr-only">Search inquiries</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, organization, or message" className="w-full rounded-xl border border-border bg-background/50 py-2.5 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary" /></label><Link href={view === "archive" ? "/systems/inquiries" : "/systems/inquiries/archive"} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary">{view === "archive" ? "Active inquiries" : "View archive"}<Archive className="h-4 w-4" /></Link></div>
      {error ? <p className="mt-5 text-sm text-destructive" role="alert">{error}</p> : null}
      {loading ? <p className="mt-8 text-sm text-muted-foreground">Loading inquiries…</p> : !visible.length ? <p className="mt-8 rounded-2xl border border-dashed border-border/70 p-10 text-center text-sm text-muted-foreground">{query ? "No inquiries match that search." : view === "archive" ? "No archived inquiries yet." : "No active inquiries yet."}</p> : <div className="mt-6 space-y-3">{visible.map((inquiry) => <article key={`${inquiry.source}-${inquiry.id}`} className="rounded-2xl border border-border/70 bg-background/30 p-4 md:p-5"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-primary">{inquiry.source}</span><p className="font-medium text-foreground">{inquiry.name}{inquiry.organization ? ` · ${inquiry.organization}` : ""}</p></div><a className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline" href={`mailto:${inquiry.email}`}><Mail className="h-3.5 w-3.5" />{inquiry.email}</a><p className="mt-3 max-w-4xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{inquiry.message}</p><p className="mt-3 text-xs text-muted-foreground">{inquiry.client_count == null ? "" : `${inquiry.client_count} approximate clients · `}{formatDate(inquiry.created_at)}</p></div><label className="shrink-0 text-xs text-muted-foreground"><span className="sr-only">Status for {inquiry.name}</span><select aria-label={`Status for ${inquiry.name}`} value={inquiry.status} onChange={(event) => void updateStatus(inquiry, event.target.value as Status)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label></div></article>)}</div>}
    </div>
  </section>
}
