"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChevronRight, CircleAlert, RefreshCw, Search, ShieldCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabase"
import { ERROR_GROUP_STATUSES, type ErrorGroupStatus } from "@/lib/system-admin"
import { updateErrorGroupStatus } from "./actions"

type Group = {
  fingerprint: string
  title: string
  first_seen: string
  last_seen: string
  count: number
  status: ErrorGroupStatus
}

type Event = {
  id: string
  occurred_at: string
  occurred_at_manila: string
  user_id: string | null
  tool: string | null
  fn: string | null
  action: string | null
  route: string | null
  level: "error" | "warn" | "info"
  message: string
  stack: string | null
  fingerprint: string
  context: Record<string, unknown> | null
}

type GroupView = Group & {
  events: Event[]
  tools: string[]
  levels: string[]
  where: string
}

function utcLabel(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Unknown UTC"
  return `${parsed.toISOString().replace("T", " ").replace(".000Z", " UTC")} UTC`
}

function manilaLabel(value: string) {
  const normalized = value.replace("T", " ").replace(/Z$/, "").replace(/\.\d+$/, "")
  return `${normalized} Asia/Manila (GMT+8)`
}

function dualTimestamp(utc: string, manila?: string) {
  const manilaValue = manila ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(utc)).replace(", ", " ")
  return (
    <span className="space-y-0.5 text-xs text-muted-foreground">
      <span className="block">{utcLabel(utc)}</span>
      <span className="block">{manilaLabel(manilaValue)}</span>
    </span>
  )
}

function whereLabel(event: Pick<Event, "tool" | "fn" | "action" | "route">) {
  const source = [event.tool, event.fn, event.action].filter(Boolean).join(" · ")
  return [source || "Unknown source", event.route].filter(Boolean).join(" · ")
}

function statusClass(status: ErrorGroupStatus) {
  if (status === "resolved") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
  if (status === "ignored") return "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300"
  if (status === "triaged") return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
  return "border-primary/30 bg-primary/10 text-primary"
}

export default function SystemsPage() {
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">("checking")
  const [groups, setGroups] = useState<GroupView[]>([])
  const [selectedFingerprint, setSelectedFingerprint] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<"all" | ErrorGroupStatus>("all")
  const [toolFilter, setToolFilter] = useState("all")
  const [levelFilter, setLevelFilter] = useState("all")
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: groupRows, error: groupError }, { data: eventRows, error: eventError }] = await Promise.all([
      supabase.from("error_groups").select("fingerprint, title, first_seen, last_seen, count, status").order("last_seen", { ascending: false }),
      supabase.from("error_events").select("id, occurred_at, occurred_at_manila, user_id, tool, fn, action, route, level, message, stack, fingerprint, context").order("occurred_at", { ascending: false }).limit(2_000),
    ])
    if (groupError || eventError) {
      setError(groupError?.message ?? eventError?.message ?? "Unable to load monitoring data")
      setLoading(false)
      return
    }

    const events = (eventRows ?? []) as Event[]
    const byFingerprint = new Map<string, Event[]>()
    for (const event of events) {
      const list = byFingerprint.get(event.fingerprint) ?? []
      list.push(event)
      byFingerprint.set(event.fingerprint, list)
    }
    const views = ((groupRows ?? []) as Group[]).map((group) => {
      const groupEvents = byFingerprint.get(group.fingerprint) ?? []
      const tools = [...new Set(groupEvents.map((event) => event.tool).filter(Boolean) as string[])]
      const levels = [...new Set(groupEvents.map((event) => event.level))]
      return {
        ...group,
        status: ERROR_GROUP_STATUSES.includes(group.status) ? group.status : "new",
        events: groupEvents,
        tools,
        levels,
        where: whereLabel(groupEvents[0] ?? { tool: null, fn: null, action: null, route: null }),
      }
    })
    setGroups(views)
    setLoading(false)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        if (!cancelled) {
          setAccess("denied")
          window.location.replace("/")
        }
        return
      }
      const response = await fetch("/api/systems/access", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      }).catch(() => null)
      if (!response?.ok) {
        if (!cancelled) {
          setAccess("denied")
          window.location.replace("/")
        }
        return
      }
      if (!cancelled) {
        setAccess("allowed")
        await loadGroups()
      }
    })()
    return () => { cancelled = true }
  }, [loadGroups])

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase()
    return groups.filter((group) => {
      if (statusFilter !== "all" && group.status !== statusFilter) return false
      if (toolFilter !== "all" && !group.tools.includes(toolFilter)) return false
      if (levelFilter !== "all" && !group.levels.includes(levelFilter)) return false
      if (!query) return true
      return group.title.toLowerCase().includes(query) || group.events.some((event) => event.message.toLowerCase().includes(query))
    })
  }, [groups, levelFilter, search, statusFilter, toolFilter])

  const selectedGroup = groups.find((group) => group.fingerprint === selectedFingerprint) ?? null
  const tools = [...new Set(groups.flatMap((group) => group.tools))].sort()

  async function changeStatus(status: ErrorGroupStatus) {
    if (!selectedGroup) return
    setUpdating(true)
    const { data: { session } } = await supabase.auth.getSession()
    const result = await updateErrorGroupStatus(selectedGroup.fingerprint, status, session?.access_token)
    if (!result.ok) setError(result.error)
    else await loadGroups()
    setUpdating(false)
  }

  if (access !== "allowed") {
    return access === "checking" ? <div className="min-h-screen bg-background" /> : null
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground md:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-primary">
              <ShieldCheck className="h-4 w-4" /> Systems
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Error monitoring</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Grouped production failures and occurrence context. Read and triage only; AI diagnosis and execution are reserved for later phases.
            </p>
          </div>
          <Button variant="outline" onClick={() => void loadGroups()} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </header>

        <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
          Alerting is deferred to Phase 2.5 until Resend email delivery is configured.
        </div>

        <section className="mb-5 grid gap-3 rounded-2xl border border-border bg-card/60 p-4 md:grid-cols-4">
          <label className="relative md:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search issue or message" className="h-9 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary" />
          </label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="all">All statuses</option>
            {ERROR_GROUP_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select value={toolFilter} onChange={(event) => setToolFilter(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="all">All tools</option>
            {tools.map((tool) => <option key={tool} value={tool}>{tool}</option>)}
          </select>
          <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)} className="h-9 rounded-lg border border-border bg-background px-3 text-sm">
            <option value="all">All levels</option>
            <option value="error">error</option><option value="warn">warn</option><option value="info">info</option>
          </select>
        </section>

        {error && <div className="mb-5 flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"><AlertTriangle className="h-4 w-4" />{error}</div>}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]">
          <section className="overflow-hidden rounded-2xl border border-border bg-card/60">
            <div className="border-b border-border px-5 py-4"><h2 className="font-medium">Error groups <span className="ml-2 text-sm text-muted-foreground">{filteredGroups.length}</span></h2></div>
            <div className="hidden grid-cols-[minmax(170px,1.4fr)_minmax(160px,1fr)_70px_180px_100px] gap-3 border-b border-border px-5 py-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground lg:grid">
              <span>Issue</span><span>Where</span><span>Count</span><span>First / last seen</span><span>Status</span>
            </div>
            {loading ? <div className="px-5 py-12 text-center text-sm text-muted-foreground">Loading error groups…</div> : filteredGroups.length === 0 ? <div className="px-5 py-12 text-center text-sm text-muted-foreground">No matching error groups.</div> : filteredGroups.map((group) => (
              <button key={group.fingerprint} onClick={() => setSelectedFingerprint(group.fingerprint)} className={`grid w-full gap-3 border-b border-border px-5 py-4 text-left transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(170px,1.4fr)_minmax(160px,1fr)_70px_180px_100px] ${selectedFingerprint === group.fingerprint ? "bg-primary/5" : ""}`}>
                <span className="min-w-0"><span className="flex items-start gap-2 font-medium"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span className="truncate">{group.title}</span></span><span className="mt-1 block truncate pl-6 font-mono text-[11px] text-muted-foreground">{group.fingerprint}</span></span>
                <span className="truncate text-sm text-muted-foreground">{group.where}</span>
                <span className="text-sm font-medium">{group.count}</span>
                <span>{dualTimestamp(group.first_seen)}<span className="my-1 block text-muted-foreground/50">↓</span>{dualTimestamp(group.last_seen)}</span>
                <span><span className={`inline-flex rounded-full border px-2 py-1 text-[11px] capitalize ${statusClass(group.status)}`}>{group.status}</span></span>
              </button>
            ))}
          </section>

          <aside className="rounded-2xl border border-border bg-card/60">
            <div className="border-b border-border px-5 py-4"><h2 className="font-medium">Occurrences</h2><p className="mt-1 text-xs text-muted-foreground">{selectedGroup ? `${selectedGroup.count} total · showing recent captured events` : "Select a group to inspect occurrences"}</p></div>
            {!selectedGroup ? <div className="px-5 py-12 text-center text-sm text-muted-foreground">Choose an error group.</div> : <>
              <div className="border-b border-border px-5 py-4"><div className="mb-3 text-sm font-medium">Triage status</div><div className="flex flex-wrap gap-2">{ERROR_GROUP_STATUSES.map((status) => <Button key={status} size="sm" variant={selectedGroup.status === status ? "default" : "outline"} onClick={() => void changeStatus(status)} disabled={updating}>{status}</Button>)}</div></div>
              <div className="max-h-[720px] overflow-y-auto">
                {selectedGroup.events.length === 0 ? <div className="px-5 py-10 text-sm text-muted-foreground">No recent event details available.</div> : selectedGroup.events.map((event) => (
                  <article key={event.id} className="border-b border-border px-5 py-5">
                    <div className="mb-3 flex items-start justify-between gap-3"><span className="rounded-full border border-border px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">{event.level}</span>{dualTimestamp(event.occurred_at, event.occurred_at_manila)}</div>
                    <p className="break-words text-sm font-medium">{event.message}</p>
                    <p className="mt-2 break-words text-xs text-muted-foreground">{whereLabel(event)}</p>
                    <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">user_id: {event.user_id ?? "anonymous"}</p>
                    {event.stack && <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">{event.stack}</pre>}
                    {event.context && <details className="mt-3"><summary className="cursor-pointer text-xs text-muted-foreground">Context</summary><pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-muted/50 p-3 text-[11px] leading-relaxed text-muted-foreground">{JSON.stringify(event.context, null, 2)}</pre></details>}
                  </article>
                ))}
              </div>
            </>}
          </aside>
        </div>

        <section className="mt-6 hidden rounded-2xl border border-dashed border-border bg-muted/20 p-5 lg:block">
          <div className="grid grid-cols-4 gap-4 text-xs text-muted-foreground"><div><span className="font-medium text-foreground">AI analysis</span><br />Reserved for Phase 3</div><div><span className="font-medium text-foreground">Proposed fix</span><br />Reserved for Phase 3</div><div><span className="font-medium text-foreground">Risk / confidence</span><br />Reserved for Phase 3</div><div><span className="font-medium text-foreground">Action</span><br />Execute is intentionally disabled</div></div>
        </section>
      </div>
    </main>
  )
}
