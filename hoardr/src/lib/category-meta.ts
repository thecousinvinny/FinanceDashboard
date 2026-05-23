import {
  Utensils, Coffee, Pizza, Wine, Apple, UtensilsCrossed,
  ShoppingBag, ShoppingCart, Package, Gift, Shirt, Tag,
  Car, Plane, Bike, Train, Bus, Fuel,
  Heart, Activity, Dumbbell, Pill, Stethoscope, Syringe,
  Music, Film, Tv, Headphones, Gamepad2, BookOpen,
  Home, Lightbulb, Hammer, Wrench, Bath, Sofa, Sparkles,
  DollarSign, CreditCard, Briefcase, PiggyBank, BarChart3, TrendingUp,
  Shield, ArrowLeftRight, RotateCcw, RefreshCw,
  Laptop, Smartphone, Wifi, Monitor, Camera, Code, Zap,
  Palette,
  LayoutGrid, type LucideIcon,
} from 'lucide-react'

// ── Icon registry ─────────────────────────────────────────────────────────────

export const ICON_REGISTRY: Record<string, LucideIcon> = {
  // Food & Drink
  Utensils, Coffee, Pizza, Wine, Apple, UtensilsCrossed,
  // Shopping
  ShoppingBag, ShoppingCart, Package, Gift, Shirt, Tag,
  // Transport & Travel
  Car, Plane, Bike, Train, Bus, Fuel,
  // Health & Wellness
  Heart, Activity, Dumbbell, Pill, Stethoscope, Syringe,
  // Entertainment
  Music, Film, Tv, Headphones, Gamepad2, BookOpen, Palette,
  // Home & Living
  Home, Lightbulb, Hammer, Wrench, Bath, Sofa, Sparkles,
  // Finance & Work
  DollarSign, CreditCard, Briefcase, PiggyBank, BarChart3, TrendingUp,
  Shield, ArrowLeftRight, RotateCcw, RefreshCw,
  // Tech
  Laptop, Smartphone, Wifi, Monitor, Camera, Code, Zap,
  // Fallback
  LayoutGrid,
}

export interface IconMeta {
  name:  string
  group: string
}

export const ICON_LIST: IconMeta[] = [
  // Food & Drink
  { name: 'Utensils',       group: 'Food & Drink' },
  { name: 'Coffee',         group: 'Food & Drink' },
  { name: 'Pizza',          group: 'Food & Drink' },
  { name: 'Wine',           group: 'Food & Drink' },
  { name: 'Apple',          group: 'Food & Drink' },
  { name: 'UtensilsCrossed',group: 'Food & Drink' },
  // Shopping
  { name: 'ShoppingBag',    group: 'Shopping' },
  { name: 'ShoppingCart',   group: 'Shopping' },
  { name: 'Package',        group: 'Shopping' },
  { name: 'Gift',           group: 'Shopping' },
  { name: 'Shirt',          group: 'Shopping' },
  { name: 'Tag',            group: 'Shopping' },
  // Transport
  { name: 'Car',            group: 'Transport' },
  { name: 'Plane',          group: 'Transport' },
  { name: 'Bike',           group: 'Transport' },
  { name: 'Train',          group: 'Transport' },
  { name: 'Bus',            group: 'Transport' },
  { name: 'Fuel',           group: 'Transport' },
  // Health
  { name: 'Heart',          group: 'Health' },
  { name: 'Activity',       group: 'Health' },
  { name: 'Dumbbell',       group: 'Health' },
  { name: 'Pill',           group: 'Health' },
  { name: 'Stethoscope',    group: 'Health' },
  { name: 'Syringe',        group: 'Health' },
  // Entertainment
  { name: 'Music',          group: 'Entertainment' },
  { name: 'Film',           group: 'Entertainment' },
  { name: 'Tv',             group: 'Entertainment' },
  { name: 'Headphones',     group: 'Entertainment' },
  { name: 'Gamepad2',       group: 'Entertainment' },
  { name: 'BookOpen',       group: 'Entertainment' },
  { name: 'Palette',        group: 'Entertainment' },
  // Home
  { name: 'Home',           group: 'Home' },
  { name: 'Lightbulb',      group: 'Home' },
  { name: 'Hammer',         group: 'Home' },
  { name: 'Wrench',         group: 'Home' },
  { name: 'Bath',           group: 'Home' },
  { name: 'Sofa',           group: 'Home' },
  { name: 'Sparkles',       group: 'Home' },
  // Finance
  { name: 'DollarSign',     group: 'Finance' },
  { name: 'CreditCard',     group: 'Finance' },
  { name: 'Briefcase',      group: 'Finance' },
  { name: 'PiggyBank',      group: 'Finance' },
  { name: 'BarChart3',      group: 'Finance' },
  { name: 'TrendingUp',     group: 'Finance' },
  { name: 'Shield',         group: 'Finance' },
  { name: 'ArrowLeftRight', group: 'Finance' },
  { name: 'RotateCcw',      group: 'Finance' },
  { name: 'RefreshCw',      group: 'Finance' },
  // Tech
  { name: 'Laptop',         group: 'Tech' },
  { name: 'Smartphone',     group: 'Tech' },
  { name: 'Wifi',           group: 'Tech' },
  { name: 'Monitor',        group: 'Tech' },
  { name: 'Camera',         group: 'Tech' },
  { name: 'Code',           group: 'Tech' },
  { name: 'Zap',            group: 'Tech' },
]

export const COLOR_PALETTE = [
  '#D4AF37', // gold
  '#22c55e', // emerald
  '#ef4444', // ruby
  '#8b5cf6', // violet
  '#f97316', // orange
  '#ec4899', // pink
  '#0ea5e9', // sky
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#84cc16', // lime
  '#06b6d4', // cyan
  '#64748b', // slate
  '#94a3b8', // muted
]

// ── Module-level cache ────────────────────────────────────────────────────────

export interface CategoryMeta {
  icon:    string
  color:   string
  tx_type: string
}

export const categoryMeta: Record<string, CategoryMeta> = {}

export function setCategoryMeta(cats: { name: string; icon: string; color: string; tx_type: string }[]) {
  for (const c of cats) categoryMeta[c.name] = { icon: c.icon, color: c.color, tx_type: c.tx_type }
}

// ── Icon color mode ───────────────────────────────────────────────────────────

export type IconColorMode = 'category' | 'semantic'

let _iconColorMode: IconColorMode = 'category'
let _modeInit = false

export function getIconColorMode(): IconColorMode {
  if (!_modeInit && typeof window !== 'undefined') {
    _iconColorMode = (localStorage.getItem('icon-color-mode') as IconColorMode) ?? 'category'
    _modeInit = true
  }
  return _iconColorMode
}

export function setIconColorMode(mode: IconColorMode) {
  _iconColorMode = mode
  _modeInit = true
  if (typeof window !== 'undefined') localStorage.setItem('icon-color-mode', mode)
}

// ── Built-in defaults (used for seeding + fallback) ───────────────────────────

export const BUILTIN_EXPENSE_CATEGORIES: { name: string; icon: string; color: string }[] = [
  { name: 'Food',         icon: 'Utensils',       color: '#f97316' },
  { name: 'Fun',          icon: 'Gamepad2',       color: '#8b5cf6' },
  { name: 'Apparel',      icon: 'Shirt',          color: '#ec4899' },
  { name: 'Tech',         icon: 'Laptop',         color: '#0ea5e9' },
  { name: 'Home',         icon: 'Home',           color: '#14b8a6' },
  { name: 'Health',       icon: 'Heart',          color: '#ef4444' },
  { name: 'Travel',       icon: 'Plane',          color: '#6366f1' },
  { name: 'Tesla',        icon: 'Zap',            color: '#64748b' },
  { name: 'PC',           icon: 'Monitor',        color: '#3b82f6' },
  { name: 'Life',         icon: 'Sparkles',       color: '#D4AF37' },
  { name: 'Gift',         icon: 'Gift',           color: '#f43f5e' },
  { name: 'Insurance',    icon: 'Shield',         color: '#84cc16' },
  { name: 'Stocks',       icon: 'TrendingUp',     color: '#22c55e' },
  { name: 'Other',        icon: 'LayoutGrid',     color: '#94a3b8' },
]

export const BUILTIN_INCOME_CATEGORIES: { name: string; icon: string; color: string }[] = [
  { name: 'Repayment', icon: 'ArrowLeftRight', color: '#22c55e' },
  { name: 'Refund',    icon: 'RotateCcw',      color: '#06b6d4' },
  { name: 'Freelance', icon: 'Laptop',         color: '#D4AF37' },
  { name: 'Projects',  icon: 'Palette',        color: '#8b5cf6' },
  { name: 'Stocks',    icon: 'TrendingUp',     color: '#22c55e' },
  { name: 'Other',     icon: 'LayoutGrid',     color: '#94a3b8' },
]
