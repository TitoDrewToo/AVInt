"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import type { Session } from "@supabase/supabase-js"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"

type ExpiryChoice = "30d" | "90d" | "1y" | "never"
type ApiKey = {
  id: string
  prefix: string
  name: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  expires_at: string | null
}

function expiryLabel(value: string | null) {
  if (!value) return "never"
  const days = Math.ceil((Date.parse(value) - Date.now()) / 86400000)
  if (days <= 0) return "expired"
  return `expires in ${days} day${days === 1 ? "" : "s"}`
}

export default function ConnectClient() {
  const [session, setSession] = useState<Session | null>(null)
  const entitlement = useEntitlement(session)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [name, setName] = useState("Claude")
  const [expiresIn, setExpiresIn] = useState<ExpiryChoice>("1y")
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => subscription.unsubscribe()
  }, [])

  async function call(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) throw new Error("Please sign in again.")
    const response = await fetch(path, {
      ...init,
      headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error ?? "Request failed")
    return body
  }

  async function load() {
    if (!session) return
    try {
      setKeys((await call("/api/mcp-keys")).keys ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load keys")
    }
  }

  useEffect(() => { void load() }, [session])

  async function create(action: "generate" | "rotate", id?: string) {
    setLoading(true)
    setError("")
    setSecret(null)
    try {
      const body = await call("/api/mcp-keys", { method: "POST", body: JSON.stringify({ action, id, name, expiresIn }) })
      setSecret(body.secret)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create key")
    } finally {
      setLoading(false)
    }
  }

  async function revoke(id: string) {
    setError("")
    try { await call("/api/mcp-keys", { method: "PATCH", body: JSON.stringify({ id }) }); await load() }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to revoke key") }
  }

  async function remove(id: string) {
    setError("")
    try { await call(`/api/mcp-keys?id=${encodeURIComponent(id)}`, { method: "DELETE" }); await load() }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to delete key") }
  }

  const paid = entitlement.tier === "pro" || entitlement.tier === "business"

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Link href="/tools/smart-storage" className="text-sm text-muted-foreground hover:text-foreground">← Smart Storage</Link>
      <div className="mt-8 space-y-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Smart Storage</p>
          <h1 className="mt-2 text-3xl font-semibold">Connect to Claude</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">Use your Smart Storage records inside Claude with a private, expiring API key.</p>
        </div>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-medium">{paid ? "Create a connector key" : "Unlock the Claude connector"}</h2>
          {!entitlement.loading && !paid ? (
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">The Claude connector is a Pro feature. Upgrade to generate and use connector keys.</p>
              <Button className="mt-4" asChild><Link href="/pricing">Upgrade to Pro</Link></Button>
            </div>
          ) : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name" maxLength={80} />
                <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value as ExpiryChoice)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="30d">Expires in 30 days</option>
                  <option value="90d">Expires in 90 days</option>
                  <option value="1y">Expires in 1 year</option>
                  <option value="never">Never expires</option>
                </select>
              </div>
              <Button className="mt-3" onClick={() => void create("generate")} disabled={loading || !name.trim()}>{loading ? "Creating…" : "Generate key"}</Button>
            </>
          )}
          {secret && <div className="mt-4 rounded-lg border border-primary/40 bg-primary/5 p-4"><p className="text-sm font-medium">Copy this key now — it will not be shown again.</p><code className="mt-2 block break-all text-sm">{secret}</code></div>}
        </section>

        <section className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-medium">Your keys</h2>
          <div className="mt-4 space-y-3">
            {keys.length === 0 && <p className="text-sm text-muted-foreground">No connector keys yet.</p>}
            {keys.map((key) => (
              <div key={key.id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{key.name} <span className="font-mono text-muted-foreground">{key.prefix}…</span></p>
                    <p className="text-xs text-muted-foreground">Created {new Date(key.created_at).toLocaleDateString()} · Last used {key.last_used_at ? new Date(key.last_used_at).toLocaleString() : "never"} · {expiryLabel(key.expires_at)}</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!key.revoked_at && <><Button variant="outline" size="sm" onClick={() => void create("rotate", key.id)} disabled={loading}>Rotate</Button><Button variant="outline" size="sm" onClick={() => void revoke(key.id)}>Revoke</Button></>}
                    <Button variant="outline" size="sm" onClick={() => void remove(key.id)}>Delete</Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </main>
  )
}
