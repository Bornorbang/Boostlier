CREATE TABLE admin_id_sequence (name VARCHAR(32) PRIMARY KEY,next_id BIGINT NOT NULL);
INSERT INTO admin_id_sequence (name,next_id) VALUES ('records',1);
CREATE TABLE admin_numeric_ids (number BIGINT PRIMARY KEY,resource_type VARCHAR(40) NOT NULL,resource_id VARCHAR(32) NOT NULL,UNIQUE(resource_type,resource_id));
