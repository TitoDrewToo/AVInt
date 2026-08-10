# Connect AVIntelligence Smart Storage to Claude

AVIntelligence Smart Storage works inside Claude (and Claude's Cowork mode) as a
**connector**. Once connected, you can ask Claude to ingest your financial documents,
run a Tax Bundle / business-expense report, and generate a QuickBooks or Xero export —
all against **your own** Smart Storage account.

> Requires an active **Pro** or **Business** plan. Free and Day Pass accounts can connect
> but tool calls return an upgrade prompt.

## Connect in 3 steps (custom connector)

1. In Claude, open **Settings → Connectors → Add custom connector**.
2. Paste this URL and add it:
   ```
   https://www.avintph.com/api/mcp
   ```
   Leave the optional **OAuth Client ID / Secret** fields **blank** — Claude registers
   itself automatically.
3. Click **Connect**, then **Sign in** with the Google account (or email) that matches
   your AVIntelligence account. Approve access and you're done.

That's the entire user flow. You never enter passwords into the connector, and you never
configure OAuth, client IDs, or anything on the WorkOS/provider side — that's all handled
by AVIntelligence.

## What you can ask Claude

- "Ingest these receipts into Smart Storage." (attach up to 6 files)
- "Run my tax bundle report for 2025."
- "Export my expenses as a QuickBooks CSV."

The three tools (`ingest`, `report`, `export`) are set to **Needs approval** by default, so
Claude will ask before each call.

## Important: account matching

Sign in to Claude's connector with the **same email** as your AVIntelligence account.
The connector matches you by email and only ever touches your own documents. If the email
doesn't match an AVIntelligence account, you'll see:

> Connect requires a Smart Storage account with this email

Fix: sign in with the correct email, or create/upgrade the AVIntelligence account for that
email first.

## Troubleshooting

- **"Authorization failed" / connection issue after signing in** — usually a stale token.
  Remove the connector and re-add it, then sign in fresh.
- **Tools return an upgrade message** — the connector is Pro/Business only; upgrade at
  https://www.avintph.com/pricing. Your records are saved.
- **Tools don't appear in a chat** — make sure the connector shows **Connected** in
  Settings → Connectors, then start a new message.

## Privacy & scope

- The connector acts only on the signed-in account's documents; no cross-account access.
- Authentication is delegated to AVIntelligence's managed OAuth (WorkOS). The connector
  server never receives your password.
- `report` and `export` are read-only. `ingest` adds documents you provide.

---

### Reviewer notes (for Anthropic Connectors Directory submission)

- MCP endpoint: `https://www.avintph.com/api/mcp`
- Auth: OAuth 2.1 via WorkOS AuthKit (CIMD + DCR); PKCE S256; resource indicator
  `https://www.avintph.com/api/mcp` set as environment default.
- Metadata endpoints: `/.well-known/oauth-protected-resource`,
  `/.well-known/oauth-authorization-server` (proxy).
- Test account: provide a **Production** Pro account pre-populated with sample receipts,
  invoices, a payslip, and an income statement so every tool returns data.
- All three tools have been exercised end-to-end via a live custom-connector connection.
- NOTE: directory submission must target the **Production** WorkOS environment (Staging is
  used for internal testing); repeat the default resource-indicator setup in Production.
