-- payment_obligations: tracks individual scheduled payment entries
-- extracted from contract/agreement documents (e.g. PH PDC lease schedules)
-- status: 'pending' | 'paid' | 'disputed'
-- Fully idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS payment_obligations (
  id                uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_id           uuid          NOT NULL REFERENCES files(id)      ON DELETE CASCADE,
  counterparty_name text,
  description       text,
  amount            numeric(14,2),
  currency          text          DEFAULT 'PHP',
  due_date          date          NOT NULL,
  status            text          NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'paid', 'disputed')),
  paid_at           date,
  paid_via          text,
  notes             text,
  check_number      text,
  bank_name         text,
  created_at        timestamptz   NOT NULL DEFAULT now(),
  updated_at        timestamptz   NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE payment_obligations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own obligations" ON payment_obligations;
CREATE POLICY "Users can select own obligations"
  ON payment_obligations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own obligations" ON payment_obligations;
CREATE POLICY "Users can insert own obligations"
  ON payment_obligations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own obligations" ON payment_obligations;
CREATE POLICY "Users can update own obligations"
  ON payment_obligations FOR UPDATE
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_obligations_user_due
  ON payment_obligations (user_id, due_date);

CREATE INDEX IF NOT EXISTS idx_payment_obligations_file
  ON payment_obligations (file_id);

-- Deduplication index — COALESCE so NULL check_numbers compare equal
-- (PostgreSQL NULLs are never equal in unique constraints without this)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_payment_obligations_file_due_check
  ON payment_obligations (file_id, due_date, COALESCE(check_number, ''));

-- auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_payment_obligations_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_obligations_updated_at ON payment_obligations;
CREATE TRIGGER trg_payment_obligations_updated_at
  BEFORE UPDATE ON payment_obligations
  FOR EACH ROW EXECUTE FUNCTION update_payment_obligations_updated_at();
