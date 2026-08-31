-- AI-generated widgets per user
-- starred OR plotted = permanent (expires_at = null)
-- neither = ephemeral, expires 7 days after creation
CREATE TABLE IF NOT EXISTS advanced_widgets (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  widget_type text        NOT NULL,
  title       text        NOT NULL,
  description text,
  insight     text,
  config      jsonb       DEFAULT '{}',
  is_starred  boolean     NOT NULL DEFAULT false,
  is_plotted  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz          -- null = permanent; set when neither starred nor plotted
);

ALTER TABLE advanced_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own advanced widgets"
  ON advanced_widgets FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_advanced_widgets_user_id   ON advanced_widgets(user_id);
CREATE INDEX idx_advanced_widgets_expires   ON advanced_widgets(expires_at) WHERE expires_at IS NOT NULL;
