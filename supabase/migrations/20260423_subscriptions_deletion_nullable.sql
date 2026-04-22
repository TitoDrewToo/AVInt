-- Allow account deletion to anonymize retained subscription rows.
--
-- delete_user_data() intentionally keeps subscription rows for finance /
-- chargeback audit, but removes identifying account fields by setting user_id
-- and email to null. Production may still have NOT NULL constraints from older
-- dashboard-created schema, so drop both constraints defensively.

alter table public.subscriptions alter column user_id drop not null;
alter table public.subscriptions alter column email drop not null;
