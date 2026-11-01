/**
 * Profile's history: everything it shows, derived once from the raw rows.
 * Each number here appears in exactly one place on the page — Home owns
 * "this month" (the hero), Profile owns the history.
 */

export interface ProfExp { cost: number; savings: number | null; date: string; name: string; categories: unknown }
export interface ProfInc { amount: number; source: string | null; date: string; name: string | null }
export interface ProfSub { name: string; monthly_cost: number; annual_cost: number }

export interface CfMonth {
  key:   string              // "2026-10"
  label: string              // "Oct"
  long:  string              // "October 2026"
  inc: number; exp: number; sub: number; saved: number; n: number
  top:   [string, number][]  // top 4 categories that month
}

export interface Ranked { name: string; total: number; share: number; trend: number | null }

export interface ProfileStats {
  months:   CfMonth[]                      // first month with data → this month
  records: {
    best:      CfMonth | null               // highest net
    worst:     CfMonth | null               // lowest net
    topIncome: CfMonth | null
    biggest:   { name: string; cost: number; date: string } | null
    streak:    { current: number; longest: number }   // finished months in the green
    avgSpend:  number; avgIncome: number               // per month
  }
  allTime: { earned: number; spent: number; saved: number; count: number; since: string | null }
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December']
const pad = (n: number) => String(n).padStart(2, '0')
const catOf = (e: ProfExp) => (e.categories as { name: string } | null)?.name ?? 'Other'
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function profileStats(expenses: ProfExp[], income: ProfInc[], subs: ProfSub[], now: Date): ProfileStats {
  const subNames = new Set(subs.map(s => s.name.toLowerCase()))
  const isSub = (e: ProfExp) => subNames.has(String(e.name ?? '').toLowerCase())
  const today = ymd(now)
  const nowKey = today.slice(0, 7)

  // ── Months, first one with any data through this one ─────────────────────
  const firstDate = [...expenses.map(e => e.date), ...income.map(i => i.date)].sort()[0] ?? today
  const months: CfMonth[] = []
  const byKey = new Map<string, CfMonth & { cats: Map<string, number> }>()
  for (let d = new Date(Number(firstDate.slice(0, 4)), Number(firstDate.slice(5, 7)) - 1, 1); ymd(d).slice(0, 7) <= nowKey; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const key = ymd(d).slice(0, 7)
    const m = { key, label: MONTH_ABBR[d.getMonth()], long: `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`, inc: 0, exp: 0, sub: 0, saved: 0, n: 0, top: [], cats: new Map<string, number>() }
    byKey.set(key, m); months.push(m)
  }
  for (const e of expenses) {
    const m = byKey.get(e.date.slice(0, 7)); if (!m) continue
    m.exp += e.cost; m.n++; m.saved += e.savings ?? 0
    if (isSub(e)) m.sub += e.cost
    m.cats.set(catOf(e), (m.cats.get(catOf(e)) ?? 0) + e.cost)
  }
  for (const i of income) { const m = byKey.get(i.date.slice(0, 7)); if (m) m.inc += i.amount }
  for (const m of byKey.values()) {
    m.top = [...m.cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    delete (m as Partial<typeof m>).cats
  }

  // ── Records ───────────────────────────────────────────────────────────────
  const net = (m: CfMonth) => m.inc - m.exp
  const pick = (better: (a: CfMonth, b: CfMonth) => boolean) => months.reduce<CfMonth | null>((b, m) => (!b || better(m, b) ? m : b), null)
  const finished = months.filter(m => m.key < nowKey)
  let current = 0
  for (let i = finished.length - 1; i >= 0 && net(finished[i]) >= 0; i--) current++
  let longest = 0, run = 0
  for (const m of finished) { run = net(m) >= 0 ? run + 1 : 0; longest = Math.max(longest, run) }
  const big = expenses.reduce<ProfExp | null>((b, e) => (!b || e.cost > b.cost ? e : b), null)
  const span = Math.max(1, months.length)

  const earned = income.reduce((s, i) => s + i.amount, 0)
  const spent  = expenses.reduce((s, e) => s + e.cost, 0)
  const sinceM = months[0]

  return {
    months,
    records: {
      best:      pick((a, b) => net(a) > net(b)),
      worst:     pick((a, b) => net(a) < net(b)),
      topIncome: pick((a, b) => a.inc > b.inc),
      biggest:   big ? { name: big.name, cost: big.cost, date: big.date } : null,
      streak:    { current, longest },
      avgSpend:  spent / span,
      avgIncome: earned / span,
    },
    allTime: {
      earned, spent,
      saved: expenses.reduce((s, e) => s + (e.savings ?? 0), 0),
      count: expenses.length,
      since: sinceM ? sinceM.long : null,
    },
  }
}

// ── Breakdowns over a chosen range (Categories, Subscriptions, Income sources) ──

export type BreakRange = 'mo' | '6m' | 'yr' | 'all'
export const BREAK_RANGES: { id: BreakRange; label: string; vs: string }[] = [
  { id: 'mo',  label: 'This mo', vs: 'vs last month' },
  { id: '6m',  label: '6 mo',    vs: 'vs the 6 before' },
  { id: 'yr',  label: 'This yr', vs: 'vs last year' },
  { id: 'all', label: 'All',     vs: 'last 90 days vs the 90 before' },
]

export interface SubPaid { name: string; total: number; monthly: number }
export interface Breakdown {
  categories: Ranked[]
  sources:    Ranked[]
  subs:       { paid: number; list: SubPaid[]; monthly: number; yearly: number; active: number }
}

/**
 * The window a range covers, and the one its trend compares against. Partial
 * periods compare to the same point of the period before (this month so far
 * vs last month up to the same day), so a trend isn't skewed by days not yet
 * lived. "All" trends the last 90 days against the 90 before.
 */
function windows(range: BreakRange, now: Date): { from: string | null; prev: [string, string] } {
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate()
  const day = (yy: number, mm: number, dd: number) => ymd(new Date(yy, mm, dd))
  // Clamp "same day" to the previous period's month length (Mar 31 → Feb 28)
  const sameDay = (yy: number, mm: number) => day(yy, mm, Math.min(d, new Date(yy, mm + 1, 0).getDate()))
  if (range === 'mo') return { from: day(y, m, 1),      prev: [day(y, m - 1, 1),  sameDay(y, m - 1)] }
  if (range === '6m') return { from: day(y, m - 5, 1),  prev: [day(y, m - 11, 1), sameDay(y, m - 6)] }
  if (range === 'yr') return { from: day(y, 0, 1),      prev: [day(y - 1, 0, 1),  sameDay(y - 1, m)] }
  return { from: null, prev: [day(y, m, d - 180), day(y, m, d - 91)] }
}

export function breakdown(expenses: ProfExp[], income: ProfInc[], subs: ProfSub[], now: Date, range: BreakRange): Breakdown {
  const today = ymd(now)
  const { from, prev } = windows(range, now)
  const recentFrom = range === 'all' ? ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90)) : from!
  const inRange = (dt: string) => dt <= today && (!from || dt >= from)
  const inRecent = (dt: string) => dt <= today && dt >= recentFrom
  const inPrev = (dt: string) => dt >= prev[0] && dt <= prev[1]

  function rank<T>(rows: T[], key: (r: T) => string, amt: (r: T) => number, date: (r: T) => string, limit: number): Ranked[] {
    const tot = new Map<string, number>(), recent = new Map<string, number>(), prior = new Map<string, number>()
    let all = 0
    for (const r of rows) {
      const k = key(r), a = amt(r), dt = date(r)
      if (inRange(dt)) { tot.set(k, (tot.get(k) ?? 0) + a); all += a }
      if (inRecent(dt)) recent.set(k, (recent.get(k) ?? 0) + a)
      if (inPrev(dt)) prior.set(k, (prior.get(k) ?? 0) + a)
    }
    return [...tot.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([name, total]) => {
      const r = recent.get(name) ?? 0, p = prior.get(name) ?? 0
      return { name, total, share: all ? total / all : 0, trend: p > 0 ? (r - p) / p : null }
    })
  }

  // Subscriptions: what each active one cost in the range (its payments are
  // expenses with the subscription's name)
  const byName = new Map(subs.map(s => [s.name.toLowerCase(), s]))
  const paid = new Map<string, number>()
  for (const e of expenses) {
    const s = byName.get(String(e.name ?? '').toLowerCase())
    if (s && inRange(e.date)) paid.set(s.name, (paid.get(s.name) ?? 0) + e.cost)
  }
  const list = subs.map(s => ({ name: s.name, total: paid.get(s.name) ?? 0, monthly: s.monthly_cost }))
    .sort((a, b) => b.total - a.total || b.monthly - a.monthly)

  return {
    categories: rank(expenses, catOf, e => e.cost, e => e.date, 6),
    sources:    rank(income, i => i.name || i.source || 'Other', i => i.amount, i => i.date, 5),
    subs: {
      paid: list.reduce((s, x) => s + x.total, 0),
      list,
      monthly: subs.reduce((s, x) => s + x.monthly_cost, 0),
      yearly:  subs.reduce((s, x) => s + x.annual_cost, 0),
      active:  subs.length,
    },
  }
}
