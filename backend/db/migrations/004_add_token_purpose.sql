-- Add purpose column to verification_tokens to distinguish use-cases
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'verification_tokens'
    AND COLUMN_NAME = 'purpose'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE verification_tokens ADD COLUMN purpose VARCHAR(20) NOT NULL DEFAULT ''email_verify'' AFTER token',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

