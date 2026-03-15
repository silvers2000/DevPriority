-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE digests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- users: policy uses id instead of user_id
CREATE POLICY "Users can only access their own rows"
  ON users FOR ALL
  USING (auth.uid() = id);

-- sessions
CREATE POLICY "Users can only access their own rows"
  ON sessions FOR ALL
  USING (auth.uid() = user_id);

-- tasks
CREATE POLICY "Users can only access their own rows"
  ON tasks FOR ALL
  USING (auth.uid() = user_id);

-- action_logs
CREATE POLICY "Users can only access their own rows"
  ON action_logs FOR ALL
  USING (auth.uid() = user_id);

-- digests
CREATE POLICY "Users can only access their own rows"
  ON digests FOR ALL
  USING (auth.uid() = user_id);

-- notifications
CREATE POLICY "Users can only access their own rows"
  ON notifications FOR ALL
  USING (auth.uid() = user_id);

-- permissions
CREATE POLICY "Users can only access their own rows"
  ON permissions FOR ALL
  USING (auth.uid() = user_id);
