import type { BillingCycle, BillingUnit } from '@/types'

// ── Formatting ─────────────────────────────────────────────────────────────

/** "$1,234" — rounds to whole dollars */
export function $f(n: number | string | null | undefined): string {
  const v = parseFloat(String(n ?? 0)) || 0
  return (
    '$' +
    Math.abs(v).toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  )
}

/** "$1,234" when whole dollars, "$1,234.50" when cents are non-zero */
export function $fd(n: number | string | null | undefined): string {
  const v = parseFloat(String(n ?? 0)) || 0
  return Math.round(Math.abs(v) * 100) % 100 === 0 ? $f(v) : $fc(v)
}

/** "$12.50" — keeps cents */
export function $fc(n: number | string | null | undefined): string {
  const v = parseFloat(String(n ?? 0)) || 0
  return (
    '$' +
    Math.abs(v).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  )
}

/** Compact: "$4.8K", "$1.2M" */
export function $fk(n: number | string | null | undefined): string {
  const v = parseFloat(String(n ?? 0)) || 0
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return '$' + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000)     return '$' + (abs / 1_000).toFixed(1) + 'K'
  return $f(v)
}

// ── Dates ──────────────────────────────────────────────────────────────────

/** Today as YYYY-MM-DD in PST/PDT (hardcoded to match original app behaviour) */
export function localToday(tz = 'America/Los_Angeles'): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: tz })
}

/** "Today" / "Yesterday" / "Mon" / "May 5" from "2026-05-05" */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  const date  = new Date(y, m - 1, day)
  const today = localToday()
  const [ty, tm, td] = today.split('-').map(Number)
  const todayDate = new Date(ty, tm - 1, td)
  const diff = Math.round((todayDate.getTime() - date.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff <= 6)  return date.toLocaleDateString('en-US', { weekday: 'short' })
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** "May 2026" from "2026-05-05" */
export function fmtMonth(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m] = d.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year:  'numeric',
  })
}

/** Days until a future date (negative = past) */
export function daysUntil(d: string | null | undefined): number | null {
  if (!d) return null
  const target = new Date(d + 'T12:00:00')
  const today  = new Date(localToday() + 'T12:00:00')
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

/** "in 3 days" | "today" | "3 days ago" */
export function daysUntilLabel(d: string | null | undefined): string {
  const n = daysUntil(d)
  if (n === null)  return '—'
  if (n === 0)     return 'today'
  if (n === 1)     return 'in 1 day'
  if (n > 1)       return `in ${n} days`
  if (n === -1)    return '1 day ago'
  return `${Math.abs(n)} days ago`
}

// ── Subscription math ──────────────────────────────────────────────────────

/** Matches the original app's calcSubCosts logic exactly */
/** A subscription's cycle: a preset, or 'Custom' with every N units */
export interface BillingSpec {
  billing:        BillingCycle
  billing_every?: number | null
  billing_unit?:  BillingUnit | string | null
}
type Cycle = { every: number; unit: BillingUnit }

const PRESET_CYCLE: Record<Exclude<BillingCycle, 'Custom'>, Cycle> = {
  Weekly:    { every: 1, unit: 'week'  },
  BiWeekly:  { every: 2, unit: 'week'  },
  Monthly:   { every: 1, unit: 'month' },
  Quarterly: { every: 3, unit: 'month' },
  Annual:    { every: 1, unit: 'year'  },
}

export function cycleOf(b: BillingCycle | BillingSpec): Cycle {
  const spec = typeof b === 'string' ? { billing: b } : b
  if (spec.billing === 'Custom') {
    const unit = (['day', 'week', 'month', 'year'] as const).find(u => u === spec.billing_unit) ?? 'month'
    return { every: Math.max(1, Math.round(Number(spec.billing_every) || 1)), unit }
  }
  return PRESET_CYCLE[spec.billing] ?? PRESET_CYCLE.Monthly
}

/** Cost per month / year of one charge every cycle */
export function calcSubCosts(cost: number, billing: BillingCycle | BillingSpec) {
  const { every, unit } = cycleOf(billing)
  // Charges per year for one unit, then spread over `every`
  const perYear = { day: 365, week: 52, month: 12, year: 1 }[unit] / every
  return { monthly: cost * perYear / 12, annual: cost * perYear }
}

/** Next renewal date string (YYYY-MM-DD) from a base date and billing cycle */
export function nextRenewalDate(from: string, billing: BillingCycle | BillingSpec): string {
  const { every, unit } = cycleOf(billing)
  const [y, m, d] = from.split('-').map(Number)
  let dt: Date
  if (unit === 'day' || unit === 'week') {
    dt = new Date(y, m - 1, d + every * (unit === 'week' ? 7 : 1))
  } else {
    // Month/year steps keep the day, clamped to the target month's length
    // (Jan 31 + 1 month = Feb 28, not Mar 3)
    const months = every * (unit === 'year' ? 12 : 1)
    const ty = y + Math.floor((m - 1 + months) / 12), tm = (m - 1 + months) % 12
    dt = new Date(ty, tm, Math.min(d, new Date(ty, tm + 1, 0).getDate()))
  }
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

const UNIT_WORD: Record<BillingUnit, string> = { day: 'day', week: 'week', month: 'month', year: 'year' }

/** "Monthly", "Every 3 weeks" */
export function billingLabel(b: BillingCycle | BillingSpec): string {
  const spec = typeof b === 'string' ? { billing: b } : b
  if (spec.billing !== 'Custom') return spec.billing === 'BiWeekly' ? 'Bi-Weekly' : spec.billing
  const { every, unit } = cycleOf(spec)
  return every === 1 ? `Every ${UNIT_WORD[unit]}` : `Every ${every} ${UNIT_WORD[unit]}s`
}

/** Compact cycle for rows: /mo, /yr, /3wk */
export function billingShort(b: BillingCycle | BillingSpec): string {
  const { every, unit } = cycleOf(b)
  const u = { day: 'd', week: 'wk', month: 'mo', year: 'yr' }[unit]
  if (every === 3 && unit === 'month') return '/ qtr'
  return every === 1 ? `/ ${u}` : `/ ${every}${u}`
}

// ── Data helpers ───────────────────────────────────────────────────────────

/** Group rows by YYYY-MM, newest first */
export function groupByMonth<T extends { date: string }>(
  rows: T[]
): Array<{ label: string; key: string; rows: T[] }> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const key = row.date.slice(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(row)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, rows]) => ({
      key,
      label: fmtMonth(key + '-01'),
      rows,
    }))
}

// ── Misc ───────────────────────────────────────────────────────────────────

export function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max)
}

/** Tailwind className joiner */
export function cn(...classes: (string | undefined | false | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Trigger a brief vibration where supported (Android Chrome; silent on iOS) */
export function haptic(style: 'tap' | 'confirm' | 'delete' = 'tap') {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return
  const ms: number | number[] = style === 'delete' ? [12, 50, 12] : style === 'confirm' ? 10 : 6
  navigator.vibrate(ms)
}
