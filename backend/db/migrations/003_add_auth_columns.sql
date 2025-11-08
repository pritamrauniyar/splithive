-- Idempotent add of users.password_hash and users.email_verified
SET @has_ph := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'password_hash'
);
SET @ddl_ph := IF(@has_ph = 0,
  'ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email',
  'SELECT 1');
PREPARE stmt FROM @ddl_ph; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_ev := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'email_verified'
);
SET @ddl_ev := IF(@has_ev = 0,
  'ALTER TABLE users ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash',
  'SELECT 1');
PREPARE stmt2 FROM @ddl_ev; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- Ensure verification_tokens exists
CREATE TABLE IF NOT EXISTS verification_tokens (
  token VARCHAR(64) PRIMARY KEY,
  user_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  used_at TIMESTAMP NULL,
  purpose VARCHAR(20) NOT NULL DEFAULT 'email_verify',
  CONSTRAINT fk_vt_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
