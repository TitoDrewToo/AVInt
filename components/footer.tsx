"use client"

import Image from "next/image"
import Link from "next/link"

function openAccountPanel(view: "privacy" | "terms") {
  window.dispatchEvent(new CustomEvent("open-account-panel", { detail: { view } }))
}

export function Footer() {
  return (
    <footer className="relative mt-16 w-full">
      {/* Ambient red glow rising into the footer — mirrors codewiki's blue wash
          but in our brand palette. Masked at the edges so it fades naturally. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-48"
        style={{
          background:
            "radial-gradient(ellipse at 50% 100%, var(--retro-glow-red) 0%, transparent 65%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent, var(--retro-glow-red), transparent)",
        }}
      />
      <div className="glass-surface-sm relative w-full border-0 font-sans !rounded-none">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 md:flex-row">
          <div className="flex items-center gap-3">
            <Image
              src="/avintelligence-stacked.png"
              alt="AVINTELLIGENCE"
              width={160}
              height={160}
              className="h-8 w-auto shrink-0 brightness-0 dark:brightness-100"
            />
            <span className="text-xs text-foreground/50">
              © 2026 AVINTPH Information Technology Solutions
            </span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link
              href="/blog"
              className="text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
            >
              Blog
            </Link>
            <Link
              href="/privacy"
              className="text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
            >
              Terms
            </Link>
            <a
              href="mailto:support@avintph.com"
              className="text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
            >
              support@avintph.com
            </a>
            <Link
              href="https://forms.gle/E24gjqAnv6xmF31H8"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-foreground/55 transition-all hover:text-primary hover:[text-shadow:0_0_16px_var(--retro-glow-red)]"
            >
              Support
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
