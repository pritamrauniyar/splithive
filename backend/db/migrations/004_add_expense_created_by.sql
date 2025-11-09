-- Add created_by to expenses to track who added the expense
ALTER TABLE expenses
  ADD COLUMN created_by INT NULL AFTER payer_id;

ALTER TABLE expenses
  ADD CONSTRAINT fk_exp_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

