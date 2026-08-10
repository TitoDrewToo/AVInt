# Smart Storage MCP OAuth setup

The application delegates MCP OAuth authorization to WorkOS AuthKit/Connect. The app is only the protected resource server: it publishes metadata, verifies WorkOS access tokens, maps the WorkOS user email to the existing Supabase account, and then runs the existing Smart Storage entitlement and tool engine.

## Environment variables

Set these in the same deployment environment as the Next app:

```env
ENABLE_MCP_CONNECTOR=true
ENABLE_MCP_OAUTH=true
NEXT_PUBLIC_ENABLE_MCP_CONNECTOR=true
NEXT_PUBLIC_APP_URL=https://www.example.com

WORKOS_API_KEY=sk_...
WORKOS_CLIENT_ID=client_...
WORKOS_AUTH_DOMAIN=your-subdomain.authkit.app
```

`WORKOS_ISSUER` may be used instead of `WORKOS_AUTH_DOMAIN` when the deployment uses a custom issuer URL. Never expose `WORKOS_API_KEY` to the browser.

The MCP resource identifier is:

```text
https://www.example.com/api/mcp
```

## WorkOS dashboard

1. Create or select the WorkOS project and the production environment.
2. In AuthKit, enable the hosted sign-in methods needed for this connector: Google social login and email authentication. Configure the Google OAuth connection with the Google Cloud OAuth client ID/secret and publish it for the environment.
3. In Connect → Configuration, enable Client ID Metadata Documents (CIMD). Enable Dynamic Client Registration (DCR) as the backwards-compatible option for MCP clients that still use RFC 7591 registration.
4. Add `https://www.example.com/api/mcp` as a Resource Indicator and make it the default Resource Indicator so clients that omit `resource` still receive tokens for this resource.
5. Confirm the AuthKit domain exposes:
   - `https://your-subdomain.authkit.app/.well-known/oauth-authorization-server`
   - `https://your-subdomain.authkit.app/oauth2/jwks`
6. Use the WorkOS environment’s API key and Connect/AuthKit client ID in the application environment variables above.

Claude supplies its own OAuth redirect URI during the CIMD/DCR flow; it is not an AVIntelligence callback and must not be hardcoded into this app. If the WorkOS dashboard asks for redirect URIs for a manually-created OAuth application, use the redirect URI supplied by the MCP client, or use CIMD/DCR instead of pre-registering Claude as a fixed client.

## Identity matching

The WorkOS Google/email login must use the same email address as the user’s existing Smart Storage Supabase account. After WorkOS validates the token, the resource server looks up that email in `auth.users`; it does not create or silently link accounts. A missing match returns:

> Connect requires a Smart Storage account with this email

## Endpoints

- MCP resource metadata: `/.well-known/oauth-protected-resource`
- Compatibility authorization-server metadata proxy: `/.well-known/oauth-authorization-server`
- MCP resource: `/api/mcp`

Keep `ENABLE_MCP_OAUTH=false` until the WorkOS dashboard configuration and a real Claude “Add custom connector” flow have been reviewed. API-key clients continue to work when OAuth is enabled.
