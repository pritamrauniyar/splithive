-- Audit log for expense actions
CREATE TABLE IF NOT EXISTS expense_audit (
  id INT AUTO_INCREMENT PRIMARY KEY,
  expense_id INT NULL,
  group_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  action ENUM('create','update','delete') NOT NULL,
  snapshot TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_group FOREIGN KEY (group_id) REFERENCES `groups`(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_audit_expense FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL
);

-- MySQL 5.7 compatible index creation
ALTER TABLE expense_audit ADD INDEX idx_audit_group_time (group_id, created_at);
ALTER TABLE expense_audit ADD INDEX idx_audit_expense (expense_id);
