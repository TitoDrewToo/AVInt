// Single pin point for third-party edge-function dependencies.
//
// Edge functions import these re-exports instead of hitting deno.land /
// esm.sh directly so dep bumps (and supply-chain incident response) are a
// one-file edit rather than a seven-file sweep.
//
// Keep @supabase/supabase-js aligned with the root package.json pin so the
// edge surface and the API/server surface run the same client version.

export { serve } from "https://deno.land/std@0.168.0/http/server.ts"
export { createClient } from "https://esm.sh/@supabase/supabase-js@2.100.1"
