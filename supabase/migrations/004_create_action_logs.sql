CREATE TABLE action_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  session_id TEXT NOT NULL,
  step_number INTEGER,
  action_type TEXT NOT NULL,
  url TEXT,
  description TEXT,
  result TEXT,
  screenshot_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
