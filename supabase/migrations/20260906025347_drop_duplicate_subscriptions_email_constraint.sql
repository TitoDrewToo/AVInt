-- subscriptions_email_key and subscriptions_email_unique both enforce the
-- same UNIQUE (email) constraint. No application or database code names
-- subscriptions_email_unique in ON CONFLICT, so retain the conventional
-- subscriptions_email_key constraint and remove only the redundant index.

alter table public.subscriptions
  drop constraint if exists subscriptions_email_unique;
