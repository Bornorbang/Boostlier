CREATE TABLE oauth_states (state_hash VARCHAR(64) PRIMARY KEY,verifier VARCHAR(160) NOT NULL,expires_at DATETIME NOT NULL);
CREATE TABLE oauth_identities (provider VARCHAR(32) NOT NULL,subject VARCHAR(255) NOT NULL,user_id VARCHAR(32) NOT NULL,PRIMARY KEY(provider,subject),FOREIGN KEY(user_id) REFERENCES users(id));
