do $$
begin
  alter publication supabase_realtime add table processing_jobs;
exception
  when duplicate_object then null;
end $$;

select public.sweep_stuck_processing_jobs();
