-- The previous migration added a third parameter, which created a SECOND
-- function rather than replacing the first. normalize-document calls the RPC
-- with two named arguments and would still resolve to the old, vacuous
-- document_fields-based version. Remove it so only the counter-based
-- implementation exists.
drop function if exists public.avint_settle_document_normalization(uuid, uuid);
