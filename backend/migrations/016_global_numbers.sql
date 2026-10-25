ALTER TABLE orders ADD COLUMN provider_metadata TEXT;
CREATE TABLE fivesim_cache (id VARCHAR(160) PRIMARY KEY,payload MEDIUMTEXT NOT NULL,expires_at DATETIME NOT NULL);
CREATE TABLE fivesim_requests (intent_id VARCHAR(32) PRIMARY KEY,request_payload TEXT NOT NULL,state VARCHAR(24) NOT NULL,provider_response TEXT,receipt TEXT,created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL);
INSERT INTO settings (name,value,updated_at) VALUES ('5sim_pricing','{"currency":"USD","fx_numerator":1,"fx_denominator":1,"fx_mode":"fixed","fx_updated_at":"2026-10-21 00:00:00","retail_margin_pence":70,"wholesale_margin_pence":70,"rounding_pence":1}',CURRENT_TIMESTAMP);
