-- Teardown, phase 1 — drop tables with zero live references.
--
-- Approved by Andrew 2026-08-23. Scope is deliberately limited to tables that
-- no code path reads, so this migration cannot change application behaviour.
--
-- public.api_keys
--   Customer-facing MCP key auth, superseded by WorkOS OAuth (lib/mcp-auth.ts).
--   Created by 20260810_mcp_api_keys.sql. Referenced nowhere in app/, lib/,
--   components/, or supabase/functions/ — the creation migration is its only
--   appearance in the repository. Held 2 rows, both named "Claude", both
--   revoked 2026-08-11 at the OAuth cutover. Archived below before drop.
--
--   NOTE: unrelated to the AI provider secrets. OPENAI_API_KEY,
--   ANTHROPIC_API_KEY, GEMINI_API_KEY and SMART_SECURITY_API_KEY are Supabase
--   environment secrets read via Deno.env.get() in the edge functions and are
--   untouched by this migration.
--
-- public.saved_widgets
--   Superseded by public.advanced_widgets. Zero rows, zero references.
--
-- Pre-drop verification (2026-08-23): neither table has FK children, dependent
-- views, dependent functions, or non-internal triggers.

-- Preserve api_keys rows off the hot schema. Service-role only: RLS is enabled
-- with no policies, and anon/authenticated hold no grants. Safe to drop once
-- Andrew confirms the archive is no longer wanted.
create table if not exists public.retired_api_keys_20260823 as
  select * from public.api_keys;

alter table public.retired_api_keys_20260823 enable row level security;
revoke all on public.retired_api_keys_20260823 from anon, authenticated;

drop table if exists public.api_keys;
drop table if exists public.saved_widgets;
