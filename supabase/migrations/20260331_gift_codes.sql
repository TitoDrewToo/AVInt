-- Gift codes table — stores LemonSqueezy license keys for gift purchases
-- status: 'pending' = generated, not yet redeemed | 'redeemed' = used
CREATE TABLE IF NOT EXISTS gift_codes (
  id                       uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  code                     text        NOT NULL UNIQUE,
  status                   text        NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'redeemed')),
  plan                     text        NOT NULL DEFAULT 'monthly',  -- monthly | annual | day_pass
  purchased_by_email       text,       -- buyer's email
  redeemed_by_user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at              timestamptz,
  expires_at               timestamptz,                            -- null = no expiry (monthly/annual)
  lemonsqueezy_order_id    text,
  lemonsqueezy_license_id  text,
  created_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE gift_codes ENABLE ROW LEVEL SECURITY;

-- No user-level read on gift_codes — redemption goes through API route (service role)
-- Service role handles all reads/writes

CREATE INDEX idx_gift_codes_code   ON gift_codes(code);
CREATE INDEX idx_gift_codes_status ON gift_codes(status);
