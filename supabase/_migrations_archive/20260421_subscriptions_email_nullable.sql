-- Allow subscriptions.email to be null.
--
-- When an account is deleted, delete_user_data() anonymizes subscription rows
-- by nulling user_id + email and keeping the non-identifying finance fields
-- (plan, tier, provider IDs, dates) for chargeback, refund, and tax compliance
-- audit. The NOT NULL on email blocks that anonymization, so we drop it.
--
-- Webhook writes still always supply email (app/api/webhooks/creem/route.ts),
-- so live subscription rows continue to carry it — only deleted-user rows are
-- ever null.

alter table subscriptions alter column email drop not null;
