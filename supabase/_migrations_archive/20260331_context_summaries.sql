-- Context summaries: one row per user, upserted on each generation
CREATE TABLE IF NOT EXISTS context_summaries (
  id             uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  summary        text        NOT NULL,
  generated_at   timestamptz NOT NULL DEFAULT now(),
  document_count integer,
  ai_provider    text        DEFAULT 'anthropic',
  UNIQUE (user_id)
);

ALTER TABLE context_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own summary"
  ON context_summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can upsert summaries"
  ON context_summaries FOR ALL
  USING (true)
  WITH CHECK (true);
