// The projection algorithm is shared with the Edge Functions. Keeping this
// server-only re-export prevents manual-entry paths from bypassing the same
// virtual record contract used by ingestion and normalization.
export { syncVirtualRecord } from "../supabase/functions/_shared/virtual-records"
