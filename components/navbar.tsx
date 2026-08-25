"use client"

import Link from "next/link"
import Image from "next/image"
import type { MouseEvent, ReactNode } from "react"
import { useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { ChevronDown, Menu, Moon, Sun, User, X } from "lucide-react"
import type { Session } from "@supabase/supabase-js"
import { AccountPanel } from "@/components/account-panel"
import {
  MARKETING_SCROLL_RESET_PATHS,
  scrollMarketingPageToTop,
} from "@/components/marketing-scroll-reset"
import { SystemStatusIndicator } from "@/components/ui/system-status-indicator"
import { ProductAssistantPreview } from "@/components/product-assistant-preview"
import { supabase } from "@/lib/supabase"
import { useEntitlement } from "@/hooks/use-entitlement"
import { MCP_CONNECTOR_CLIENT_ENABLED } from "@/lib/mcp-config"

const studioTools = [
  { name: "Smart Storage", href: "/tools/smart-storage" },
  { name: "Smart Dashboard", href: "/tools/smart-dashboard" },
]

const toolLinks = [
  ...studioTools,
  ...(MCP_CONNECTOR_CLIENT_ENABLED ? [{ name: "Connect to Claude", href: "/tools/smart-storage/connect" }] : []),
]

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="cw-button-flow glass-surface-sm flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-foreground hover:[box-shadow:0_0_20px_-4px_var(--retro-glow-red)]"
      aria-label="Toggle theme"
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
    </button>
  )
}

function AccountMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="cw-button-flow glass-surface-sm flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-foreground hover:[box-shadow:0_0_20px_-4px_var(--retro-glow-red)]"
      aria-label="Open account menu"
    >
      <User className="h-4 w-4" />
    </button>
  )
}

export function Navbar({ wide = false, toolSlot }: { wide?: boolean; toolSlot?: ReactNode }) {
  const pathname = usePathname()
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)
  const [toolsOpen, setToolsOpen] = useState(false)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)
  const toolsOpenTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toolsCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const entitlement = useEntitlement(session)
  const showTools = Boolean(session && !entitlement.loading && entitlement.isActive)
  // Product assistant rollout plan:
  // 1. Keep the navbar assistant implementation in the codebase.
  // 2. Keep it hidden for all users until the wiki-backed knowledge source is ready.
  // 3. When the real wiki mapping is ready, replace the hard `false` below with
  //    `session && hasActiveSubscription` to enable it only for active subscribers.
  const assistantRolloutEnabled = false
  const showAssistantPreview = assistantRolloutEnabled && Boolean(session && entitlement.isActive)

  function clearToolsTimers() {
    if (toolsOpenTimer.current) clearTimeout(toolsOpenTimer.current)
    if (toolsCloseTimer.current) clearTimeout(toolsCloseTimer.current)
    toolsOpenTimer.current = null
    toolsCloseTimer.current = null
  }

  function scheduleToolsOpen() {
    clearToolsTimers()
    if (toolsOpen) return
    toolsOpenTimer.current = setTimeout(() => setToolsOpen(true), 140)
  }

  function scheduleToolsClose() {
    if (toolsOpenTimer.current) clearTimeout(toolsOpenTimer.current)
    toolsOpenTimer.current = null
    if (toolsCloseTimer.current) clearTimeout(toolsCloseTimer.current)
    toolsCloseTimer.current = setTimeout(() => setToolsOpen(false), 220)
  }

  useEffect(() => () => clearToolsTimers(), [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) return
      setSession(data.session)
    }).catch(() => {
      setSession(null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  function handleMarketingLinkClick(
    href: string,
    event?: MouseEvent<HTMLAnchorElement>,
    close?: () => void
  ) {
    close?.()

    if (!MARKETING_SCROLL_RESET_PATHS.has(href)) return

    if (pathname === href) {
      event?.preventDefault()
      scrollMarketingPageToTop()
    }
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full px-4 pt-4">
        <nav className={`glass-surface mx-auto flex items-center justify-between rounded-2xl px-5 py-3 ${
          wide ? "w-full max-w-none" : "max-w-6xl"
        }`}>
          {/* Desktop Logo */}
          <Link
            href="/"
            className="flex-shrink-0"
            onClickCapture={(event) => handleMarketingLinkClick("/", event)}
          >
            <Image
              src="/avintelligence-wordmark.png"
              alt="AVINTELLIGENCE"
              width={180}
              height={36}
              style={{ width: 'auto', height: '34px' }}
              className="hidden brightness-0 md:block dark:brightness-100"
              priority
            />
            <Image
              src="/avintelligence-stacked.svg"
              alt="AVINT"
              width={32}
              height={40}
              style={{ width: 'auto', height: '36px' }}
              className="brightness-0 md:hidden dark:brightness-100"
              priority
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden min-w-0 flex-1 items-center gap-6 md:ml-6 md:flex">
            {showAssistantPreview ? <ProductAssistantPreview /> : null}
            {toolSlot ? (
              <div className="min-w-0 flex-1">{toolSlot}</div>
            ) : null}
            <div className="ml-auto flex shrink-0 items-center gap-6">
            {showTools && (
              <div className="relative" onMouseEnter={scheduleToolsOpen} onMouseLeave={scheduleToolsClose} onFocus={scheduleToolsOpen} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleToolsClose() }}>
                <button
                  type="button"
                  aria-expanded={toolsOpen}
                  aria-haspopup="menu"
                  onClick={() => { clearToolsTimers(); setToolsOpen((open) => !open) }}
                  className="flex items-center gap-1 text-sm font-medium text-foreground/75 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
                  style={{ fontFamily: 'var(--font-aldrich), "Aldrich", var(--font-geist), "Geist", "Geist Fallback", sans-serif' }}
                >
                  Tools
                  <ChevronDown className={`h-4 w-4 transition-transform ${toolsOpen ? "rotate-180" : ""}`} />
                </button>
                {toolsOpen && (
                  <div role="menu" className="glass-surface absolute right-0 top-full mt-3 w-60 rounded-xl p-2" style={{ fontFamily: 'var(--font-aldrich), "Aldrich", var(--font-geist), "Geist", "Geist Fallback", sans-serif' }}>
                    <p className="px-3 pb-1 pt-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Tools</p>
                    {studioTools.map((tool) => (
                      <Link key={tool.href} href={tool.href} target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setToolsOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-foreground/80 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]">
                        {tool.name}
                      </Link>
                    ))}
                    {MCP_CONNECTOR_CLIENT_ENABLED && (
                      <Link href="/tools/smart-storage/connect" target="_blank" rel="noopener noreferrer" role="menuitem" onClick={() => setToolsOpen(false)} className="block rounded-lg px-3 py-2 text-sm text-foreground/80 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]">
                        Connect to Claude
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
            <ThemeToggle />

            <SystemStatusIndicator />

            <AccountMenuButton onClick={() => setAccountPanelOpen(true)} />
            </div>
          </div>

          {/* Mobile Right Side */}
          <div className="flex items-center gap-3 md:hidden">
            {showTools && (
              <button
                type="button"
                onClick={() => setMobileToolsOpen((open) => !open)}
                aria-label={mobileToolsOpen ? "Close tools menu" : "Open tools menu"}
                aria-expanded={mobileToolsOpen}
                className="cw-button-flow glass-surface-sm flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-all hover:text-foreground hover:[box-shadow:0_0_20px_-4px_var(--retro-glow-red)]"
              >
                {mobileToolsOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
            )}
            <ThemeToggle />
            <SystemStatusIndicator />
            <AccountMenuButton onClick={() => setAccountPanelOpen(true)} />
          </div>
        </nav>
        {showTools && mobileToolsOpen && (
          <div className="glass-surface mx-4 mt-2 rounded-2xl p-3 md:hidden" style={{ fontFamily: 'var(--font-aldrich), "Aldrich", var(--font-geist), "Geist", "Geist Fallback", sans-serif' }}>
            {toolLinks.map((tool, index) => (
              <Link key={tool.href} href={tool.href} target="_blank" rel="noopener noreferrer" onClick={() => setMobileToolsOpen(false)} className={`block rounded-lg px-3 py-2.5 text-sm text-foreground/80 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)] ${index === studioTools.length ? "mt-1 border-t border-border/60 pt-3" : ""}`}>
                {tool.name}
              </Link>
            ))}
          </div>
        )}
      </header>

      <AccountPanel
        isOpen={accountPanelOpen}
        onClose={() => setAccountPanelOpen(false)}
      />
    </>
  )
}
