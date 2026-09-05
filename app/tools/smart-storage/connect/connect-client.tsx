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
          <h1 className="mt-2 text-3xl font-semibold">Connect Smart Storage to your AI workspace</h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">{oauthEnabled ? "Use one secure MCP endpoint with Claude, ChatGPT Desktop, Codex, or another compatible MCP client. Each client works against the normalized records in your own Smart Storage account." : "OAuth connection is currently unavailable. Please try again later."}</p>
        </div>

        {oauthEnabled && <section className="rounded-2xl border border-primary/30 bg-primary/5 p-6 shadow-[0_18px_60px_-36px_var(--retro-glow-red)]">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Connection endpoint</p>
          <h2 className="mt-2 text-xl font-medium">One endpoint. Use the AI workspace you prefer.</h2>
          <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-background/80 p-2">
            <code className="min-w-0 flex-1 break-all px-1 text-sm">{mcpUrl}</code>
            <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void copyMcpUrl()}>
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="rounded-xl border border-border/70 bg-background/45 p-5">
              <h3 className="font-medium text-foreground">Claude</h3>
              <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li><strong className="font-medium text-foreground">1.</strong> Open <strong className="font-medium text-foreground">Settings → Connectors → Add custom connector</strong>.</li>
                <li><strong className="font-medium text-foreground">2.</strong> Paste the endpoint above and select <strong className="font-medium text-foreground">Add</strong>. Leave the optional OAuth Client ID and Secret blank.</li>
                <li><strong className="font-medium text-foreground">3.</strong> Select <strong className="font-medium text-foreground">Connect</strong>, then authenticate with the email that matches your AVIntelligence account.</li>
              </ol>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/45 p-5">
              <h3 className="font-medium text-foreground">ChatGPT Desktop</h3>
              <ol className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li><strong className="font-medium text-foreground">1.</strong> Open <strong className="font-medium text-foreground">Settings → MCP servers → Add server</strong>.</li>
                <li><strong className="font-medium text-foreground">2.</strong> Choose <strong className="font-medium text-foreground">Streamable HTTP</strong>, name the server Smart Storage, and paste the endpoint above.</li>
                <li><strong className="font-medium text-foreground">3.</strong> Save and restart ChatGPT Desktop, then select <strong className="font-medium text-foreground">Authenticate</strong>.</li>
              </ol>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/45 p-5">
              <h3 className="font-medium text-foreground">Codex CLI or IDE extension</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Add the same remote server from the Codex MCP settings, or run:</p>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-background/80 p-3 text-xs text-foreground"><code>{`codex mcp add avintelligence --url ${mcpUrl}\ncodex mcp login avintelligence`}</code></pre>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">ChatGPT Desktop, Codex CLI, and the Codex IDE extension can share MCP configuration on the same computer.</p>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/45 p-5">
              <h3 className="font-medium text-foreground">Google Antigravity</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">In the IDE agent panel, open <strong className="font-medium text-foreground">… → MCP Servers → Manage MCP Servers → View raw config</strong>. Add this entry inside the existing <code className="text-foreground">mcpServers</code> object:</p>
              <pre className="mt-3 overflow-x-auto rounded-lg border border-border bg-background/80 p-3 text-xs text-foreground"><code>{`"avintelligence": {\n  "serverUrl": "${mcpUrl}"\n}`}</code></pre>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Save and refresh the server list, then select <strong className="font-medium text-foreground">Authenticate</strong>. Antigravity uses <code className="text-foreground">serverUrl</code> for remote MCP connections. Its global config is <code className="text-foreground">~/.gemini/config/mcp_config.json</code>; a workspace can instead use <code className="text-foreground">.agents/mcp_config.json</code>.</p>
            </div>
          </div>

          <div className="mt-6 border-t border-primary/15 pt-5">
            <p className="text-sm font-medium text-foreground">What your AI can do with Smart Storage</p>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">Smart Storage is the durable data layer behind the conversation. Personal or business files are ingested once, normalized into inspectable records, and kept available as your history grows. Your connected AI can then work from that governed evidence without rebuilding context from loose attachments.</p>
            <ul className="mt-3 grid gap-3 text-sm text-muted-foreground">
              <li>• Inspect your current data model, available fields, currencies, review state, and source provenance.</li>
              <li>• Search normalized records and investigate patterns or relationships supported by the information in your files.</li>
              <li>• Create, save, and rerun refreshable custom reports using validated report definitions—not one-time prose.</li>
              <li>• Run supported Tax Bundle and Business Expense reports with optional date and folder scope.</li>
              <li>• List or save supported Smart Dashboard visualizations from your current data.</li>
              <li>• Generate import-ready QuickBooks or Xero CSV output.</li>
              <li>• Add new receipts, invoices, payslips, or statements and send them through the standard Smart Storage ingestion flow.</li>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">Results are computed from your latest stored data. Saved reports and supported visuals can be refreshed as that data changes; coverage gaps and incompatible currencies are surfaced rather than silently combined. MCP access is available on Pro and Business plans. Client availability may depend on app version or workspace policy.</p>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Authenticate with the same email as your AVIntelligence account. If it does not match, you’ll see: <span className="font-medium text-foreground">“Connect requires a Smart Storage account with this email”</span>.</p>
          </div>
        </section>}

        {!oauthEnabled && <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">OAuth sign-in is being configured for this connector. Please check back shortly.</p>}
      </div>
    </main>
  )
}
