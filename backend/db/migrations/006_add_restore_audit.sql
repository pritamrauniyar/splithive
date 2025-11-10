-- Allow 'restore' action in expense_audit
ALTER TABLE expense_audit 
  MODIFY COLUMN action ENUM('create','update','delete','restore') NOT NULL;

