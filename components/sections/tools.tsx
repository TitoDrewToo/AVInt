"use client"

import { useState, useEffect, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { AuthGuardModal } from "@/components/auth-guard-modal"
import type { Session } from "@supabase/supabase-js"

export function StorageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes tools-upload {
          0%,100% { transform:translateY(0); opacity:1; }
          40% { transform:translateY(-2px); opacity:0.6; }
          70% { transform:translateY(-1px); opacity:1; }
        }
        @keyframes tools-dot-blink { 0%,100% { opacity:1; } 50% { opacity:0.2; } }
        .tools-arrow { animation: tools-upload 2s ease-in-out infinite; transform-origin: 11px 11px; }
        .tools-dot   { animation: tools-dot-blink 1.2s ease-in-out infinite; }
      `}</style>
      <rect x="6" y="2" width="14" height="18" rx="1.5" className="fill-muted stroke-border" strokeWidth="0.5" />
      <rect x="4" y="4" width="14" height="18" rx="1.5" className="fill-card stroke-border" strokeWidth="0.5" />
      <rect x="7" y="8"  width="8" height="1" rx="0.5" className="fill-muted-foreground/30" />
      <rect x="7" y="11" width="6" height="1" rx="0.5" className="fill-muted-foreground/20" />
      <rect x="7" y="14" width="7" height="1" rx="0.5" className="fill-muted-foreground/20" />
      <g className="tools-arrow">
        <path d="M11 15v-5M11 10l-2 2M11 10l2 2" stroke="rgb(220,38,38)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="16" cy="6" r="2.5" fill="rgb(220,38,38)" className="tools-dot" />
    </svg>
  )
}

export function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <style>{`
        @keyframes tbar1 { 0%,100%{height:5px;y:14px} 50%{height:7px;y:12px} }
        @keyframes tbar2 { 0%,100%{height:8px;y:11px} 50%{height:10px;y:9px} }
        @keyframes tbar3 { 0%,100%{height:6px;y:13px} 50%{height:8px;y:11px} }
        @keyframes tline { 0%{stroke-dashoffset:20;opacity:0.3} 60%{stroke-dashoffset:0;opacity:1} 100%{stroke-dashoffset:0;opacity:1} }
        .tb1 { animation: tbar1 2.2s ease-in-out infinite 0s; }
        .tb2 { animation: tbar2 2.6s ease-in-out infinite 0.35s; }
        .tb3 { animation: tbar3 2.4s ease-in-out infinite 0.7s; }
        .tl  { stroke-dasharray:20; animation: tline 2.4s ease-in-out infinite; }
      `}</style>
      <rect x="2" y="3" width="20" height="18" rx="2" className="fill-card stroke-border" strokeWidth="0.5" />
      <rect x="2" y="3" width="20" height="4"  rx="2" className="fill-muted stroke-border" strokeWidth="0.5" />
      <circle cx="5" cy="5" r="1" className="fill-primary/60" />
      <rect x="4"  y="14" width="3" height="5" rx="0.5" className="fill-muted tb1" />
      <rect x="9"  y="11" width="3" height="8" rx="0.5" className="fill-primary/30 tb2" />
      <rect x="14" y="13" width="3" height="6" rx="0.5" className="fill-muted tb3" />
      <path d="M5.5 12L10.5 9L15.5 10.5" stroke="rgb(220,38,38)" strokeWidth="1" strokeLinecap="round" className="tl" />
      <circle cx="10.5" cy="9" r="1.5" fill="rgb(220,38,38)" />
    </svg>
  )
}

interface ToolCardProps {
  name: string
  description: string
  subtext: string
  learnMoreHref: string
  launchHref: string
  icon: ReactNode
  session: Session | null
  sessionLoaded: boolean
  onTryFree: () => void
}

function ToolCard({ name, description, subtext, learnMoreHref, launchHref, icon, session, sessionLoaded, onTryFree }: ToolCardProps) {
  return (
    <div className="group flex h-full flex-col rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/20 hover:shadow-md">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm">
        {icon}
      </div>
      <h3 className="mt-6 text-xl font-semibold text-foreground">{name}</h3>
      <p className="mt-3 text-muted-foreground">{description}</p>
      <p className="mt-2 text-sm text-muted-foreground/80">{subtext}</p>

      <div className="mt-6 flex items-center gap-3">
        {/* Learn more — always visible */}
        <Link
          href={learnMoreHref}
          className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Learn more
        </Link>

        {/* Session-aware primary CTA */}
        {!sessionLoaded ? (
          <div className="h-7 w-28 animate-pulse rounded-md bg-muted" />
        ) : session ? (
          <Link
            href={launchHref}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Launch {name} →
          </Link>
        ) : (
          <button
            onClick={onTryFree}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Try for free
          </button>
        )}
      </div>
    </div>
  )
}

export function ToolsSection() {
  const [session, setSession]             = useState<Session | null>(null)
  const [sessionLoaded, setSessionLoaded] = useState(false)
  const [authTarget, setAuthTarget]       = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoaded(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      setSessionLoaded(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  function handleAuthSuccess() {
    const target = authTarget
    setAuthTarget(null)
    if (target) router.push(target)
  }

  const tools = [
    {
      name: "Smart Storage",
      description: "Upload documents once. Automatically structure receipts, invoices, and records.",
      subtext: "Generate organized datasets ready for reporting.",
      learnMoreHref: "/products/smart-storage",
      launchHref: "/tools/smart-storage",
      icon: <StorageIcon className="h-6 w-6" />,
    },
    {
      name: "Smart Dashboard",
      description: "Transform structured information into clear visual insights.",
      subtext: "Interactive dashboards built from real activity data.",
      learnMoreHref: "/products/smart-dashboard",
      launchHref: "/tools/smart-dashboard",
      icon: <DashboardIcon className="h-6 w-6" />,
    },
  ]

  return (
    <section id="tools" className="border-t border-border bg-muted/30 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-sm font-medium uppercase tracking-wider text-primary">
          Tools
        </h2>
        <div className="mt-12 grid gap-6 md:grid-cols-2">
          {tools.map(tool => (
            <ToolCard
              key={tool.name}
              {...tool}
              session={session}
              sessionLoaded={sessionLoaded}
              onTryFree={() => setAuthTarget(tool.launchHref)}
            />
          ))}
        </div>
      </div>

      {authTarget && (
        <AuthGuardModal isVisible={true} onSuccess={handleAuthSuccess} />
      )}
    </section>
  )
}
