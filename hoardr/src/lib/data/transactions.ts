export interface SeedTx {
  id:       string
  type:     'Expense' | 'Income'
  name:     string
  category: string
  date:     string  // YYYY-MM-DD
  amount:   number  // always positive
}

export interface TxCategory {
  name:  string
  emoji: string
}

export const EXPENSE_CATEGORIES: TxCategory[] = [
  { name: 'Food & Drink',  emoji: '🍽️' },
  { name: 'Coffee',        emoji: '☕'  },
  { name: 'Shopping',      emoji: '🛍️' },
  { name: 'Transport',     emoji: '🚗'  },
  { name: 'Entertainment', emoji: '🎬'  },
  { name: 'Housing',       emoji: '🏠'  },
  { name: 'Health',        emoji: '💊'  },
  { name: 'Travel',        emoji: '✈️'  },
  { name: 'Utilities',     emoji: '📱'  },
  { name: 'Business',      emoji: '💼'  },
  { name: 'Subscriptions', emoji: '♻️'  },
  { name: 'Other',         emoji: '💰'  },
]

export const INCOME_CATEGORIES: TxCategory[] = [
  { name: 'Freelance',  emoji: '💵' },
  { name: 'Projects',   emoji: '🎨' },
  { name: 'Repayment',  emoji: '🔄' },
  { name: 'Refund',     emoji: '↩️' },
  { name: 'Other',      emoji: '💰' },
]

export function getCategoryEmoji(name: string, type: 'Expense' | 'Income'): string {
  const list = type === 'Expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES
  return list.find(c => c.name === name)?.emoji ?? '💰'
}

// Sorted newest-first so groupByMonth preserves that order within each month
export const SEED_TRANSACTIONS: SeedTx[] = [
  // May 2026
  { id: 't01', type: 'Expense', name: 'Blue Bottle',  category: 'Coffee',        date: '2026-05-05', amount: 12.50   },
  { id: 't02', type: 'Expense', name: 'Yardbird',     category: 'Food & Drink',  date: '2026-05-05', amount: 78.40   },
  { id: 't03', type: 'Expense', name: 'Uber',         category: 'Transport',     date: '2026-05-04', amount: 45.00   },
  { id: 't04', type: 'Income',  name: 'Studio Co',    category: 'Projects',      date: '2026-05-04', amount: 4800.00 },
  { id: 't05', type: 'Expense', name: 'COS',          category: 'Shopping',      date: '2026-05-03', amount: 1240.00 },
  { id: 't06', type: 'Expense', name: 'Verizon',      category: 'Utilities',     date: '2026-05-03', amount: 89.99   },
  { id: 't07', type: 'Expense', name: 'Spotify',      category: 'Subscriptions', date: '2026-05-02', amount: 11.99   },
  { id: 't08', type: 'Income',  name: 'Freelance',    category: 'Freelance',     date: '2026-05-01', amount: 220.00  },
  // April 2026
  { id: 't09', type: 'Expense', name: 'Apple Store',  category: 'Shopping',      date: '2026-04-28', amount: 349.00  },
  { id: 't10', type: 'Expense', name: 'H Mart',       category: 'Food & Drink',  date: '2026-04-25', amount: 67.50   },
  { id: 't11', type: 'Expense', name: 'Lyft',         category: 'Transport',     date: '2026-04-23', amount: 28.00   },
  { id: 't12', type: 'Expense', name: 'Netflix',      category: 'Subscriptions', date: '2026-04-22', amount: 22.99   },
  { id: 't13', type: 'Income',  name: 'Commission',   category: 'Projects',      date: '2026-04-20', amount: 1500.00 },
  { id: 't14', type: 'Expense', name: 'Equinox',      category: 'Health',        date: '2026-04-15', amount: 185.00  },
  { id: 't15', type: 'Expense', name: 'JetBlue',      category: 'Travel',        date: '2026-04-10', amount: 320.00  },
  { id: 't16', type: 'Expense', name: 'iCloud+',      category: 'Subscriptions', date: '2026-04-08', amount: 9.99    },
  { id: 't17', type: 'Income',  name: 'Repayment',    category: 'Repayment',     date: '2026-04-05', amount: 200.00  },
  { id: 't18', type: 'Expense', name: 'Amazon',       category: 'Shopping',      date: '2026-04-03', amount: 45.60   },
]
