"use client"

import { useEffect, useState } from "react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"
import { ShieldCheck, Activity, BrainCircuit, FileSearch, Server } from "lucide-react"
import { SmartSecurityAccessGate } from "@/components/smart-security-access-gate"

type HealthState = {
  ok: boolean
  status: string
  data?: {
    clamav?: string
    config?: {
      maxDownloadBytes?: number
      defaultBucket?: string
    }
  }
}

function StatusPill({ status }: { status: string }) {
  const operational = status === "operational"
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
      operational
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
        : "border-amber-500/30 bg-amber-500/10 text-amber-600"
    }`}>
      <span className={`h-2 w-2 rounded-full ${operational ? "bg-emerald-500" : "bg-amber-500"}`} />
      {operational ? "Operational" : status.replace(/_/g, " ")}
    </span>
  )
}

export default function SmartSecurityToolPage() {
  const [health, setHealth] = useState<HealthState | null>(null)

  useEffect(() => {
    fetch("/api/smart-security/health", { cache: "no-store" })
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false, status: "unreachable" }))
  }, [])

  const maxMb = health?.data?.config?.maxDownloadBytes
    ? Math.round(health.data.config.maxDownloadBytes / (1024 * 1024))
    : null

  return (
    <div className="min-h-screen bg-background">
      <Navbar wide />
      <SmartSecurityAccessGate>
        <main className="px-6 pb-24 pt-32">
          <section className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-primary">Smart Security Console</p>
                <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground md:text-5xl">
                  Defensive scanning for AVIntelligence uploads.
                </h1>
                <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Smart Security is the standalone defense layer behind Smart Storage. It scans files before processing and records machine-readable signals for future learning and active defense.
                </p>
              </div>
              <StatusPill status={health?.status ?? "checking"} />
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <div className="glass-surface rounded-2xl p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Server className="h-4 w-4 text-primary" />
                  Cloud Run Scanner
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Hosted separately from AVIntelligence so file defense can evolve into a reusable security service.
                </p>
              </div>
              <div className="glass-surface rounded-2xl p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <FileSearch className="h-4 w-4 text-primary" />
                  ClamAV + Structure
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {health?.data?.clamav ? health.data.clamav : "Checking scanner version..."}
                </p>
              </div>
              <div className="glass-surface rounded-2xl p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Activity className="h-4 w-4 text-primary" />
                  Upload Policy
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {maxMb ? `${maxMb} MB max object scan from the ${health?.data?.config?.defaultBucket ?? "documents"} bucket.` : "Policy loads from the service configuration."}
                </p>
              </div>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Current Defense Path</h2>
                </div>
                <div className="mt-5 space-y-4 text-sm text-muted-foreground">
                  <p>1. AVIntelligence uploads enter the existing Smart Storage prescan workflow.</p>
                  <p>2. Smart Security downloads the private storage object through server-side credentials.</p>
                  <p>3. ClamAV and structural checks return a clean, suspicious, infected, or scan-error decision.</p>
                  <p>4. Smart Storage only continues processing files that pass the defense layer.</p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-foreground">Reinforcement Pipeline</h2>
                </div>
                <div className="mt-5 space-y-4 text-sm text-muted-foreground">
                  <p>Next step is storing scan events and human labels so Vertex AI can learn from real customer needs and false-positive decisions.</p>
                  <p>The first learning target is file defense: malware signals, suspicious document structure, and upload abuse patterns.</p>
                  <p>Later phases add attack detection, rule suggestions, and reviewed active-defense actions.</p>
                </div>
              </div>
            </div>
          </section>
        </main>
      </SmartSecurityAccessGate>
      <Footer />
    </div>
  )
}
