"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowUpRight, Check, Clipboard, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"

type InquiryStatus = "new" | "contacted" | "qualified" | "closed"
type Inquiry = { id: string; name: string; firm: string; email: string; client_count: number | null; message: string; status: InquiryStatus; created_at: string }
type Firm = { id: string; name: string; slug: string; status: string; founding: boolean; seats_purchased: number; seats_used: number; created_at: string }

const statuses: InquiryStatus[] = ["new", "contacted", "qualified", "closed"]

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 63)
}

export function PartnerAdminConsole() {
  const [token, setToken] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [firms, setFirms] = useState<Firm[]>([])
  const [copied, setCopied] = useState(false)
  const [createdLink, setCreatedLink] = useState("")
  const [inviteSent, setInviteSent] = useState(true)
  const [provisioning, setProvisioning] = useState(false)
  const [form, setForm] = useState({ name: "", slug: "", adminEmail: "", logoUrl: "", notes: "" })

  const load = useCallback(async () => {
    setLoading(true); setError("")
    const { data: sessionData } = await supabase.auth.getSession()
    const accessToken = sessionData.session?.access_token ?? null
    setToken(accessToken)
    if (!accessToken) { setForbidden(true); setLoading(false); return }
    const response = await fetch("/api/internal/partners", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" })
    const body = await response.json().catch(() => ({}))
    if (response.status === 403) setForbidden(true)
    else if (!response.ok) setError(body.error ?? "Could not load partner console")
    else { setInquiries(body.inquiries ?? []); setFirms(body.firms ?? []) }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const counts = useMemo(() => ({ leads: inquiries.length, activeFirms: firms.filter((firm) => firm.status === "active").length, seats: firms.reduce((sum, firm) => sum + Math.max(0, firm.seats_purchased - firm.seats_used), 0) }), [firms, inquiries])

  async function updateStatus(id: string, status: InquiryStatus) {
    if (!token) return
    const response = await fetch("/api/internal/partners", { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) { setError(body.error ?? "Could not update status"); return }
    setInquiries((current) => current.map((inquiry) => inquiry.id === id ? { ...inquiry, status } : inquiry))
  }

  async function provision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token) return
    setProvisioning(true); setError(""); setCreatedLink(""); setInviteSent(true)
    const response = await fetch("/api/internal/firms", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name, slug: form.slug, admin_email: form.adminEmail, logo_url: form.logoUrl || undefined, notes: form.notes || undefined }) })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) { setError(body.error ?? "Could not provision firm"); setProvisioning(false); return }
    setCreatedLink(`https://www.avintph.com/partner/${body.firm.slug}`)
    setInviteSent(body.invite_sent !== false)
    setForm({ name: "", slug: "", adminEmail: "", logoUrl: "", notes: "" })
    setProvisioning(false)
    await load()
  }

  async function copyLink() {
    await navigator.clipboard.writeText(createdLink); setCopied(true); window.setTimeout(() => setCopied(false), 1800)
  }

  if (loading) return <div className="glass-surface rounded-3xl p-10"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
  if (forbidden) return <div className="glass-surface rounded-3xl p-10" role="alert"><ShieldCheck className="h-6 w-6 text-destructive" /><h1 className="mt-5 text-2xl font-semibold text-foreground">System admin access required</h1><p className="mt-2 text-muted-foreground">This console is restricted to the AVIntelligence system administrator.</p></div>

  return <div className="space-y-8">
    <div className="grid gap-4 sm:grid-cols-3"><div className="glass-surface rounded-2xl p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Inbound leads</p><p className="mt-2 text-3xl font-semibold text-foreground">{counts.leads}</p></div><div className="glass-surface rounded-2xl p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Active firms</p><p className="mt-2 text-3xl font-semibold text-foreground">{counts.activeFirms}</p></div><div className="glass-surface rounded-2xl p-5"><p className="text-xs uppercase tracking-wider text-muted-foreground">Seats remaining</p><p className="mt-2 text-3xl font-semibold text-primary">{counts.seats}</p></div></div>

    <section className="glass-surface rounded-3xl p-6 md:p-8"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Inbound channel</p><h2 className="mt-3 text-2xl font-semibold text-foreground">Partner inquiries</h2></div><Button variant="outline" size="sm" onClick={() => void load()} className="rounded-xl"><RefreshCw className="h-4 w-4" /> Refresh</Button></div><div className="mt-6 space-y-3">{inquiries.length === 0 ? <p className="text-sm text-muted-foreground">No partner inquiries yet.</p> : inquiries.map((inquiry) => <article key={inquiry.id} className="rounded-2xl border border-border/70 bg-background/30 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><p className="font-medium text-foreground">{inquiry.firm} · {inquiry.name}</p><a className="text-sm text-primary hover:underline" href={`mailto:${inquiry.email}`}>{inquiry.email}</a><p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{inquiry.message}</p><p className="mt-3 text-xs text-muted-foreground">{inquiry.client_count == null ? "Client count not provided" : `${inquiry.client_count} approximate clients`} · {new Date(inquiry.created_at).toLocaleString()}</p></div><select aria-label={`Status for ${inquiry.firm}`} value={inquiry.status} onChange={(event) => void updateStatus(inquiry.id, event.target.value as InquiryStatus)} className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground">{statuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></div></article>)}</div></section>

    <section className="glass-surface rounded-3xl p-6 md:p-8"><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Provisioning</p><h2 className="mt-3 text-2xl font-semibold text-foreground">Create a partner firm</h2><p className="mt-2 text-sm text-muted-foreground">Creates the firm slug, sends the Supabase admin invite, and gives you the client-facing link.</p><form onSubmit={provision} className="mt-6 grid gap-4 md:grid-cols-2"><label className="grid gap-2 text-sm text-foreground">Firm name<input required value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value, slug: current.slug || slugify(event.target.value) }))} className="rounded-xl border border-border bg-background/60 px-4 py-3 outline-none focus:border-primary" /></label><label className="grid gap-2 text-sm text-foreground">Slug<input required pattern="[a-z0-9]+(-[a-z0-9]+)*" value={form.slug} onChange={(event) => setForm((current) => ({ ...current, slug: slugify(event.target.value) }))} className="rounded-xl border border-border bg-background/60 px-4 py-3 outline-none focus:border-primary" /></label><label className="grid gap-2 text-sm text-foreground">Admin email<input required type="email" value={form.adminEmail} onChange={(event) => setForm((current) => ({ ...current, adminEmail: event.target.value }))} className="rounded-xl border border-border bg-background/60 px-4 py-3 outline-none focus:border-primary" /></label><label className="grid gap-2 text-sm text-foreground">Logo URL <span className="text-xs text-muted-foreground">optional</span><input type="url" value={form.logoUrl} onChange={(event) => setForm((current) => ({ ...current, logoUrl: event.target.value }))} className="rounded-xl border border-border bg-background/60 px-4 py-3 outline-none focus:border-primary" /></label><label className="grid gap-2 text-sm text-foreground md:col-span-2">Notes <span className="text-xs text-muted-foreground">optional</span><textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className="min-h-24 rounded-xl border border-border bg-background/60 px-4 py-3 outline-none focus:border-primary" /></label><div className="md:col-span-2"><Button type="submit" disabled={provisioning} className="rounded-xl">{provisioning ? "Provisioning…" : "Provision firm"}<ArrowUpRight className="h-4 w-4" /></Button></div></form>{createdLink ? <div className="mt-6 rounded-2xl border border-primary/30 bg-primary/5 p-4"><p className="text-xs font-medium uppercase tracking-wider text-primary">Firm link ready</p><div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center"><code className="flex-1 select-all break-all rounded-lg bg-background/60 px-3 py-2 text-sm text-foreground">{createdLink}</code><Button type="button" variant="outline" onClick={() => void copyLink()} className="rounded-xl">{copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}{copied ? "Copied" : "Copy link"}</Button></div><p className="mt-3 text-xs text-muted-foreground">{inviteSent ? "The Supabase admin invitation was sent to the address provided." : "The firm was created, but the invitation could not be sent. Copy the link and resend the invite from Supabase Auth."}</p></div> : null}</section>

    <section className="glass-surface rounded-3xl p-6 md:p-8"><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Partner channel</p><h2 className="mt-3 text-2xl font-semibold text-foreground">Firms overview</h2><div className="mt-6 overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="pb-3">Firm</th><th className="pb-3">Slug</th><th className="pb-3">Status</th><th className="pb-3">Seats</th><th className="pb-3">Created</th><th className="pb-3" /></tr></thead><tbody className="divide-y divide-border/60">{firms.map((firm) => <tr key={firm.id}><td className="py-4 font-medium text-foreground">{firm.name}{firm.founding ? <span className="ml-2 rounded-full bg-primary/10 px-2 py-1 text-[10px] text-primary">founding</span> : null}</td><td className="py-4 font-mono text-xs text-muted-foreground">{firm.slug}</td><td className="py-4 text-muted-foreground">{firm.status}</td><td className="py-4 text-muted-foreground">{firm.seats_used} / {firm.seats_purchased} <span className="text-xs">({Math.max(0, firm.seats_purchased - firm.seats_used)} remaining)</span></td><td className="py-4 text-muted-foreground">{new Date(firm.created_at).toLocaleDateString()}</td><td className="py-4 text-right"><a className="inline-flex items-center gap-1 text-primary hover:underline" href={`/partner/${firm.slug}/dashboard`}>Dashboard <ExternalLink className="h-3.5 w-3.5" /></a></td></tr>)}</tbody></table></div></section>
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
  </div>
}
