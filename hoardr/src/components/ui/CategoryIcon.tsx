import {
  Utensils, Gamepad2, Shirt, Laptop, Home, Heart, Plane,
  Car, Monitor, Briefcase, Gift, Stethoscope, TrendingUp, LayoutGrid,
  DollarSign, Package, RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { categoryMeta, ICON_REGISTRY, getIconColorMode } from '@/lib/category-meta'

const EXPENSE_DEFAULTS: Record<string, LucideIcon> = {
  'Food':          Utensils,
  'Fun':           Gamepad2,
  'Apparel':       Shirt,
  'Tech':          Laptop,
  'Home':          Home,
  'Health':        Heart,
  'Travel':        Plane,
  'Tesla':         Car,
  'PC':            Monitor,
  'Life':          Briefcase,
  'Gift':          Gift,
  'Insurance':     Stethoscope,
  'Stocks':        TrendingUp,
  'Other':         LayoutGrid,
  'Subscriptions': RefreshCw,
}

const INCOME_DEFAULTS: Record<string, LucideIcon> = {
  'Repayment': DollarSign,
  'Refund':    Package,
  'Freelance': Laptop,
  'Projects':  Briefcase,
  'Stocks':    TrendingUp,
  'Other':     LayoutGrid,
}

export function getCategoryIcon(category: string, type: 'Expense' | 'Income'): LucideIcon {
  const custom = categoryMeta[category]
  if (custom?.icon && ICON_REGISTRY[custom.icon]) return ICON_REGISTRY[custom.icon]
  const map = type === 'Expense' ? EXPENSE_DEFAULTS : INCOME_DEFAULTS
  return map[category] ?? LayoutGrid
}

interface Props {
  category:     string
  type:         'Expense' | 'Income'
  isSub?:       boolean
  size?:        number
  className?:   string
  strokeWidth?: number
}

export function CategoryIcon({ category, type, isSub = false, size = 16, className = 'text-ink-muted', strokeWidth = 1.75 }: Props) {
  const Icon = getCategoryIcon(category, type)

  if (getIconColorMode() === 'semantic') {
    const color = isSub
      ? 'rgba(255,255,255,0.6)'
      : type === 'Income' ? '#22c55e' : '#D4AF37'
    return <Icon size={size} className={className} strokeWidth={strokeWidth} style={{ color }} />
  }

  const color = categoryMeta[category]?.color
  return <Icon size={size} className={className} strokeWidth={strokeWidth} style={color ? { color } : undefined} />
}
