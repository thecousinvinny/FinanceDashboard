// ── Enums ──────────────────────────────────────────────────────────────────

export type BillingCycle     = 'Weekly' | 'Monthly' | 'Quarterly' | 'BiWeekly' | 'Annual'
export type ExpenseStatus    = 'Ordered' | 'Procured'
export type WishlistStatus   = 'Interested' | 'Purchased'
export type SubStatus        = 'Active' | 'Cancelled'
export type CardType         = 'Credit' | 'Debit' | 'Prepaid' | 'Business'
export type CardStyle        = 'black' | 'gold' | 'green'
export type CardNetwork      = 'Visa' | 'Mastercard' | 'Amex' | 'Discover'
export type BankType         = 'Checking' | 'Savings' | 'Investment' | 'Business'
export type IncomeSource     = 'Repayment' | 'Refund' | 'Projects' | 'Freelance' | 'Other'
export type CommissionStatus = 'Pending' | 'Approved' | 'In Progress' | 'Completed' | 'Paid'
export type LedgerType       = 'Expense' | 'Income' | 'Subscription'

// ── Database tables ────────────────────────────────────────────────────────

export interface Profile {
  id:              string
  display_name:    string | null
  timezone:        string
  default_card_id: string | null
  created_at:      string
}

export interface Category {
  id:         string
  user_id:    string
  name:       string
  color:      string
  created_at: string
}

export interface Bank {
  id:         string
  user_id:    string
  name:       string
  type:       BankType | null
  last4:      string | null
  created_at: string
}

export interface Card {
  id:          string
  user_id:     string
  bank_id:     string | null
  name:        string
  alias:       string | null
  type:        CardType | null
  last4:       string | null
  network:     CardNetwork | null
  expires:     string | null        // "MM/YY"
  cardholder:  string | null
  style:       CardStyle
  is_default:  boolean
  created_at:  string
  bank?:       Bank
}

export interface Expense {
  id:            string
  user_id:       string
  name:          string
  description:   string | null
  category_id:   string | null
  card_id:       string | null
  date:          string             // YYYY-MM-DD
  status:        ExpenseStatus
  original_cost: number | null
  cost:          number
  savings:       number             // generated column: coalesce(original_cost, cost) - cost
  created_at:    string
  category?:     Category
  card?:         Card
}

export interface WishlistItem {
  id:            string
  user_id:       string
  name:          string
  description:   string | null
  category_id:   string | null
  link:          string | null
  original_cost: number | null
  bought_cost:   number | null      // null until purchased
  status:        WishlistStatus
  expense_id:    string | null      // set when "moved to expenses"
  created_at:    string
  category?:     Category
}

export interface Subscription {
  id:            string
  user_id:       string
  name:          string
  billing:       BillingCycle
  card_id:       string | null
  cost:          number
  last_renewal:  string | null
  next_renewal:  string | null
  category_id:   string | null
  status:        SubStatus
  payments:      number
  monthly_cost:  number | null      // stored, recomputed on every write
  annual_cost:   number | null      // stored, recomputed on every write
  cal_event_id:  string | null      // Google Calendar event ID for next renewal
  created_at:    string
  category?:     Category
  card?:         Card
}

export interface Income {
  id:            string
  user_id:       string
  name:          string
  description:   string | null
  amount:        number
  date:          string
  bank_id:       string | null
  source:        IncomeSource
  commission_id: string | null      // set if created by "Mark Paid" in Studio
  created_at:    string
  bank?:         Bank
}

export interface Commission {
  id:            string
  user_id:       string
  client_name:   string
  project_name:  string
  project_type:  string | null      // e.g. "Portrait pack", "Brand illustration"
  value:         number
  deposit:       number | null
  deadline:      string | null
  status:        CommissionStatus
  notes:         string | null
  cal_event_id:  string | null      // set when Approve fires calendar event
  paid_at:       string | null      // ISO timestamp, set when → Paid
  income_id:     string | null      // set by Mark Paid action
  created_at:    string
}

// ── Ledger view (read-only, never written directly) ───────────────────────

export interface LedgerRow {
  id:            string
  user_id:       string
  date:          string
  type:          LedgerType
  name:          string
  description:   string | null
  cost:          number
  original_cost: number | null
  savings:       number | null
  card_id:       string | null
  bank_id:       string | null
  category_id:   string | null
  billing:       string | null
  status:        string | null
  source:        string | null
  created_at:    string
}

// ── UI helpers ─────────────────────────────────────────────────────────────

export interface MonthGroup {
  label: string       // "May 2026"
  key:   string       // "2026-05"
  rows:  LedgerRow[]
  total: number       // sum of cost (negative for expenses)
}

export interface SubTotals {
  monthly: number
  annual:  number
  count:   number
}

export interface SpendStats {
  totalYear:    number
  totalMonth:   number
  savingsYear:  number
  savingsMonth: number
  subYear:      number
  subMonth:     number
  netWorth:     number
  income:       number
}
