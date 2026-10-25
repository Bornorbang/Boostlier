CREATE TABLE transactional_mail (
 id VARCHAR(32) PRIMARY KEY,
 user_id VARCHAR(32) NOT NULL,
 kind VARCHAR(20) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'pending',
 attempts INTEGER NOT NULL DEFAULT 0,
 available_at DATETIME NOT NULL,
 created_at DATETIME NOT NULL,
 expires_at DATETIME NOT NULL,
 lease_until DATETIME,
 sent_at DATETIME,
 FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX transactional_mail_due ON transactional_mail (status,available_at);
