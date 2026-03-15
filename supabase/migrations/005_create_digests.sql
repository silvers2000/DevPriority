CREATE TABLE digests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  ticket_snapshot JSONB NOT NULL,
  summary_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
