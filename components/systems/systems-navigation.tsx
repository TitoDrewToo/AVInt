"use client"

import Link from "next/link"
import { Activity, FileWarning, GitCommitHorizontal, LayoutDashboard, Mail, Sparkles, type LucideIcon } from "lucide-react"
import { useSystemsAdminAccess } from "@/components/systems/systems-access"

export type SystemsSection = "overview" | "errors" | "inquiries" | "studio" | "status" | "changelog"

const publicDestinations = [
  { href: "/systems/status", label: "Status", Icon: Activity, active: "status" as const },
  { href: "/systems/changelog", label: "Changelog", Icon: GitCommitHorizontal, active: "changelog" as const },
]

const internalDestinations = [
  { href: "/systems", label: "Overview", Icon: LayoutDashboard, active: "overview" as const },
  { href: "/systems/errors", label: "Errors", Icon: FileWarning, active: "errors" as const },
  { href: "/systems/inquiries", label: "Inquiries", Icon: Mail, active: "inquiries" as const },
  { href: "/systems/studio", label: "Studio", Icon: Sparkles, active: "studio" as const },
]

function Destination({ href, label, Icon, active, current }: { href: string; label: string; Icon: LucideIcon; active: SystemsSection; current: SystemsSection }) {
  const selected = active === current
  return <Link href={href} aria-current={selected ? "page" : undefined} className={`cw-button-flow inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium transition-colors ${selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-primary"}`}><Icon className="h-3.5 w-3.5" />{label}</Link>
}

export function SystemsNavigation({ active }: { active: SystemsSection }) {
  const access = useSystemsAdminAccess()
  return <nav aria-label="Systems operations" className="flex flex-wrap items-start gap-x-5 gap-y-3 rounded-2xl border border-border bg-background/50 p-3">
    <div><p className="mb-1.5 px-2 text-[9px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Public</p><div className="flex flex-wrap gap-1">{publicDestinations.map((destination) => <Destination key={destination.href} {...destination} current={active} />)}</div></div>
    {access === "allowed" ? <div className="border-l border-border pl-5"><p className="mb-1.5 px-2 text-[9px] font-medium uppercase tracking-[0.18em] text-primary">Internal</p><div className="flex flex-wrap gap-1">{internalDestinations.map((destination) => <Destination key={destination.href} {...destination} current={active} />)}</div></div> : null}
  </nav>
}
