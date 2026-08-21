import Link from "next/link"
import { ArrowRight, Check, FileText, Search, Upload } from "lucide-react"
import { Navbar } from "@/components/navbar"
import { Footer } from "@/components/footer"

export interface AudienceLandingData {
  eyebrow: string
  title: string
  description: string
  audience: string
  examples: string[]
  output: string
}

export function AudienceLandingPage({ data }: { data: AudienceLandingData }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="relative overflow-hidden px-6 pb-20 pt-20 md:pb-28 md:pt-28">
          <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-40" />
          <div className="relative mx-auto max-w-6xl">
            <div className="max-w-4xl">
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-primary">{data.eyebrow}</p>
              <h1 className="mt-6 text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-foreground md:text-7xl">{data.title}</h1>
              <p className="mt-7 max-w-2xl text-pretty text-lg leading-relaxed text-muted-foreground md:text-xl">{data.description}</p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link href="/tools/smart-storage" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Start free <ArrowRight className="h-4 w-4" /></Link>
                <Link href="/studio#studio-inquiry" className="inline-flex min-h-11 items-center rounded-xl border border-border/70 px-5 py-3 text-sm font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground">Discuss a project</Link>
              </div>
            </div>

            <div className="mt-16 grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <div className="glass-surface rounded-3xl p-7 md:p-9">
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Example output for {data.audience}</p>
                <h2 className="mt-4 text-2xl font-semibold text-foreground">{data.output}</h2>
                <div className="mt-7 overflow-hidden rounded-2xl border border-border/60 bg-background/70">
                  <div className="grid grid-cols-[1.1fr_0.7fr_0.7fr] gap-3 border-b border-border/60 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"><span>Vendor</span><span>Date</span><span>Category</span></div>
                  {data.examples.map((example, index) => <div key={example} className="grid grid-cols-[1.1fr_0.7fr_0.7fr] gap-3 border-b border-border/40 px-4 py-3 text-xs text-foreground last:border-0"><span className="truncate">{example}</span><span className="text-muted-foreground">2026-{String(index + 1).padStart(2, "0")}-15</span><span className="text-muted-foreground">Categorized</span></div>)}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3 md:grid-cols-1">
                {[
                  [Upload, "Upload", "PDFs, photos, invoices, and receipts."],
                  [Search, "Find", "Search by vendor, date, amount, or category."],
                  [FileText, "Export", "Hand off a clean report or CSV."],
                ].map(([Icon, title, copy]) => { const Component = Icon as typeof Upload; return <div key={title as string} className="glass-surface rounded-2xl p-5"><Component className="h-5 w-5 text-primary" /><h3 className="mt-4 text-sm font-semibold text-foreground">{title as string}</h3><p className="mt-2 text-xs leading-relaxed text-muted-foreground">{copy as string}</p></div> })}
              </div>
            </div>

            <div className="mt-10 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              {["No manual data entry", "Searchable source records", "Exportable reports"].map((item) => <div key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" />{item}</div>)}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
