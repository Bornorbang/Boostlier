ALTER TABLE fulfilment_intents ADD COLUMN request_payload TEXT;
CREATE TABLE provider_receipts (intent_id VARCHAR(32) PRIMARY KEY,receipt TEXT NOT NULL,created_at DATETIME NOT NULL);
