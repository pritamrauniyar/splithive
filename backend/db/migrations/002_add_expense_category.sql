-- Idempotent: only add the column if it doesn't already exist
SET @col_exists := (
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'expenses'
    AND COLUMN_NAME = 'category'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE expenses ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT ''General'' AFTER description',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
