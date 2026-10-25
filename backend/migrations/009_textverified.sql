CREATE TABLE textverified_cache (id VARCHAR(120) PRIMARY KEY,payload TEXT NOT NULL,expires_at DATETIME NOT NULL);
CREATE TABLE number_provider_requests (
 intent_id VARCHAR(32) PRIMARY KEY,
 request_payload TEXT NOT NULL,
 details_href TEXT,
 status VARCHAR(24) NOT NULL,
 updated_at DATETIME NOT NULL,
 FOREIGN KEY(intent_id) REFERENCES orders(id)
);
ALTER TABLE orders ADD COLUMN provider_state VARCHAR(60);
ALTER TABLE orders ADD COLUMN can_cancel INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN last_status_at DATETIME;
