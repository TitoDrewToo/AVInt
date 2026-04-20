"use client"

import Image from "next/image"
import Link from "next/link"
import { Github, Youtube } from "lucide-react"

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
        <div className="mx-auto grid max-w-6xl gap-5 px-6 py-6 md:grid-cols-[0.9fr_auto_1.35fr] md:items-center">
          <div className="flex items-center justify-center gap-6 md:justify-start">
            <Link
              href="https://github.com/TitoDrewToo/AVInt"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="AVIntelligence on GitHub"
              className="text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
            >
              <Github className="h-6 w-6" />
            </Link>
            <Link
              href="https://www.youtube.com/channel/UCYF8-6-c58m0NskmcK8CGWg"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="AVIntelligence on YouTube"
              className="text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
            >
              <Youtube className="h-6 w-6" />
            </Link>
          </div>
          <div className="flex min-w-0 items-center justify-center gap-2 md:gap-3">
            <Image
              src="/avintelligence-stacked.svg"
              alt="AVINTELLIGENCE"
              width={160}
              height={160}
              className="h-7 w-auto shrink-0 brightness-0 dark:brightness-200 dark:contrast-[1.75] dark:saturate-150 dark:[filter:brightness(2.15)_contrast(1.55)_saturate(1.22)_drop-shadow(0_0_14px_rgba(255,255,255,0.5))_drop-shadow(0_0_28px_rgba(255,255,255,0.34))_drop-shadow(0_0_44px_rgba(255,255,255,0.2))] md:h-8"
            />
            <span className="whitespace-nowrap text-[9px] text-foreground/50 min-[360px]:text-[10px] sm:text-xs" style={geistFontStyle}>
              © 2026 AVINTPH Information Technology Solutions
            </span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 md:flex-nowrap md:justify-end md:gap-x-4 md:pl-8">
            <Link
              href="/blog"
              className="whitespace-nowrap text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              style={geistFontStyle}
            >
              Blog
            </Link>
            <Link
              href="/terms"
              className="whitespace-nowrap text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              style={geistFontStyle}
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="whitespace-nowrap text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              style={geistFontStyle}
            >
              Privacy
            </Link>
            <a
              href="mailto:support@avintph.com"
              className="whitespace-nowrap text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
              style={geistFontStyle}
            >
              support@avintph.com
            </a>
            <Link
              href="https://forms.gle/E24gjqAnv6xmF31H8"
              target="_blank"
              rel="noopener noreferrer"
              className="whitespace-nowrap text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
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
