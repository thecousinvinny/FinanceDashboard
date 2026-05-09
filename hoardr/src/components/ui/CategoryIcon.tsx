import {
  Utensils, Gamepad2, Shirt, Laptop, Home, Heart, Plane,
  Zap, Monitor, Sparkles, Gift, Shield, TrendingUp, LayoutGrid,
  ArrowLeftRight, RotateCcw, Palette, RefreshCw,
  type LucideIcon,
} from 'lucide-react'

const EXPENSE_MAP: Record<string, LucideIcon> = {
  // Real categories from Google Sheets
  'Food':      Utensils,
  'Fun':       Gamepad2,
  'Apparel':   Shirt,
  'Tech':      Laptop,
  'Home':      Home,
  'Health':    Heart,
  'Travel':    Plane,
  'Tesla':     Zap,
  'PC':        Monitor,
  'Life':      Sparkles,
  'Gift':      Gift,
  'Insurance': Shield,
  'Stocks':    TrendingUp,
  'Other':     LayoutGrid,
  // Subscriptions shown in expense context
  'Subscriptions': RefreshCw,
}

const INCOME_MAP: Record<string, LucideIcon> = {
  'Repayment': ArrowLeftRight,
  'Refund':    RotateCcw,
  'Freelance': Laptop,
  'Projects':  Palette,
  'Stocks':    TrendingUp,
  'Other':     LayoutGrid,
}

export function getCategoryIcon(category: string, type: 'Expense' | 'Income'): LucideIcon {
  const map = type === 'Expense' ? EXPENSE_MAP : INCOME_MAP
  return map[category] ?? LayoutGrid
}

interface Props {
  category:     string
  type:         'Expense' | 'Income'
  size?:        number
  className?:   string
  strokeWidth?: number
}

export function CategoryIcon({ category, type, size = 16, className = 'text-ink-muted', strokeWidth = 1.75 }: Props) {
  const Icon = getCategoryIcon(category, type)
  return <Icon size={size} className={className} strokeWidth={strokeWidth} />
}
