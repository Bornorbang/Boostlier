ALTER TABLE orders ADD COLUMN rental_duration VARCHAR(24);
ALTER TABLE orders ADD COLUMN rental_refundable INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN rental_details_href TEXT;
CREATE TABLE number_rental_requests (
 intent_id VARCHAR(32) PRIMARY KEY,
 operation VARCHAR(24) NOT NULL,
 request_payload TEXT NOT NULL,
 state VARCHAR(32) NOT NULL,
 details_href TEXT,
 receipt TEXT,
 created_at DATETIME NOT NULL,
 updated_at DATETIME NOT NULL
);
