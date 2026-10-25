CREATE TABLE reward_costs (
 source_id VARCHAR(32) PRIMARY KEY,
 user_id VARCHAR(32) NOT NULL,
 resource_id VARCHAR(32) NOT NULL,
 product VARCHAR(32) NOT NULL,
 ledger_reference VARCHAR(160) NOT NULL UNIQUE,
 cost_pence BIGINT NOT NULL,
 fx_numerator BIGINT NOT NULL,
 fx_denominator BIGINT NOT NULL,
 settled_at DATETIME,
 created_at DATETIME NOT NULL,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX reward_costs_owner ON reward_costs(user_id,created_at);
INSERT INTO settings (name,value,updated_at) VALUES ('rewards_v2','{"enabled":true,"hold_days":7,"cashback_spend_bps":50,"cashback_margin_bps":500,"referral_spend_bps":100,"referral_margin_bps":500,"referral_min_spend_pence":1000,"referral_cap_pence":200,"claim_min_pence":10}','2026-10-21 00:00:00');
