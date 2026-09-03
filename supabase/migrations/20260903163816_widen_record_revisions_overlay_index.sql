-- applyOverrides now resolves the latest revision per target across
-- user_edit, reclassify and rollback. The partial index covered only
-- user_edit, so it could not serve that query.
drop index if exists public.record_revisions_overlay_idx;

create index record_revisions_overlay_idx
  on public.record_revisions (record_id, target_kind, target, revision_number desc)
  where change_kind in ('user_edit', 'reclassify', 'rollback');
