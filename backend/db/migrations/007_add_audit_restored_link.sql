-- Link restored expense to its delete-audit to ensure idempotent restores
ALTER TABLE expense_audit
  ADD COLUMN restored_expense_id INT NULL AFTER snapshot;

ALTER TABLE expense_audit
  ADD CONSTRAINT fk_audit_restored_expense
  FOREIGN KEY (restored_expense_id) REFERENCES expenses(id)
  ON DELETE SET NULL;

CREATE INDEX idx_audit_restored_expense ON expense_audit (restored_expense_id);

