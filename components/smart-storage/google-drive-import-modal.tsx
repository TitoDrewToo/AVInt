"use client"

import { useState } from "react"
import { Check, HardDrive, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { Session } from "@supabase/supabase-js"

type Props = { session: Session | null; onImported: () => void }
type PickerDocument = { id?: string; name?: string; mimeType?: string; url?: string; lastEditedUtc?: number }
type PickerResponse = { action?: string; docs?: PickerDocument[] }
type PickerConfig = { accessToken?: string; apiKey?: string; appId?: string; error?: string }

declare global {
  interface Window {
    gapi?: { load: (name: string, callback: () => void) => void }
    google?: { picker?: { DocsView: new (viewId: string) => { setIncludeFolders: (value: boolean) => unknown; setSelectFolderEnabled: (value: boolean) => unknown; setMimeTypes: (value: string) => unknown }; ViewId: { DOCS: string }; PickerBuilder: new () => { addView: (view: unknown) => unknown; setOAuthToken: (value: string) => unknown; setDeveloperKey: (value: string) => unknown; setAppId: (value: string) => unknown; enableFeature: (value: string) => unknown; setCallback: (value: (response: PickerResponse) => void) => unknown; build: () => { setVisible: (value: boolean) => void } }; Feature: { MULTISELECT_ENABLED: string }; Action: { PICKED: string } } }
  }
}

const PICKER_SCRIPT = "https://apis.google.com/js/api.js"
const DRIVE_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "text/csv", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].join(",")

function loadPickerScript() {
  return new Promise<void>((resolve, reject) => {
    if (window.gapi) { resolve(); return }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PICKER_SCRIPT}"]`)
    if (existing) { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Google Picker could not load")), { once: true }); return }
    const script = document.createElement("script")
    script.src = PICKER_SCRIPT; script.async = true; script.onload = () => resolve(); script.onerror = () => reject(new Error("Google Picker could not load")); document.head.appendChild(script)
  })
}

async function api(path: string, session: Session, init?: RequestInit) {
  return fetch(path, { ...init, headers: { Authorization: `Bearer ${session.access_token}`, ...(init?.headers ?? {}) } })
}

export function GoogleDriveImportModal({ session, onImported }: Props) {
  const [open, setOpen] = useState(false)
  const [connected, setConnected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCount, setSelectedCount] = useState(0)

  async function openModal() {
    if (!session) return
    setOpen(true); setError(null); setSelectedCount(0)
    const response = await api("/api/integrations/google-drive/status", session)
    const body = await response.json() as { connected?: boolean; error?: string }
    if (!response.ok) { setError(body.error ?? "Could not check Drive connection"); return }
    setConnected(Boolean(body.connected))
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

  async function openPicker() {
    if (!session) return
    setBusy(true); setError(null)
    try {
      const configResponse = await api("/api/integrations/google-drive/picker-config", session)
      const config = await configResponse.json() as PickerConfig
      if (!configResponse.ok || !config.accessToken || !config.apiKey || !config.appId) throw new Error(config.error ?? "Google Drive Picker is not configured")
      const { accessToken, apiKey, appId } = config
      await loadPickerScript()
      window.gapi?.load("picker", () => {
        const pickerApi = window.google?.picker
        if (!pickerApi) { setError("Google Picker could not initialize"); setBusy(false); return }
        const view = new pickerApi.DocsView(pickerApi.ViewId.DOCS)
        view.setIncludeFolders(true); view.setSelectFolderEnabled(false); view.setMimeTypes(DRIVE_MIME_TYPES)
        const builder = new pickerApi.PickerBuilder()
        builder.addView(view); builder.setOAuthToken(accessToken); builder.setDeveloperKey(apiKey); builder.setAppId(appId); builder.enableFeature(pickerApi.Feature.MULTISELECT_ENABLED); builder.setCallback((response) => { if (response.action === pickerApi.Action.PICKED) void importSelection(response.docs ?? []); else setBusy(false) }); builder.build().setVisible(true)
        setBusy(false)
      })
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not open Google Drive Picker"); setBusy(false) }
  }

  async function importSelection(documents: PickerDocument[]) {
    if (!session) return
    const fileIds = documents.map((document) => document.id).filter((id): id is string => Boolean(id))
    if (!fileIds.length) return
    setSelectedCount(fileIds.length); setBusy(true); setError(null)
    try {
      const response = await api("/api/integrations/google-drive/import", session, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileIds }) })
      const body = await response.json() as { error?: string }
      if (!response.ok) throw new Error(body.error ?? "Drive import failed")
      setOpen(false); onImported()
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Drive import failed") } finally { setBusy(false) }
  }

  return <>
    <button type="button" onClick={() => void openModal()} disabled={!session || busy} className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"><HardDrive className="h-3.5 w-3.5" /> Import from Drive</button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-lg" aria-describedby="google-drive-import-description">
        <DialogHeader><DialogTitle>Import from Google Drive</DialogTitle><DialogDescription id="google-drive-import-description">Choose files or folders in Google’s Drive picker. Imported files follow the same security scan and processing workflow as uploads.</DialogDescription></DialogHeader>
        {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        {!connected ? <div className="rounded-xl border border-border bg-muted/30 p-5"><p className="text-sm text-foreground">Connect the Google account that contains the documents you want to process.</p><Button type="button" className="mt-4" onClick={() => void connect()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />} Connect Google Drive</Button></div> : <div className="rounded-xl border border-primary/25 bg-primary/5 p-5"><p className="flex items-center gap-2 text-sm font-medium text-foreground"><Check className="h-4 w-4 text-primary" /> Google Drive connected</p><p className="mt-2 text-sm text-muted-foreground">Open Google’s native picker, open the folder you want, then select the files inside it for import.</p><Button type="button" className="mt-4" onClick={() => void openPicker()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />} Open Google Drive picker</Button>{selectedCount > 0 && <p className="mt-3 text-xs text-muted-foreground">{selectedCount} file{selectedCount === 1 ? "" : "s"} selected for import.</p>}</div>}
      </DialogContent>
    </Dialog>
  </>
}
