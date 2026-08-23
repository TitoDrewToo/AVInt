"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeft, Box, Layers3, LayoutTemplate, MousePointer2, Orbit, Route, Sparkles } from "lucide-react"
import type { ReactNode } from "react"
import { Navbar } from "@/components/navbar"

const navigation = [
  { href: "/systems/studio", label: "Overview", Icon: Sparkles },
  { href: "/systems/studio/ui", label: "UI / UX", Icon: MousePointer2 },
  { href: "/systems/studio/layouts", label: "Layouts", Icon: LayoutTemplate },
  { href: "/systems/studio/motion", label: "Motion", Icon: Orbit },
  { href: "/systems/studio/backgrounds", label: "Backgrounds", Icon: Layers3 },
  { href: "/systems/studio/environments", label: "Environments", Icon: Box },
  { href: "/systems/studio/flows", label: "Experience Flows", Icon: Route },
]

export function StudioWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="relative overflow-hidden px-4 py-8 md:px-8 md:py-10">
        <div aria-hidden className="pointer-events-none absolute inset-0 retro-grid-bg opacity-20" />
        <div className="relative mx-auto max-w-[1500px]">
          <header className="mb-8 flex flex-wrap items-start justify-between gap-5">
            <div>
              <Link href="/systems" className="mb-4 inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-primary">
                <ArrowLeft className="h-3.5 w-3.5" /> Systems hub
              </Link>
              <div className="flex items-center gap-3">
                <div className="cw-ring-accent glass-surface-sm flex h-11 w-11 items-center justify-center rounded-2xl text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.22em] text-primary">Internal studio</p>
                  <h1 className="mt-1 text-3xl font-semibold tracking-tight md:text-4xl">Experience Workspace</h1>
                </div>
              </div>
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">
                A private catalogue for reusable interface systems, motion behaviors, visual scenes, and environments across commission builds.
              </p>
            </div>
            <div className="glass-surface-sm rounded-2xl px-4 py-3 text-right text-xs text-muted-foreground">
              <span className="block font-medium uppercase tracking-[0.18em] text-primary">Catalogue status</span>
              <span className="mt-1 block">Foundation online · prototypes next</span>
            </div>
          </header>

          <nav aria-label="Studio workspace sections" className="mb-8 flex gap-2 overflow-x-auto border-b border-border pb-3">
            {navigation.map(({ href, label, Icon }) => {
              const active = href === "/systems/studio" ? pathname === href : pathname.startsWith(href)
              return <Link key={href} href={href} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-all ${active ? "bg-primary text-primary-foreground shadow-[0_0_24px_-10px_var(--retro-glow-red)]" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`}><Icon className="h-4 w-4" />{label}</Link>
            })}
          </nav>

          {children}
        </div>
      </main>
    </div>
  )
}
