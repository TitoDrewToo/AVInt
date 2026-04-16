"use client"

import Image from "next/image"
import Link from "next/link"

const geistFontStyle = {
  fontFamily: 'var(--font-aldrich), "Aldrich", var(--font-geist), "Geist", "Geist Fallback", sans-serif',
} as const

function openAccountPanel(view: "privacy" | "terms") {
  window.dispatchEvent(new CustomEvent("open-account-panel", { detail: { view } }))
}

export function Footer() {
  return (
    <footer className="relative mt-16 w-full">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--retro-glow-red), transparent)",
        }}
      />
      <div className="glass-surface-sm relative w-full border-0 !rounded-none" style={geistFontStyle}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 md:flex-row">
          <div className="flex items-center gap-3">
            <Image
              src="/avintelligence-stacked.svg"
              alt="AVINTELLIGENCE"
              width={160}
              height={160}
              className="h-8 w-auto shrink-0 brightness-0 dark:brightness-200 dark:contrast-[1.75] dark:saturate-150 dark:[filter:brightness(2.15)_contrast(1.55)_saturate(1.22)_drop-shadow(0_0_14px_rgba(255,255,255,0.5))_drop-shadow(0_0_28px_rgba(255,255,255,0.34))_drop-shadow(0_0_44px_rgba(255,255,255,0.2))]"
            />
            <span className="text-xs text-foreground/50" style={geistFontStyle}>
              © 2026 AVINTPH Information Technology Solutions
            </span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link
              href="/blog"
              className="text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              style={geistFontStyle}
            >
              Blog
            </Link>
            <Link
              href="/privacy"
              className="text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              style={geistFontStyle}
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              style={geistFontStyle}
            >
              Terms
            </Link>
            <a
              href="mailto:support@avintph.com"
              className="text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              style={geistFontStyle}
            >
              support@avintph.com
            </a>
            <Link
              href="https://forms.gle/E24gjqAnv6xmF31H8"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              style={geistFontStyle}
            >
              Support
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
