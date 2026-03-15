CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  jira_key TEXT NOT NULL,
  summary TEXT,
  priority TEXT,
  urgency_score INTEGER DEFAULT 0,
  status TEXT,
  slack_context JSONB DEFAULT '[]',
  enriched_data JSONB,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, jira_key)
);
