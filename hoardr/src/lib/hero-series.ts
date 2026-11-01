import type { HeroSeries } from '@/components/home/PaceChart'

/**
 * The Hoard hero's data — built the same way on Home and on the greeting
 * card, so the hero that flies from one to the other shows the same numbers.
 */

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const pad = (n: number) => String(n).padStart(2, '0')
const running = (a: number[]) => { let t = 0; return a.map(v => (t += v)) }

export const EMPTY_SERIES: HeroSeries = { slots: 1, labels: [], cum: [], prev: null, prevName: null, out: [], sub: [], inc: [] }

/** Earliest date the hero needs: the start of last month or of this year,
 *  whichever is first (so January still has a comparison). */
export function heroHistoryStart(today: string): string {
  const [y, m] = today.split('-').map(Number)
  const lm = new Date(y, m - 2, 1)
  const lmStart = `${lm.getFullYear()}-${pad(lm.getMonth() + 1)}-01`
  const yearStart = `${y}-01-01`
  return lmStart < yearStart ? lmStart : yearStart
}

/** Expenses + income from `heroHistoryStart(today)` through today → month and year series.
 *  Subs are expenses whose name matches an active subscription. */
export function buildHeroSeries(
  expenses: { cost: number | string; date: string; name?: string | null }[],
  income:   { amount: number | string; date: string }[],
  subNames: Set<string>,
  today:    string,
): { month: HeroSeries; year: HeroSeries } {
  const [y, m, d] = today.split('-').map(Number)
  const lm        = new Date(y, m - 2, 1)
  const monthKey  = `${y}-${pad(m)}`
  const lmKey     = `${lm.getFullYear()}-${pad(lm.getMonth() + 1)}`
  const yearStart = `${y}-01-01`

  const outByDay: Record<string, number> = {}
  const subByDay: Record<string, number> = {}
  const incByDay: Record<string, number> = {}
  for (const e of expenses) {
    const k = String(e.date)
    outByDay[k] = (outByDay[k] ?? 0) + Number(e.cost)
    if (subNames.has(String(e.name ?? '').toLowerCase())) subByDay[k] = (subByDay[k] ?? 0) + Number(e.cost)
  }
  for (const i of income) { const k = String(i.date); incByDay[k] = (incByDay[k] ?? 0) + Number(i.amount) }

  const daysIn   = new Date(y, m, 0).getDate()
  const lmDays   = new Date(lm.getFullYear(), lm.getMonth() + 1, 0).getDate()
  const dayOf    = (mk: string, day: number) => `${mk}-${pad(day)}`
  const elapsed  = Array.from({ length: d }, (_, i) => i + 1)
  const monthOut = elapsed.map(day => outByDay[dayOf(monthKey, day)] ?? 0)
  const lmOut    = Array.from({ length: Math.min(lmDays, daysIn) }, (_, i) => outByDay[dayOf(lmKey, i + 1)] ?? 0)
  const month: HeroSeries = {
    slots:    daysIn,
    labels:   Array.from({ length: daysIn }, (_, i) => `${MONTH_ABBR[m - 1]} ${i + 1}`),
    cum:      running(monthOut),
    prev:     running(lmOut),
    prevName: MONTH_ABBR[lm.getMonth()],
    out:      monthOut,
    sub:      elapsed.map(day => subByDay[dayOf(monthKey, day)] ?? 0),
    inc:      elapsed.map(day => incByDay[dayOf(monthKey, day)] ?? 0),
  }

  const byMonth = (src: Record<string, number>) => {
    const r: Record<string, number> = {}
    for (const k in src) if (k >= yearStart) r[k.slice(0, 7)] = (r[k.slice(0, 7)] ?? 0) + src[k]
    return r
  }
  const outM = byMonth(outByDay), subM = byMonth(subByDay), incM = byMonth(incByDay)
  const months  = Array.from({ length: m }, (_, i) => `${y}-${pad(i + 1)}`)
  const yearOut = months.map(k => outM[k] ?? 0)
  const year: HeroSeries = {
    slots:    12,
    labels:   MONTH_FULL.map(n => `${n} ${y}`),
    cum:      running(yearOut),
    prev:     null,
    prevName: null,
    out:      yearOut,
    sub:      months.map(k => subM[k] ?? 0),
    inc:      months.map(k => incM[k] ?? 0),
  }
  return { month, year }
}
