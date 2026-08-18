# Codex Follow-up — partner intake: return-after-email-confirm
### Small. Email confirmation is ON, so the client must confirm before enrolling. Today the
### confirmation link lands them on the default site page, not back on the firm link → drop-off.

## Task (do)
In `app/partner/[slug]/firm-intake.tsx`, the sign-up call is:
```ts
await supabase.auth.signUp({ email, password })
```
Add `emailRedirectTo` pointing back to the current partner intake page so the confirmation email
returns the client to the firm's link, where the existing `useEffect` auto-enrolls them:
```ts
await supabase.auth.signUp({
  email,
  password,
  options: { emailRedirectTo: `${window.location.origin}/partner/${slug}` },
})
```
Result: client signs up → confirms email → is returned to `/partner/[slug]` (now logged in) →
auto-enrolled + seat consumed. Verified emails, one smooth flow.

## Config step (Andrew — Supabase dashboard)
Add the partner path to **Authentication → URL Configuration → Redirect URLs** allowlist, e.g.
`https://www.avintph.com/partner/**` (wildcard). Without it, Supabase rejects the `emailRedirectTo`
and falls back to the Site URL — the fix won't take effect. (Keep the existing Site URL as-is.)

## Acceptance
- With email confirmation ON, signing up on `/partner/[slug]` sends a confirmation email whose link
  returns the user to `/partner/[slug]`, which then auto-enrolls them (one seat) — no manual
  navigation back.
- TypeScript + lint + build pass.
