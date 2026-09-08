"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, Download, RefreshCw, Search, ShieldCheck, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { supabase } from "@/lib/supabase"

type Evidence = {
  id: string
  correlation_id: string
  account_id: string
  file_id: string | null
  filename: string
  file_size: number | null
  sha256: string | null
  declared_mime: string | null
  detected_mime: string | null
  event_type: string
  stage: string
  outcome: "approved" | "quarantined" | "rejected" | "scan_failed" | null
  reason_code: string | null
  safe_reason: string | null
  signals: Record<string, unknown>
  prescan_version: string
  ai_provider: string | null
  ai_model: string | null
  duration_ms: number | null
  storage_action_intended: string | null
  storage_action_completed: string | null
  sealed_at: string
  previous_event_hash: string | null
  event_hash: string
  created_at: string
}

type SecurityData = {
  window: { from: string; eventLimit: number; truncated: boolean }
  posture: { counts: Record<string, number>; claimed: number; evidenceCoverage: number | null; incompleteSequences: number; openNotices: number; unresolvedFiles: number; lastSuccessfulPrescan: string | null; activeVersion: string | null; evidenceArchiveEligible: number }
  reasons: Array<{ reason: string; count: number }>
  repeatedHashes: Array<{ hash: string; attempts: number; accounts: number; lastSeen: string }>
  incomplete: Evidence[]
  decisions: Evidence[]
  unresolved: Array<{ id: string; user_id: string; filename: string; file_type: string; file_size: number | null; upload_status: string; scan_reason: string | null; sha256: string | null; scanned_at: string | null; prescan_claimed_at: string | null }>
  retention: Array<{ file_id: string; outcome: "quarantined" | "rejected"; status: "retained" | "deleting" | "released_to_rescan" | "bytes_deleted"; quarantined_at: string; bytes_expires_at: string; bytes_deleted_at: string | null; evidence_hold_at: string | null; evidence_hold_by: string | null; evidence_hold_reason: string | null; last_rescan_requested_at: string | null }>
  adminAudit: Array<{ id: string; actor_user_id: string | null; action: string; file_id: string | null; correlation_id: string | null; metadata: Record<string, unknown>; created_at: string; event_hash: string }>
}

const formatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" })
const number = new Intl.NumberFormat("en-US")

function date(value: string | null) { return value ? formatter.format(new Date(value)) : "Not recorded" }
function pct(value: number | null) { return value == null ? "—" : `${(value * 100).toFixed(1)}%` }
function reasonLabel(value: string | null) { return value ? value.replaceAll("_", " ") : "No rejection reason" }

export function SecurityOperations() {
  const [data, setData] = useState<SecurityData | null>(null)
  const [timeline, setTimeline] = useState<Evidence[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [outcome, setOutcome] = useState("all")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [actionFileId, setActionFileId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const authorizedFetch = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return null
    const headers = new Headers(init.headers)
    headers.set("Authorization", `Bearer ${session.access_token}`)
    return fetch(url, { ...init, headers, cache: "no-store" })
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const response = await authorizedFetch("/api/systems/security")
    if (!response?.ok) { setError("Smart Security evidence is unavailable."); setLoading(false); return }
    setData(await response.json() as SecurityData)
    setLoading(false)
  }, [authorizedFetch])

  async function openTimeline(correlationId: string) {
    setSelected(correlationId)
    setTimeline([])
    const response = await authorizedFetch(`/api/systems/security?correlation_id=${encodeURIComponent(correlationId)}`)
    if (!response?.ok) return
    const payload = await response.json() as { events: Evidence[] }
    setTimeline(payload.events)
  }

  async function rescanQuarantined(fileId: string, filename: string) {
    if (!window.confirm(`Return ${filename} to the protected inbox and run every current prescan check again? This does not bypass any rule.`)) return
    setActionFileId(fileId)
    setActionError(null)
    const response = await authorizedFetch(`/api/systems/security/quarantine/${encodeURIComponent(fileId)}/rescan`, { method: "POST" })
    if (!response) {
      setActionError("Administrator session is unavailable.")
      setActionFileId(null)
      return
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null
      setActionError(payload?.error ?? "The re-scan could not start.")
      setActionFileId(null)
      return
    }
    await load()
    setActionFileId(null)
  }

  async function setEvidenceHold(fileId: string, filename: string, held: boolean) {
    const reason = held ? window.prompt(`Why should ${filename} be preserved beyond its normal byte-retention window?`)?.trim() : ""
    if (held && !reason) return
    if (!held && !window.confirm(`Release the investigation hold on ${filename}? If its retention window has expired, the bytes become eligible for deletion.`)) return
    setActionFileId(fileId)
    setActionError(null)
    const response = await authorizedFetch(`/api/systems/security/quarantine/${encodeURIComponent(fileId)}/hold`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hold: held, ...(held ? { reason } : {}) }),
    })
    if (!response?.ok) {
      const payload = response ? await response.json().catch(() => null) as { error?: string } | null : null
      setActionError(payload?.error ?? "The investigation hold could not be updated.")
      setActionFileId(null)
      return
    }
    await load()
    setActionFileId(null)
  }

  async function exportEvidence() {
    setExporting(true)
    setActionError(null)
    const response = await authorizedFetch("/api/systems/security/export")
    if (!response?.ok) {
      setActionError("The evidence export could not be created.")
      setExporting(false)
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `avint-prescan-evidence-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
    setExporting(false)
  }

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (data?.decisions ?? []).filter((event) => {
      if (outcome !== "all" && event.outcome !== outcome) return false
      return !needle || [event.filename, event.reason_code, event.detected_mime, event.sha256, event.account_id].some((value) => value?.toLowerCase().includes(needle))
    })
  }, [data, outcome, query])

  if (loading) return <div className="glass-surface rounded-3xl p-8 text-sm text-muted-foreground">Loading Smart Security evidence…</div>
  if (error || !data) return <div className="glass-surface rounded-3xl p-8"><p className="text-sm text-destructive">{error ?? "Security evidence unavailable."}</p><Button variant="outline" size="sm" onClick={() => void load()} className="mt-5 gap-2"><RefreshCw className="h-4 w-4" />Retry</Button></div>

  const counts = data.posture.counts
  const retentionByFile = new Map(data.retention.map((item) => [item.file_id, item]))
  const retainedBlockedFiles = data.unresolved.filter((file) => file.upload_status === "quarantined" || file.upload_status === "rejected")
  return <section className="space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Internal security operations</p><h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Prescan evidence, without the theatre.</h2><p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">A 30-day view of upload decisions, interrupted sequences, quarantine state, repeated hashes, and verifiable event seals. External checkpointing and legal review remain required before calling this legal chain-of-custody evidence.</p></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={exporting} onClick={() => void exportEvidence()} className="gap-2"><Download className="h-4 w-4" />{exporting ? "Exporting…" : "Export evidence"}</Button><Button variant="outline" size="sm" onClick={() => void load()} className="gap-2"><RefreshCw className="h-4 w-4" />Refresh</Button></div></div>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Approved" value={number.format(counts.approved ?? 0)} detail={`Last pass · ${date(data.posture.lastSuccessfulPrescan)}`} tone="good" />
      <Metric label="Blocked" value={number.format((counts.quarantined ?? 0) + (counts.rejected ?? 0))} detail={`${counts.quarantined ?? 0} quarantined · ${counts.rejected ?? 0} rejected`} tone="risk" />
      <Metric label="Retry required" value={number.format(counts.scan_failed ?? 0)} detail={`${data.posture.openNotices} open customer notices`} tone="warn" />
      <Metric label="Evidence coverage" value={pct(data.posture.evidenceCoverage)} detail={`${data.posture.incompleteSequences} incomplete sequences · ${data.posture.activeVersion ?? "version unknown"}`} tone={data.posture.incompleteSequences ? "warn" : "good"} />
    </div>

    {data.posture.incompleteSequences > 0 ? <div className="flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-500/10 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><div><p className="font-medium">{data.posture.incompleteSequences} action {data.posture.incompleteSequences === 1 ? "sequence needs" : "sequences need"} reconciliation</p><p className="mt-1 text-xs text-muted-foreground">An action was intended but no terminal event was recorded. The daily reconciler checks claims older than 30 minutes.</p></div></div> : null}

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,0.8fr)]">
      <div className="glass-surface overflow-hidden rounded-2xl">
        <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 pl-9 text-xs" placeholder="Search filename, reason, MIME, hash, or account" aria-label="Search security decisions" /></div><select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-xs" aria-label="Filter by outcome"><option value="all">All outcomes</option><option value="approved">Approved</option><option value="quarantined">Quarantined</option><option value="rejected">Rejected</option><option value="scan_failed">Retry required</option></select></div>
        <div className="max-h-[34rem] divide-y divide-border overflow-y-auto">
          {filtered.length ? filtered.map((event) => <button key={event.id} type="button" onClick={() => void openTimeline(event.correlation_id)} className="group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60"><OutcomeIcon outcome={event.outcome} /><div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate text-sm font-medium">{event.filename}</span><span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">{event.outcome === "scan_failed" ? "retry" : event.outcome}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{reasonLabel(event.reason_code)} · {event.detected_mime ?? event.declared_mime ?? "MIME unknown"} · account {event.account_id.slice(0, 8)}…</p></div><div className="flex items-center gap-2"><time className="hidden text-[10px] text-muted-foreground md:block">{date(event.created_at)}</time><ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div></button>) : <p className="p-8 text-center text-sm text-muted-foreground">No matching decisions in this 30-day evidence window.</p>}
        </div>
      </div>

      <div className="space-y-5">
        <Panel title="Decision timeline" detail={selected ? `Correlation ${selected.slice(0, 8)}…` : "Select a decision to inspect its sequence."}>
          {timeline.length ? <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[7px] before:top-2 before:w-px before:bg-border">{timeline.map((event) => <li key={event.id} className="relative pl-7"><span className="absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-background bg-primary" /><p className="font-mono text-[10px] uppercase tracking-wide text-primary">{event.event_type.replace("prescan.", "")}</p><p className="mt-1 text-xs text-muted-foreground">{event.safe_reason ?? event.stage} · {date(event.created_at)}</p>{event.ai_provider ? <p className="mt-1 text-[10px] text-muted-foreground/70">{event.ai_provider} · {event.ai_model}</p> : null}<p className="mt-1 font-mono text-[9px] text-muted-foreground/60" title={event.event_hash}>seal {event.event_hash.slice(0, 12)}…</p></li>)}</ol> : <p className="text-xs text-muted-foreground">No timeline selected.</p>}
        </Panel>
        <Panel title="Blocked-file retention" detail="Security quarantines retain private bytes for 30 days; ordinary rejections retain them for 24 hours. Investigation holds suspend deletion. Re-scan never bypasses prescan.">
          {actionError ? <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-700 dark:text-red-300">{actionError}</p> : null}
          {retainedBlockedFiles.length ? <div className="divide-y divide-border">{retainedBlockedFiles.slice(0, 8).map((file) => {
            const retention = retentionByFile.get(file.id)
            const available = retention?.status === "retained" && !retention.bytes_deleted_at
            const held = Boolean(retention?.evidence_hold_at)
            return <div key={file.id} className="py-3 first:pt-0 last:pb-0"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-medium">{file.filename}</p><p className="mt-1 text-[10px] text-muted-foreground">{retention ? `${retention.outcome} · ${held ? `held since ${date(retention.evidence_hold_at)}` : `${retention.status.replaceAll("_", " ")} · expires ${date(retention.bytes_expires_at)}`}` : "Retention state missing — investigate"}</p>{held && retention?.evidence_hold_reason ? <p className="mt-1 line-clamp-2 text-[10px] text-amber-700 dark:text-amber-300">{retention.evidence_hold_reason}</p> : null}</div>{available ? <div className="flex shrink-0 flex-wrap justify-end gap-1.5">{file.upload_status === "quarantined" && !held ? <Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" disabled={actionFileId === file.id} title="Return the private bytes to the inbox and run all prescan checks" onClick={() => void rescanQuarantined(file.id, file.filename)}>Re-scan</Button> : null}<Button type="button" variant="outline" size="sm" className="h-7 text-[10px]" disabled={actionFileId === file.id} title={held ? "Release the investigation hold" : "Prevent scheduled deletion while this case is investigated"} onClick={() => void setEvidenceHold(file.id, file.filename, !held)}>{actionFileId === file.id ? "Updating…" : held ? "Release hold" : "Hold"}</Button></div> : null}</div></div>
          })}</div> : <p className="text-xs text-muted-foreground">No rejected or quarantined files currently retain private bytes.</p>}
        </Panel>
        <Panel title="Evidence retention" detail="Metadata older than 180 days becomes archive-eligible. It is not deleted until an externally anchored export exists."><p className="font-mono text-2xl font-semibold text-foreground">{number.format(data.posture.evidenceArchiveEligible)}</p><p className="mt-1 text-[10px] text-muted-foreground">archive-eligible evidence rows</p></Panel>
        <Panel title="Administrator audit" detail="Evidence reads, exports, re-scan actions, and automated byte deletion are append-only and sealed.">{data.adminAudit.length ? <Rows rows={data.adminAudit.slice(0, 8).map((item) => ({ label: item.action.replaceAll("_", " "), detail: item.actor_user_id ? `admin ${item.actor_user_id.slice(0, 8)}… · seal ${item.event_hash.slice(0, 8)}…` : `automated · seal ${item.event_hash.slice(0, 8)}…`, value: date(item.created_at) }))} /> : <p className="text-xs text-muted-foreground">No administrator security access has been recorded yet.</p>}</Panel>
        <Panel title="Repeated hashes" detail="Cross-account counts remain internal; only hash prefixes are displayed.">{data.repeatedHashes.length ? <Rows rows={data.repeatedHashes.slice(0, 8).map((item) => ({ label: `${item.hash.slice(0, 12)}…`, detail: `${item.attempts} attempts · ${item.accounts} account${item.accounts === 1 ? "" : "s"}`, value: date(item.lastSeen) }))} /> : <p className="text-xs text-muted-foreground">No repeated hashes in the current evidence window.</p>}</Panel>
        <Panel title="Top reason codes" detail={`${data.posture.unresolvedFiles} unresolved file states`}>{data.reasons.length ? <Rows rows={data.reasons.slice(0, 8).map((item) => ({ label: reasonLabel(item.reason), detail: "Recorded terminal decisions", value: number.format(item.count) }))} /> : <p className="text-xs text-muted-foreground">No rejection reasons recorded yet.</p>}</Panel>
      </div>
    </div>
  </section>
}

function OutcomeIcon({ outcome }: { outcome: Evidence["outcome"] }) { if (outcome === "approved") return <CheckCircle2 className="h-4 w-4 text-emerald-600" />; if (outcome === "scan_failed") return <Clock3 className="h-4 w-4 text-amber-600" />; return <XCircle className="h-4 w-4 text-red-600" /> }
function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "good" | "warn" | "risk" }) { const color = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-red-600"; return <div className="glass-surface relative overflow-hidden rounded-2xl p-5"><div aria-hidden className={`absolute inset-x-0 top-0 h-px ${tone === "good" ? "bg-emerald-500" : tone === "warn" ? "bg-amber-500" : "bg-red-500"}`} /><p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className={`mt-3 font-mono text-3xl font-semibold tracking-tight ${color}`}>{value}</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p></div> }
function Panel({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) { return <div className="glass-surface rounded-2xl p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{detail}</p></div></div><div className="mt-5">{children}</div></div> }
function Rows({ rows }: { rows: Array<{ label: string; detail: string; value: string }> }) { return <div className="divide-y divide-border">{rows.map((row) => <div key={`${row.label}-${row.detail}`} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="min-w-0"><p className="truncate font-mono text-[11px] text-foreground">{row.label}</p><p className="mt-1 truncate text-[10px] text-muted-foreground">{row.detail}</p></div><span className="shrink-0 text-[10px] text-muted-foreground">{row.value}</span></div>)}</div> }
