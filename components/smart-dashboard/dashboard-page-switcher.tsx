"use client"

import { useState } from "react"
import { Check, ChevronDown, ChevronUp, LayoutDashboard, Loader2, Pencil, Plus, Trash2 } from "lucide-react"

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Tip } from "@/components/ui/tip"
import { supabase } from "@/lib/supabase"

export type DashboardPageSummary = { id: string; name: string; slug: string; kind: "personal" | "business" | "custom"; position: number; layout?: Record<string, unknown> }

type Props = {
  pages: DashboardPageSummary[]
  activeSlug: string
  onSelect: (slug: string) => void
  onPagesChanged: (pages: DashboardPageSummary[], activeSlug: string) => void
  disabled?: boolean
}

export function DashboardPageSwitcher({ pages, activeSlug, onSelect, onPagesChanged, disabled = false }: Props) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<"idle" | "create" | "rename">("idle")
  const [editingPage, setEditingPage] = useState<DashboardPageSummary | null>(null)
  const [name, setName] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletePage, setDeletePage] = useState<DashboardPageSummary | null>(null)
  const activePage = pages.find((page) => page.slug === activeSlug) ?? pages[0]

  async function request(path: string, method: string, body?: unknown) {
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const response = await fetch(path, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) throw new Error(payload?.error ?? "Dashboard pages could not be updated.")
    return payload
  }

  function startCreate() { setMode("create"); setEditingPage(null); setName(""); setError(null) }
  function startRename(page: DashboardPageSummary) { setMode("rename"); setEditingPage(page); setName(page.name); setError(null) }
  function cancelEdit() { setMode("idle"); setEditingPage(null); setName(""); setError(null) }

  async function submitName() {
    const value = name.trim()
    if (!value || busy) return
    setBusy(true); setError(null)
    try {
      if (mode === "create") {
        const payload = await request("/api/dashboard-pages", "POST", { name: value })
        onPagesChanged(payload.pages, payload.page.slug)
        setOpen(false)
      } else if (editingPage) {
        const payload = await request(`/api/dashboard-pages/${editingPage.id}`, "PATCH", { name: value })
        onPagesChanged(payload.pages, activeSlug)
      }
      cancelEdit()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Dashboard pages could not be updated.") }
    finally { setBusy(false) }
  }

  async function move(page: DashboardPageSummary, direction: -1 | 1) {
    const index = pages.findIndex((candidate) => candidate.id === page.id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= pages.length || busy) return
    const ordered = [...pages]; [ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    setBusy(true); setError(null)
    try {
      const payload = await request("/api/dashboard-pages/reorder", "POST", { pageIds: ordered.map((candidate) => candidate.id) })
      onPagesChanged(payload.pages, activeSlug)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Dashboard pages could not be reordered.") }
    finally { setBusy(false) }
  }

  async function confirmDelete() {
    if (!deletePage || busy) return
    const page = deletePage
    setBusy(true); setError(null)
    try {
      const payload = await request(`/api/dashboard-pages/${page.id}`, "DELETE")
      onPagesChanged(payload.pages, page.slug === activeSlug ? payload.fallbackPageSlug : activeSlug)
      setDeletePage(null); setOpen(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The dashboard page could not be deleted.") }
    finally { setBusy(false) }
  }

  return (
    <>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) cancelEdit() }}>
        <PopoverTrigger asChild>
          <button type="button" disabled={disabled} title={disabled ? "Save or discard layout changes before switching pages" : "Choose or manage dashboard pages"} className="cw-button-flow flex h-7 max-w-32 items-center gap-1.5 rounded-lg border border-border px-2.5 text-xs text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-44" aria-label="Choose or manage dashboard pages">
            <LayoutDashboard className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{activePage?.name ?? "Dashboard"}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(340px,calc(100vw-2rem))] p-2">
          <div className="flex items-center justify-between px-2 py-1.5">
            <div><p className="font-aldrich text-[10px] uppercase tracking-wider text-primary">Dashboard pages</p><p className="mt-0.5 text-[10px] text-muted-foreground">Different views, one governed data layer.</p></div>
            <button type="button" onClick={startCreate} disabled={busy || pages.length >= 50} className="cw-button-flow flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"><Plus className="h-3 w-3" />New</button>
          </div>

          {mode !== "idle" && <form onSubmit={(event) => { event.preventDefault(); void submitName() }} className="m-1 rounded-lg border border-primary/25 bg-primary/5 p-2">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{mode === "create" ? "New page" : "Rename page"}</label>
            <div className="mt-1.5 flex gap-1.5"><input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Project or topic name" className="min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/25" /><button type="submit" disabled={busy || !name.trim()} className="rounded-md bg-primary px-2.5 text-xs text-primary-foreground disabled:opacity-40">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}</button><button type="button" onClick={cancelEdit} className="rounded-md px-2 text-xs text-muted-foreground">Cancel</button></div>
          </form>}

          <div className="mt-1 max-h-72 space-y-0.5 overflow-y-auto">
            {pages.map((page, index) => <div key={page.id} className={`group flex items-center gap-1 rounded-lg p-1 ${page.slug === activeSlug ? "bg-primary/10" : "hover:bg-muted/70"}`}>
              <button type="button" onClick={() => { onSelect(page.slug); setOpen(false) }} className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs"><span className={`flex h-4 w-4 items-center justify-center rounded-full border ${page.slug === activeSlug ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>{page.slug === activeSlug && <Check className="h-2.5 w-2.5" />}</span><span className="truncate font-medium">{page.name}</span></button>
              <Tip text={`Move ${page.name} earlier.`}><button type="button" onClick={() => void move(page, -1)} disabled={busy || index === 0} className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-20" aria-label={`Move ${page.name} earlier`}><ChevronUp className="h-3.5 w-3.5" /></button></Tip>
              <Tip text={`Move ${page.name} later.`}><button type="button" onClick={() => void move(page, 1)} disabled={busy || index === pages.length - 1} className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground disabled:opacity-20" aria-label={`Move ${page.name} later`}><ChevronDown className="h-3.5 w-3.5" /></button></Tip>
              <Tip text={`Rename ${page.name}.`}><button type="button" onClick={() => startRename(page)} disabled={busy} className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground" aria-label={`Rename ${page.name}`}><Pencil className="h-3.5 w-3.5" /></button></Tip>
              <Tip text={pages.length === 1 ? "A dashboard needs at least one page." : `Delete ${page.name}.`}><button type="button" onClick={() => { setDeletePage(page); setError(null) }} disabled={busy || pages.length === 1} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-20" aria-label={`Delete ${page.name}`}><Trash2 className="h-3.5 w-3.5" /></button></Tip>
            </div>)}
          </div>
          {error && <p className="mx-1 mt-2 rounded-md border border-destructive/25 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive">{error}</p>}
          <p className="px-2 pb-1 pt-2 text-[10px] text-muted-foreground">{pages.length}/50 pages · Names can change without breaking integrations.</p>
        </PopoverContent>
      </Popover>

      <AlertDialog open={Boolean(deletePage)} onOpenChange={(next) => { if (!next && !busy) setDeletePage(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete “{deletePage?.name}”?</AlertDialogTitle><AlertDialogDescription>The page layout will be removed. Saved AI visuals will move to another page as unplotted items. Your Smart Storage files, records and datasets will not be deleted.</AlertDialogDescription></AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep page</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); void confirmDelete() }} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{busy ? <><Loader2 className="h-4 w-4 animate-spin" />Deleting…</> : "Delete page"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
