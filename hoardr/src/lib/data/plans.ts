import type { BillingCycle } from '@/types'
import { calcSubCosts } from '@/lib/utils'

export interface SeedSub {
  id:           string
  name:         string
  emoji:        string
  billing:      BillingCycle
  cost:         number
  last_renewal: string   // YYYY-MM-DD
  next_renewal: string   // YYYY-MM-DD
  category:     string
  status:       'Active' | 'Cancelled'
}

export interface SeedWish {
  id:     string
  name:   string
  emoji:  string
  goal:   number
  saved:  number
  status: 'Interested' | 'Purchased'
}

export const SEED_SUBS: SeedSub[] = [
  { id: 's01', name: 'Spotify',   emoji: '🎵', billing: 'Monthly',  cost: 11.99,  last_renewal: '2026-05-02', next_renewal: '2026-06-02', category: 'Entertainment', status: 'Active' },
  { id: 's02', name: 'Netflix',   emoji: '▶️',  billing: 'Monthly',  cost: 22.99,  last_renewal: '2026-04-28', next_renewal: '2026-05-28', category: 'Entertainment', status: 'Active' },
  { id: 's03', name: 'iCloud+',   emoji: '☁️',  billing: 'Monthly',  cost: 9.99,   last_renewal: '2026-04-22', next_renewal: '2026-05-22', category: 'Storage',       status: 'Active' },
  { id: 's04', name: 'Adobe CC',  emoji: '🎨', billing: 'Monthly',  cost: 59.99,  last_renewal: '2026-04-15', next_renewal: '2026-05-15', category: 'Creative',      status: 'Active' },
  { id: 's05', name: 'Notion',    emoji: '📝', billing: 'Annual',   cost: 96.00,  last_renewal: '2026-03-01', next_renewal: '2027-03-01', category: 'Productivity',  status: 'Active' },
  { id: 's06', name: 'GitHub',    emoji: '🐙', billing: 'Monthly',  cost: 4.00,   last_renewal: '2026-05-01', next_renewal: '2026-06-01', category: 'Dev Tools',     status: 'Active' },
]

export const SEED_WISHLIST: SeedWish[] = [
  { id: 'w01', name: 'Sony WH-1000XM5', emoji: '🎧', goal: 350,  saved: 180, status: 'Interested' },
  { id: 'w02', name: 'Keychron Q1',     emoji: '⌨️',  goal: 180,  saved: 90,  status: 'Interested' },
  { id: 'w03', name: 'iPad Pro 13"',    emoji: '📱', goal: 1299, saved: 420, status: 'Interested' },
  { id: 'w04', name: 'Lamy 2000',       emoji: '🖊️',  goal: 165,  saved: 55,  status: 'Interested' },
]

export function subTotals(subs: SeedSub[]) {
  const active = subs.filter(s => s.status === 'Active')
  return active.reduce(
    (acc, s) => {
      const { monthly, annual } = calcSubCosts(s.cost, s.billing)
      return { monthly: acc.monthly + monthly, annual: acc.annual + annual }
    },
    { monthly: 0, annual: 0 },
  )
}
