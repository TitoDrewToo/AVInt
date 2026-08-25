"use client"

import { useMemo, useState } from "react"
import { GitBranch, Network, Table2 } from "lucide-react"

import type { UploadedFile } from "@/lib/smart-storage"

type DataModelViewProps = {
  files: UploadedFile[]
}

type ModelView = "lineage" | "schema"

function countReadyRecords(files: UploadedFile[]) {
  return files.reduce((total, file) => total + (file.normalization_status === "normalized" || file.normalization_status === "manual" ? file.document_fields_count ?? file.field_count ?? 0 : 0), 0)
}

function countAttention(files: UploadedFile[]) {
  return files.filter((file) => Boolean(file.attention_state)).length
}

export function DataModelView({ files }: DataModelViewProps) {
  const [view, setView] = useState<ModelView>("lineage")
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
            <p className="mt-1 text-lg font-semibold text-foreground">{files.length}</p>
          </div>
          <div className="glass-surface-sm rounded-lg p-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Records</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{readyRecords}</p>
          </div>
          <div className={["glass-surface-sm rounded-lg p-3", attentionCount > 0 ? "border-primary/35" : ""].join(" ")}>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Attention</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{attentionCount}</p>
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
                  ["Extracted", String(files.reduce((n, file) => n + (file.document_fields_count ?? file.field_count ?? 0), 0)) + " rows", "border-border bg-card"],
                  ["Normalized", String(readyRecords) + " records", "border-emerald-500/30 bg-emerald-500/5"],
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
              <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Normalized entities</p>
              {typeCounts.length > 0 ? (
                <div className="space-y-2">
                  {typeCounts.map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between rounded-lg border border-border/70 px-3 py-2">
                      <span className="text-xs text-foreground">{type.replace(/_/g, " ")}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{count} record{count === 1 ? "" : "s"}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground">Normalized entities will appear here after safe files finish processing.</p>
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
              ["document_fields", readyRecords, readyRecords > 0 ? "ready" : "empty"],
              ["dashboard_outputs", readyRecords > 0 ? "derived" : 0, readyRecords > 0 ? "derived" : "waiting"],
            ].map(([name, count, state]) => (
              <div key={String(name)} className="grid grid-cols-[1fr_100px_100px] gap-3 border-b border-border/60 px-3 py-3 last:border-0">
                <span className="font-mono text-[11px] text-foreground">{name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{count}</span>
                <span className="font-mono text-[11px] capitalize text-muted-foreground">{state}</span>
              </div>
            ))}
            <p className="border-t border-border/60 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">This schema view is an account-scoped projection, not a raw database browser. Fields become available as source documents normalize.</p>
          </div>
        )}
      </div>
    </div>
  )
}
