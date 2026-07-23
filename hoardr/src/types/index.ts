// ── Enums ──────────────────────────────────────────────────────────────────

export type BillingCycle     = 'Weekly' | 'Monthly' | 'Quarterly' | 'BiWeekly' | 'Annual'
export type ExpenseStatus    = 'Ordered' | 'Procured'
// Lifecycle: Interested → Ordered (bought) → Delivered (arrived).
// The DB enum also still carries a legacy 'Purchased' value that the app no longer writes.
export type WishlistStatus   = 'Interested' | 'Ordered' | 'Delivered'
export type SubStatus        = 'Active' | 'Cancelled'
export type CardType         = 'Credit' | 'Debit' | 'Prepaid' | 'Business'
export type CardStyle        = 'black' | 'gold' | 'green' | 'platinum' | 'sapphire' | 'cobalt' | 'graphite' | 'ruby' | 'midnight' | 'rose' | 'forest' | 'obsidian'
export type CardTexture      = 'none' | 'diamonds' | 'slate' | 'fractal' | 'grid' | 'chevron' | 'carbon' | 'topography'
export type CardNetwork      = 'Visa' | 'Mastercard' | 'Amex' | 'Discover'
export type BankType         = 'Checking' | 'Savings' | 'Investment' | 'Business'
export type IncomeSource     = 'Repayment' | 'Refund' | 'Projects' | 'Freelance' | 'Other'
export type CommissionStatus = 'Pending' | 'Approved' | 'In Progress' | 'Completed' | 'Paid'
export type LedgerType       = 'Expense' | 'Income' | 'Subscription'

// ── Database tables ────────────────────────────────────────────────────────

export interface Profile {
  id:                   string
  display_name:         string | null
  timezone:             string
  default_card_id:      string | null
  google_refresh_token: string | null   // for Google Calendar CRUD
  calendar_prefs:       Record<string, unknown> | null  // jsonb: { visibleTypes, googleCalendarIds }
  avatar_url:           string | null    // Supabase Storage avatars bucket
  created_at:           string
}

export interface Category {
  id:         string
  user_id:    string
  name:       string
  color:      string
  icon:       string             // Lucide component name, default 'LayoutGrid'
  tx_type:    'Expense' | 'Income'
  created_at: string
}

export interface Bank {
  id:                 string
  user_id:            string
  name:               string
  type:               BankType | null
  last4:              string | null
  balance:            number | null
  apy:                number | null
  next_interest_date: string | null
  interest_freq:      string | null
  created_at:         string
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
  texture:     CardTexture
  is_default:  boolean
  sort_order:  number             // long-press drag-to-reorder
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
  category:      string | null      // text label — the app writes this, NOT category_id
  url:           string | null      // buy link — the app writes this, NOT link
  original_cost: number | null      // list price
  bought_cost:   number | null      // what was actually paid, set on buy (Ordered)
  ordered_at:    string | null      // YYYY-MM-DD purchase/paid date (Ordered)
  delivered_at:  string | null      // YYYY-MM-DD arrival date (Delivered)
  status:        WishlistStatus
  created_at:    string
  // Legacy columns still present in the table but unused by the app — do not write:
  //   category_id uuid, link text, expense_id uuid
}

export interface Subscription {
  id:            string
  user_id:       string
  name:          string
  billing:       BillingCycle
  card_id:       string | null      // mutually exclusive with bank_id (Direct toggle)
  bank_id:       string | null      // set when the sub charges a bank directly
  cost:          number
  last_renewal:  string | null
  next_renewal:  string | null
  category:      string | null      // text label — the app writes this, NOT category_id
  category_id:   string | null      // legacy FK, unused by the app
  status:        SubStatus
  payments:      number
  monthly_cost:  number | null      // stored, recomputed on every write
  annual_cost:   number | null      // stored, recomputed on every write
  cal_event_id:  string | null      // Google Calendar event ID for next renewal
  created_at:    string
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
