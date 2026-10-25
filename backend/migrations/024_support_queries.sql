ALTER TABLE support_tickets ADD COLUMN request_key VARCHAR(100);
ALTER TABLE support_tickets ADD COLUMN request_hash VARCHAR(64);
CREATE UNIQUE INDEX support_request_key ON support_tickets(user_id,request_key);
ALTER TABLE transactional_mail ADD COLUMN support_ticket_id VARCHAR(32);
CREATE UNIQUE INDEX support_email_ticket ON transactional_mail(support_ticket_id);
