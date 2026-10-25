CREATE TABLE ads (
 id VARCHAR(32) PRIMARY KEY,
 user_id VARCHAR(32) NOT NULL,
 title VARCHAR(100) NOT NULL,
 target_url TEXT NOT NULL,
 banner_file VARCHAR(80) NOT NULL,
 banner_mime VARCHAR(30) NOT NULL,
 request_hash VARCHAR(64) NOT NULL,
 idempotency_key VARCHAR(100) NOT NULL,
 price_pence BIGINT NOT NULL,
 status VARCHAR(20) NOT NULL,
 created_at DATETIME NOT NULL,
 expires_at DATETIME NOT NULL,
 UNIQUE(user_id,idempotency_key),
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX ads_status_expiry ON ads(status,expires_at);
