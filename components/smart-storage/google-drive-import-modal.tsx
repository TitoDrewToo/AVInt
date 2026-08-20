"use client"

import { useEffect, useState } from "react"
import { Check, ChevronLeft, Folder, HardDrive, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Session } from "@supabase/supabase-js"

type DriveFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string }
type Props = { session: Session | null; onImported: () => void }
const FOLDER_MIME = "application/vnd.google-apps.folder"

async function api(path: string, session: Session, init?: RequestInit) {
  return fetch(path, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, ...(init?.headers ?? {}) } })
}

export function GoogleDriveImportModal({ session, onImported }: Props) {
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [files, setFiles] = useState<DriveFile[]>([])
  const [parentId, setParentId] = useState<string | null>(null)
  const [history, setHistory] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function loadFiles(nextParentId?: string) {
    if (!session) return
    setBusy(true); setError(null)
    try {
      const response = await api(`/api/integrations/google-drive/files${nextParentId ? `?parentId=${encodeURIComponent(nextParentId)}` : ""}`, session)
      const body = await response.json() as { files?: DriveFile[]; error?: string }
      if (!response.ok) throw new Error(body.error ?? "Could not load Drive files")
      setFiles(body.files ?? []); setParentId(nextParentId ?? null)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not load Drive files") } finally { setBusy(false) }
  }

  async function openModal() {
    if (!session) return
    setOpen(true); setError(null); setSelected(new Set())
    const response = await api("/api/integrations/google-drive/status", session)
    const body = await response.json() as { connected?: boolean; email?: string; error?: string }
    if (!response.ok) { setError(body.error ?? "Could not check Drive connection"); return }
    setConnected(Boolean(body.connected));
    if (body.connected) void loadFiles()
  }

  async function connect() {
    if (!session) return
    setBusy(true); setError(null)
    try {
      const response = await api("/api/integrations/google-drive/connect", session)
      const body = await response.json() as { url?: string; error?: string }
      if (!response.ok || !body.url) throw new Error(body.error ?? "Google Drive connection is unavailable")
      window.location.assign(body.url)
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not connect Google Drive"); setBusy(false) }
  }

  async function importSelection() {
    if (!session || !selected.size) return
    setBusy(true); setError(null)
    try {
      const response = await api("/api/integrations/google-drive/import", session, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileIds: Array.from(selected) }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Drive import failed")
      setOpen(false); setSelected(new Set()); onImported()
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Drive import failed") } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!open) { setFiles([]); setParentId(null); setHistory([]) }
  }, [open])

  return <>
    <button type="button" onClick={() => void openModal()} disabled={!session || busy} className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50">
      <HardDrive className="h-3.5 w-3.5" /> Import from Drive
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl" aria-describedby="google-drive-import-description">
        <DialogHeader>
          <DialogTitle>Import from Google Drive</DialogTitle>
          <DialogDescription id="google-drive-import-description">Choose files or folders. Imported files follow the same security scan and processing workflow as uploads.</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {!connected ? <div className="rounded-xl border border-border bg-muted/30 p-5"><p className="text-sm text-foreground">Connect the Google account that contains the documents you want to process.</p><Button type="button" className="mt-4" onClick={() => void connect()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />} Connect Google Drive</Button></div> : <>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground"><span>Connected to Google Drive</span><button type="button" className="text-primary hover:underline" onClick={() => void loadFiles(parentId ?? undefined)}>Refresh</button></div>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
            {parentId && <button type="button" className="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted" onClick={() => { const previous = history[history.length - 1]; setHistory((items) => items.slice(0, -1)); void loadFiles(previous) }}><ChevronLeft className="h-4 w-4" /> Back</button>}
            {busy && <div className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading Drive files…</div>}
            {!busy && !files.length && <p className="p-5 text-sm text-muted-foreground">No files found in this Drive location.</p>}
            {!busy && files.map((file) => { const folder = file.mimeType === FOLDER_MIME; const isSelected = selected.has(file.id); return <div key={file.id} className="flex items-center gap-3 border-b border-border px-3 py-2 last:border-0"><button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm text-foreground hover:text-primary" onClick={() => { if (folder) { setHistory((items) => [...items, parentId ?? ""]); void loadFiles(file.id) } }} disabled={!folder}><span className="shrink-0 text-primary">{folder ? <Folder className="h-4 w-4" /> : <HardDrive className="h-4 w-4" />}</span><span className="truncate">{file.name}</span></button><button type="button" aria-label={`${isSelected ? "Remove" : "Select"} ${file.name}`} onClick={() => setSelected((current) => { const next = new Set(current); if (next.has(file.id)) next.delete(file.id); else next.add(file.id); return next })} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent hover:border-primary"}`}><Check className="h-3.5 w-3.5" /></button></div> })}
          </div>
          <div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{selected.size} selected. Folders import supported files up to two levels deep.</p><Button type="button" onClick={() => void importSelection()} disabled={busy || !selected.size}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Import selected</Button></div>
        </>}
      </DialogContent>
    </Dialog>
  </>
}
