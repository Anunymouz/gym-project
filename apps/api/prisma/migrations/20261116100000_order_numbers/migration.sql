-- Human-friendly order numbers (BG-10001, BG-10002, …), unique and never reused.
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START WITH 10001;
