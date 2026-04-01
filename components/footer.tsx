"use client"

import Image from "next/image"
import Link from "next/link"

function openAccountPanel(view: "privacy" | "terms") {
  window.dispatchEvent(new CustomEvent("open-account-panel", { detail: { view } }))
}

export function Footer() {
  return (
    <footer className="dark border-t border-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-4 md:flex-row md:items-center md:gap-0">
        {/* Logo, copyright, and links - all aligned */}
        <div className="flex flex-col items-center gap-4 md:flex-row md:items-center md:gap-4">
          <Image
            src="/avintelligence-stacked.png"
            alt="AVINTELLIGENCE"
            width={200}
            height={200}
            className="h-32 w-auto shrink-0"
          />
          <span className="text-xs text-muted-foreground">
            © 2026 AVINTPH INFORMATION TECHNOLOGY SOLUTIONS
          </span>
          {/* Footer links */}
          <div className="flex items-center gap-4 md:ml-4">
            <Link
              href="/privacy"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Terms
            </Link>
            <a
              href="mailto:support@avintph.com"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              support@avintph.com
            </a>
            <Link
              href="https://forms.gle/E24gjqAnv6xmF31H8"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-pink-500 transition-colors hover:text-pink-400"
            >
              Support
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
