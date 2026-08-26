"use client"

import { useEffect, useMemo, useState } from "react"
import { GitBranch, Network, Table2 } from "lucide-react"

import type { UploadedFile } from "@/lib/smart-storage"
import { supabase } from "@/lib/supabase"

type DataModelViewProps = {
  files: UploadedFile[]
}

type ModelView = "lineage" | "schema"

type VirtualModel = {
  records: Array<{ id: string; document_type: string | null; status: string }>
  fields: Array<{ virtual_record_id: string; field_key: string; is_custom: boolean }>
  catalog: Array<{ field_key: string; label: string; value_types: string[]; occurrence_count: number; is_custom: boolean }>
}

function countReadyRecords(files: UploadedFile[]) {
  return files.reduce((total, file) => total + (file.normalization_status === "normalized" || file.normalization_status === "manual" ? file.document_fields_count ?? file.field_count ?? 0 : 0), 0)
}

function countAttention(files: UploadedFile[]) {
  return files.filter((file) => Boolean(file.attention_state)).length
}

export function DataModelView({ files }: DataModelViewProps) {
  const [view, setView] = useState<ModelView>("lineage")
  const [virtualModel, setVirtualModel] = useState<VirtualModel | null>(null)
  const readyRecords = countReadyRecords(files)
  const attentionCount = countAttention(files)
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    files.forEach((file) => {
      if (file.normalization_status !== "normalized" && file.normalization_status !== "manual") return
      const type = file.document_type || "general_document"
      counts.set(type, (counts.get(type) ?? 0) + (file.document_fields_count ?? file.field_count ?? 0))
    })
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [files])

  useEffect(() => {
    let cancelled = false
    async function loadVirtualModel() {
      const [{ data: records }, { data: fields }, { data: catalog }] = await Promise.all([
        supabase.from("virtual_records").select("id, document_type, status"),
        supabase.from("virtual_record_fields").select("virtual_record_id, field_key, is_custom"),
        supabase.from("virtual_field_catalog").select("field_key, label, value_types, occurrence_count, is_custom").order("occurrence_count", { ascending: false }),
      ])
      if (!cancelled) setVirtualModel({ records: records ?? [], fields: fields ?? [], catalog: catalog ?? [] })
    }
    void loadVirtualModel()
    return () => { cancelled = true }
  }, [files])

  const modelRecords = useMemo(() => virtualModel?.records ?? [], [virtualModel])
  const modelFields = virtualModel?.fields ?? []
  const modelCatalog = virtualModel?.catalog ?? []
  const virtualReadyRecords = modelRecords.filter((record) => record.status === "normalized" || record.status === "manual").length
  const virtualAttentionRecords = modelRecords.filter((record) => record.status === "failed").length
  const modelTypeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const record of modelRecords) {
      if (record.status !== "normalized" && record.status !== "manual") continue
      const type = record.document_type || "general_document"
      counts.set(type, (counts.get(type) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [modelRecords])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <p className="font-aldrich text-[10px] uppercase tracking-[0.18em] text-primary">Data Model</p>
          <h2 className="mt-1 truncate text-sm font-semibold text-foreground">Your virtual data layer</h2>
        </div>
        <div className="flex shrink-0 items-center rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setView("lineage")}
            aria-pressed={view === "lineage"}
            className={`cw-button-flow flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] ${view === "lineage" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            <Network className="h-3.5 w-3.5" />
            Map
          </button>
          <button
            type="button"
            onClick={() => setView("schema")}
            aria-pressed={view === "schema"}
            className={`cw-button-flow flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] ${view === "schema" ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            <Table2 className="h-3.5 w-3.5" />
            Schema
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="glass-surface-sm rounded-lg p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sources</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{modelRecords.length || files.length}</p>
          </div>
          <div className="glass-surface-sm rounded-lg p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Records</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{virtualReadyRecords || readyRecords}</p>
          </div>
          <div className={["glass-surface-sm rounded-lg p-3", virtualAttentionRecords > 0 || attentionCount > 0 ? "border-primary/35" : ""].join(" ")}>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Attention</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{virtualAttentionRecords || attentionCount}</p>
          </div>
        </div>

        {view === "lineage" ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card/60 p-4">
              <div className="mb-4 flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs font-semibold text-foreground">Source to intelligence</p>
                  <p className="text-[11px] text-muted-foreground">Every ready output begins with a normalized record.</p>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                {[
                  ["Files", String(files.length) + " sources", "border-primary/30 bg-primary/5"],
                  ["Records", String(modelRecords.length || files.reduce((n, file) => n + (file.document_fields_count ?? file.field_count ?? 0), 0)) + " rows", "border-border bg-card"],
                  ["Ready", String(virtualReadyRecords || readyRecords) + " records", "border-emerald-500/30 bg-emerald-500/5"],
                  ["Outputs", "dashboards + AI", "border-border bg-card"],
                ].map(([label, value, tone], index) => (
                  <div key={label} className="relative">
                    <div className={["rounded-lg border p-3", tone].join(" ")}>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
                      <p className="mt-1 text-xs font-medium text-foreground">{value}</p>
                    </div>
                    {index < 3 && <span className="absolute -right-2 top-1/2 hidden text-primary md:block" aria-hidden="true">→</span>}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card/40 p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Record types</p>
              {(modelTypeCounts.length > 0 ? modelTypeCounts : typeCounts).length > 0 ? (
                <div className="space-y-2">
                  {(modelTypeCounts.length > 0 ? modelTypeCounts : typeCounts).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
                      <span className="text-xs text-foreground">{type.replace(/_/g, " ")}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{count} record{count === 1 ? "" : "s"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">Record types will appear here as source files finish processing.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card/50">
            <div className="grid grid-cols-[1fr_100px_100px] gap-3 border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Virtual entity</span>
              <span>Records</span>
              <span>State</span>
            </div>
            {[
              ["source_files", files.length, "source"],
              ["virtual_records", modelRecords.length, modelRecords.length > 0 ? "active" : "empty"],
              ["virtual_record_fields", modelFields.length, modelFields.length > 0 ? "typed" : "waiting"],
              ["field_catalog", modelCatalog.length, modelCatalog.length > 0 ? "discoverable" : "waiting"],
              ["dashboard_outputs", virtualReadyRecords > 0 ? "derived" : 0, virtualReadyRecords > 0 ? "derived" : "waiting"],
            ].map(([name, count, state]) => (
              <div key={String(name)} className="grid grid-cols-[1fr_100px_100px] gap-3 border-b border-border/60 px-3 py-3 last:border-0">
                <span className="font-mono text-[11px] text-foreground">{name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
                <span className="font-mono text-[11px] capitalize text-muted-foreground">{state}</span>
              </div>
            ))}
            <p className="border-t border-border/60 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">This schema view is an account-scoped virtual projection. It discovers typed fields and custom values without exposing raw document content.</p>
          </div>
        )}
      </div>
    </div>
  )
}
