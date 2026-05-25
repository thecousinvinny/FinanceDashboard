-- income.source was an enum (income_source) with values Repayment/Refund/Projects/Other.
-- Convert to plain text so any source label can be stored without enum constraints.
ALTER TABLE income ALTER COLUMN source TYPE text USING source::text;
DROP TYPE IF EXISTS income_source;
