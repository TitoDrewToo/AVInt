-- 1. SECURITY: remove a policy that granted every role full access to every row.
--
-- "Service role can upsert summaries" was PERMISSIVE, TO public, FOR ALL,
-- USING true, WITH CHECK true. Permissive policies are OR'd, so it overrode the
-- sibling owner-scoped policy for every caller including anon: any signed-in
-- user could read, insert, update or delete another user's context summary.
-- Proven in a rolled-back transaction on 6 Sep 2026 before removal.
--
-- The policy was never needed: service_role bypasses RLS entirely. Removing it
-- leaves "Users can read own summary" (auth.uid() = user_id) as the only
-- policy, which is the intended behaviour. The table held 0 rows at the time of
-- the fix, so no data was exposed.
DROP POLICY IF EXISTS "Service role can upsert summaries" ON public.context_summaries;

-- 2. PERFORMANCE: cover foreign keys that had no index. Purely additive.
CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_id      ON public.ai_usage_events (user_id);
CREATE INDEX IF NOT EXISTS idx_error_groups_action_taken_by ON public.error_groups (action_taken_by);
CREATE INDEX IF NOT EXISTS idx_error_groups_reviewed_by     ON public.error_groups (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_files_folder_id              ON public.files (folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent_id            ON public.folders (parent_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_id              ON public.folders (user_id);
CREATE INDEX IF NOT EXISTS idx_gift_codes_issued_by_user_id ON public.gift_codes (issued_by_user_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_file_id      ON public.processing_jobs (file_id);
