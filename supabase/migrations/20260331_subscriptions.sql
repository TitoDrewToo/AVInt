-- Subscriptions table — tracks LemonSqueezy purchases and subscription state
-- status values: 'free' | 'pro' | 'day_pass' | 'gift_code' | 'cancelled'
-- plan values:   'monthly' | 'annual' | 'day_pass' | 'gift_code'
CREATE TABLE IF NOT EXISTS subscriptions (
  id                           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  email                        text        NOT NULL,
  status                       text        NOT NULL DEFAULT 'free',
  plan                         text,
  product_name                 text,
  variant_id                   text,
  lemonsqueezy_customer_id     text,
  lemonsqueezy_subscription_id text,
  lemonsqueezy_order_id        text,
  current_period_end           timestamptz,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own subscription
CREATE POLICY "Users can read own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Service role (webhook) handles all writes — no user-level insert/update policy needed

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_email   ON subscriptions(email);
CREATE INDEX idx_subscriptions_ls_sub  ON subscriptions(lemonsqueezy_subscription_id);
