ALTER TABLE orders ADD COLUMN customer_refund_pence BIGINT NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN customer_refund_reason VARCHAR(40);
ALTER TABLE orders ADD COLUMN customer_refunded_at DATETIME;
