"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function ConnectClient({ oauthEnabled }: { oauthEnabled: boolean }) {
  const mcpUrl = "https://www.avintph.com/api/mcp"
  const [copied, setCopied] = useState(false)

  async function copyMcpUrl() {
    await navigator.clipboard.writeText(mcpUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <Link href="/tools/smart-storage" className="text-sm text-muted-foreground hover:text-foreground">← Smart Storage</Link>
      <div className="mt-8 space-y-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-primary">Smart Storage</p>
          <h1 className="mt-2 text-3xl font-semibold">Connect to Claude</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">{oauthEnabled ? "Connect Claude to Smart Storage with secure WorkOS OAuth." : "OAuth connection is currently unavailable. Please try again later."}</p>
        </div>

        {oauthEnabled && <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6 shadow-[0_18px_60px_-36px_var(--retro-glow-red)]">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Primary connection</p>
          <h2 className="mt-2 text-xl font-medium">Connect to Claude</h2>
          <ol className="mt-5 space-y-4 text-sm text-muted-foreground">
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/40 text-xs font-medium text-primary">1</span><span>In Claude, open <strong className="font-medium text-foreground">Settings → Connectors → Add custom connector</strong>.</span></li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/40 text-xs font-medium text-primary">2</span><span>Paste this URL and click <strong className="font-medium text-foreground">Add</strong>. Leave the optional OAuth Client ID and Secret blank — Claude registers itself.</span></li>
            <li className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/40 text-xs font-medium text-primary">3</span><span>Click <strong className="font-medium text-foreground">Connect</strong>, then sign in with the Google account (or email) that matches your AVIntelligence account. Approve access — done.</span></li>
          </ol>
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-background/80 p-2">
            <code className="min-w-0 flex-1 break-all px-1 text-sm">{mcpUrl}</code>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void copyMcpUrl()}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
          <div className="mt-6 border-t border-primary/15 pt-5">
            <p className="text-sm font-medium text-foreground">What you can do from Claude</p>
            <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
              <li>• Allow Claude access to your custom data intelligence</li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">Available on Pro and Business plans. If the email does not match an AVIntelligence account, you’ll see: <span className="font-medium text-foreground">“Connect requires a Smart Storage account with this email”</span>.</p>
          </div>
        </section>}

        {!oauthEnabled && <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">OAuth sign-in is being configured for this connector. Please check back shortly.</p>}
      </div>
    </main>
  )
}
