"use client"

import Link from "next/link"
import Image from "next/image"
import type { MouseEvent, ReactNode } from "react"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { Menu, X, Sun, Moon, User } from "lucide-react"
import type { Session } from "@supabase/supabase-js"
import { AccountPanel } from "@/components/account-panel"
import {
  MARKETING_SCROLL_RESET_PATHS,
  scrollMarketingPageToTop,
} from "@/components/marketing-scroll-reset"
import { SystemStatusIndicator } from "@/components/ui/system-status-indicator"
import { ProductAssistantPreview } from "@/components/product-assistant-preview"
import { supabase } from "@/lib/supabase"
import { computeEntitlement } from "@/lib/entitlement"

const geistFontStyle = {
  fontFamily: 'var(--font-aldrich), "Aldrich", var(--font-geist), "Geist", "Geist Fallback", sans-serif',
} as const

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false)
  // Product assistant rollout plan:
  // 1. Keep the navbar assistant implementation in the codebase.
  // 2. Keep it hidden for all users until the wiki-backed knowledge source is ready.
  // 3. When the real wiki mapping is ready, replace the hard `false` below with
  //    `session && hasActiveSubscription` to enable it only for active subscribers.
  const assistantRolloutEnabled = false
  const showAssistantPreview = assistantRolloutEnabled && Boolean(session && hasActiveSubscription)

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) return
      setSession(data.session)
      if (data.session?.user?.email) {
        void fetchSubscription(data.session.user.email)
      } else {
        setHasActiveSubscription(false)
      }
    }).catch(() => {
      setSession(null)
      setHasActiveSubscription(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user?.email) {
        void fetchSubscription(nextSession.user.email)
      } else {
        setHasActiveSubscription(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchSubscription(email: string) {
    try {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("email", email)
        .maybeSingle()

      const ent = computeEntitlement(data)
      setHasActiveSubscription(ent.isActive)
    } catch {
      setHasActiveSubscription(false)
    }
  }

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
            {!toolSlot && (
              <>
            <Link
              href="/studio"
              className="text-sm font-medium text-foreground/75 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              style={geistFontStyle}
            >
              Studio
            </Link>
              </>
            )}

            <ThemeToggle />

            <SystemStatusIndicator />

            <AccountMenuButton onClick={() => setAccountPanelOpen(true)} />
            </div>
          </div>

          {/* Mobile Right Side */}
          <div className="flex items-center gap-3 md:hidden">
            <ThemeToggle />
            <SystemStatusIndicator />
            <AccountMenuButton onClick={() => setAccountPanelOpen(true)} />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? (
                <X className="h-6 w-6 text-foreground" />
              ) : (
                <Menu className="h-6 w-6 text-foreground" />
              )}
            </button>
          </div>
        </nav>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="glass-surface mx-4 mt-2 rounded-2xl px-6 py-4 md:hidden">
            <div className="flex flex-col gap-4">
              <Link
                href="/studio"
                className="text-sm text-foreground"
                style={geistFontStyle}
                onClick={() => setMobileMenuOpen(false)}
              >
                Studio
              </Link>
            </div>
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
