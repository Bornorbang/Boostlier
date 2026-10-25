ALTER TABLE funding_quotes ADD COLUMN provider VARCHAR(32) NOT NULL DEFAULT 'flutterwave';
ALTER TABLE payments ADD COLUMN customer_email VARCHAR(254);
