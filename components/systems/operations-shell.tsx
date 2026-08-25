import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { Footer } from "@/components/footer"
import { Navbar } from "@/components/navbar"
import { SystemsNavigation, type SystemsSection } from "@/components/systems/systems-navigation"

export function OperationsShell({ children, active }: { children: React.ReactNode; active: SystemsSection }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <main className="relative z-[1] flex-1 overflow-hidden px-4 py-10 md:px-8 md:py-14">
        <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-25" />
        <div className={`relative mx-auto ${active === "errors" ? "max-w-[1600px]" : "max-w-6xl"}`}>
          <header className="mb-10 flex flex-col justify-between gap-8 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary">AVIntelligence systems</p>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl">Operations, made legible.</h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg">A public view into what changed and whether the production system is ready.</p>
            </div>
            <SystemsNavigation active={active} />
          </header>
          {children}
          <div className="mt-10 flex justify-end"><Link href="/" className="inline-flex items-center gap-2 text-xs text-muted-foreground transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]">Back to AVIntelligence <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
