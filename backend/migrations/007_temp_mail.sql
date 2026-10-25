CREATE TABLE temp_mail_operations (
 id VARCHAR(32) PRIMARY KEY,
 user_id VARCHAR(32) NOT NULL,
 idempotency_key VARCHAR(100) NOT NULL,
 operation VARCHAR(20) NOT NULL,
 inbox_id VARCHAR(32),
 request_hash VARCHAR(64) NOT NULL,
 price_pence BIGINT NOT NULL,
 status VARCHAR(20) NOT NULL,
 error_code VARCHAR(80),
 created_at DATETIME NOT NULL,
 updated_at DATETIME NOT NULL,
 UNIQUE(user_id,idempotency_key),
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX inboxes_owner_status ON inboxes(user_id,status);
