CREATE TABLE funding_quotes (
 id VARCHAR(32) PRIMARY KEY,
 user_id VARCHAR(32) NOT NULL,
 amount_cents BIGINT NOT NULL,
 country VARCHAR(2) NOT NULL,
 checkout_currency VARCHAR(3) NOT NULL,
 checkout_minor BIGINT NOT NULL,
 payment_options VARCHAR(255) NOT NULL,
 expires_at DATETIME NOT NULL,
 created_at DATETIME NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
ALTER TABLE payments ADD COLUMN funding_quote_id VARCHAR(32);
ALTER TABLE payments ADD COLUMN checkout_currency VARCHAR(3);
ALTER TABLE payments ADD COLUMN checkout_minor BIGINT;
ALTER TABLE payments ADD COLUMN checkout_url TEXT;
CREATE UNIQUE INDEX payments_funding_quote ON payments(funding_quote_id);
