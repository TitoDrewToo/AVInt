-- User-managed Smart Dashboard pages. Personal and Business are starter
-- examples, not permanent categories. Mutations remain service-role only.

insert into public.dashboard_pages (user_id, name, slug, kind, position)
select existing.user_id, 'Business', 'business', 'business', max(existing.position) + 1
from public.dashboard_pages existing
group by existing.user_id
having not exists (
  select 1 from public.dashboard_pages candidate
  where candidate.user_id = existing.user_id and candidate.slug = 'business'
)
on conflict (user_id, slug) do nothing;

create or replace function public.create_dashboard_page(
  p_user_id uuid,
  p_name text,
  p_slug_base text,
  p_max_pages integer default 50
)
returns public.dashboard_pages
language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_position integer;
  v_suffix integer := 1;
  v_slug text := p_slug_base;
  v_page public.dashboard_pages;
begin
  perform pg_advisory_xact_lock(hashtextextended('dashboard-pages:' || p_user_id::text, 0));
  select count(*), coalesce(max(position), -1) + 1 into v_count, v_position
  from public.dashboard_pages where user_id = p_user_id;
  if v_count >= p_max_pages then
    raise exception 'Dashboard page limit reached' using errcode = 'P0001';
  end if;
  while exists (select 1 from public.dashboard_pages where user_id = p_user_id and slug = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := left(p_slug_base, 70 - length(v_suffix::text)) || '-' || v_suffix::text;
  end loop;
  insert into public.dashboard_pages (user_id, name, slug, kind, position)
  values (p_user_id, p_name, v_slug, 'custom', v_position)
  returning * into v_page;
  return v_page;
end;
$$;

create or replace function public.reorder_dashboard_pages(p_user_id uuid, p_page_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_owned_count integer;
  v_distinct_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('dashboard-pages:' || p_user_id::text, 0));
  select count(*) into v_owned_count from public.dashboard_pages where user_id = p_user_id;
  select count(distinct page_id) into v_distinct_count from unnest(p_page_ids) page_id;
  if cardinality(p_page_ids) <> v_owned_count or v_distinct_count <> v_owned_count
    or exists (select 1 from unnest(p_page_ids) page_id where not exists (
      select 1 from public.dashboard_pages p where p.id = page_id and p.user_id = p_user_id
    )) then
    raise exception 'Page order must contain every owned page exactly once' using errcode = '22023';
  end if;
  update public.dashboard_pages page
  set position = ordered.position - 1, updated_at = now()
  from unnest(p_page_ids) with ordinality ordered(page_id, position)
  where page.id = ordered.page_id and page.user_id = p_user_id;
end;
$$;

create or replace function public.delete_dashboard_page(p_user_id uuid, p_page_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_target public.dashboard_pages;
  v_fallback public.dashboard_pages;
  v_moved bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('dashboard-pages:' || p_user_id::text, 0));
  select * into v_target from public.dashboard_pages where id = p_page_id and user_id = p_user_id;
  if not found then raise exception 'Dashboard page does not exist' using errcode = 'P0002'; end if;
  select * into v_fallback from public.dashboard_pages
  where user_id = p_user_id and id <> p_page_id order by position, created_at limit 1;
  if not found then raise exception 'The last dashboard page cannot be deleted' using errcode = '23000'; end if;

  update public.advanced_widgets set page_id = v_fallback.id, is_plotted = false
  where user_id = p_user_id and page_id = p_page_id;
  get diagnostics v_moved = row_count;
  delete from public.dashboard_pages where id = p_page_id and user_id = p_user_id;
  return jsonb_build_object(
    'deletedPageId', p_page_id,
    'fallbackPageId', v_fallback.id,
    'fallbackPageSlug', v_fallback.slug,
    'movedVisuals', v_moved
  );
end;
$$;

revoke all on function public.create_dashboard_page(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.reorder_dashboard_pages(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.delete_dashboard_page(uuid, uuid) from public, anon, authenticated;
grant execute on function public.create_dashboard_page(uuid, text, text, integer) to service_role;
grant execute on function public.reorder_dashboard_pages(uuid, uuid[]) to service_role;
grant execute on function public.delete_dashboard_page(uuid, uuid) to service_role;
