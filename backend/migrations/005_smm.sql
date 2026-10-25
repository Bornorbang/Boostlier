CREATE TABLE smm_catalogue_cache (id VARCHAR(32) PRIMARY KEY,payload TEXT NOT NULL,updated_at DATETIME NOT NULL);
ALTER TABLE smm_orders ADD COLUMN service_name VARCHAR(255);
ALTER TABLE smm_orders ADD COLUMN refill_supported INTEGER NOT NULL DEFAULT 0;
ALTER TABLE smm_orders ADD COLUMN updated_at DATETIME;
ALTER TABLE smm_orders ADD COLUMN last_status_at DATETIME;
ALTER TABLE smm_orders ADD COLUMN provider_status VARCHAR(80);
ALTER TABLE smm_orders ADD COLUMN status_error VARCHAR(255);
ALTER TABLE smm_orders ADD COLUMN cancelled_refund_pence BIGINT NOT NULL DEFAULT 0;
CREATE TABLE smm_refills (id VARCHAR(32) PRIMARY KEY,order_id VARCHAR(32) NOT NULL,provider_refill_id VARCHAR(120) UNIQUE,status VARCHAR(32) NOT NULL,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,FOREIGN KEY(order_id) REFERENCES smm_orders(id));
