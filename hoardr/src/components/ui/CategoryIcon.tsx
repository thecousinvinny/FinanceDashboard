import {
  Utensils, Coffee, ShoppingBag, Car, Tv2, Home, Heart, Plane,
  Zap, Briefcase, RefreshCw, LayoutGrid, Laptop, Palette,
  ArrowLeftRight, Undo2, type LucideIcon,
} from 'lucide-react'

const EXPENSE_MAP: Record<string, LucideIcon> = {
  'Food & Drink':  Utensils,
  'Coffee':        Coffee,
  'Shopping':      ShoppingBag,
  'Transport':     Car,
  'Entertainment': Tv2,
  'Housing':       Home,
  'Health':        Heart,
  'Travel':        Plane,
  'Utilities':     Zap,
  'Business':      Briefcase,
  'Subscriptions': RefreshCw,
  'Other':         LayoutGrid,
}

const INCOME_MAP: Record<string, LucideIcon> = {
  'Freelance':  Laptop,
  'Projects':   Palette,
  'Repayment':  ArrowLeftRight,
  'Refund':     Undo2,
  'Other':      LayoutGrid,
}

export function getCategoryIcon(category: string, type: 'Expense' | 'Income'): LucideIcon {
  const map = type === 'Expense' ? EXPENSE_MAP : INCOME_MAP
  return map[category] ?? LayoutGrid
}

interface Props {
  category:    string
  type:        'Expense' | 'Income'
  size?:       number
  className?:  string
  strokeWidth?: number
}

export function CategoryIcon({ category, type, size = 16, className = 'text-ink-muted', strokeWidth = 1.75 }: Props) {
  const Icon = getCategoryIcon(category, type)
  return <Icon size={size} className={className} strokeWidth={strokeWidth} />
}
