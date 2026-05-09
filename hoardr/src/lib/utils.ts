import type { BillingCycle } from '@/types'

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

/** "May 5" from "2026-05-05" */
export function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
  })
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
export function calcSubCosts(cost: number, billing: BillingCycle) {
  switch (billing) {
    case 'Annual':    return { monthly: cost / 12,    annual: cost        }
    case 'BiWeekly':  return { monthly: cost * 2.17,  annual: cost * 26   }
    case 'Weekly':    return { monthly: cost * 4.33,  annual: cost * 52   }
    case 'Quarterly': return { monthly: cost / 3,     annual: cost * 4    }
    default:          return { monthly: cost,          annual: cost * 12   }
  }
}

/** Next renewal date string (YYYY-MM-DD) from a base date and billing cycle */
export function nextRenewalDate(from: string, billing: BillingCycle): string {
  const d = new Date(from + 'T12:00:00')
  switch (billing) {
    case 'Annual':    d.setFullYear(d.getFullYear() + 1); break
    case 'Quarterly': d.setMonth(d.getMonth() + 3);       break
    case 'BiWeekly':  d.setDate(d.getDate() + 14);        break
    case 'Weekly':    d.setDate(d.getDate() + 7);         break
    default:          d.setMonth(d.getMonth() + 1);       break
  }
  return d.toISOString().slice(0, 10)
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
