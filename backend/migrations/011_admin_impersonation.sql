ALTER TABLE sessions ADD COLUMN impersonator_id VARCHAR(32);
ALTER TABLE sessions ADD COLUMN admin_session_hash VARCHAR(64);
CREATE INDEX sessions_admin_parent ON sessions(admin_session_hash);
