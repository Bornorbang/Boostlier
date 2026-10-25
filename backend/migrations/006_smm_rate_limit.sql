CREATE TABLE smm_rate_lock (id INTEGER PRIMARY KEY,touched_at DATETIME NOT NULL);
INSERT INTO smm_rate_lock (id,touched_at) VALUES (1,'2000-01-01 00:00:00');
CREATE TABLE smm_requests (id VARCHAR(32) PRIMARY KEY,created_at DATETIME NOT NULL);
