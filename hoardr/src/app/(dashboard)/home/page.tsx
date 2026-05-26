'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { localToday, $fd, fmtDate } from '@/lib/utils'
import Link from 'next/link'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { HomeHero } from '@/components/home/HomeHero'
import { UpcomingBills, type UpcomingSub } from '@/components/home/UpcomingBills'
import { AddTransactionSheet, type CardOption, type BankOption } from '@/components/money/AddTransactionSheet'
import { AddWishlistSheet, type NewWishItem } from '@/components/plans/AddWishlistSheet'
import { pageCache } from '@/lib/page-cache'
import { getAppPrefs } from '@/lib/app-prefs'
import { showToast } from '@/lib/toast'
import { PullIndicator } from '@/components/ui/PullIndicator'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import type { DayPoint } from '@/components/home/SparkChart'
import type { SeedTx } from '@/lib/data/transactions'
import { Truck } from 'lucide-react'
import { HoardChest } from '@/components/home/HoardChest'

interface EnRouteItem {
  id:          string
  name:        string
  bought_cost: number | null
  ordered_at:  string | null
}

interface ActivityRow {
  id:       string
  name:     string
  amount:   number
  date:     string
  category: string
  isIncome: boolean
  isSub:    boolean
}

interface HomeCache {
  spent:       number
  earned:      number
  monthlySubs: number
  hoardTotal:  number
  upcoming:    UpcomingSub[]
  enRoute:     EnRouteItem[]
  activity:    ActivityRow[]
  sparkPoints: DayPoint[]
}

export default function HomePage() {
  const cached = pageCache.get<HomeCache>('home')

  const [spent,         setSpent]         = useState(cached?.spent ?? 0)
  const [earned,        setEarned]        = useState(cached?.earned ?? 0)
  const [monthlySubs, setMonthlySubs] = useState(cached?.monthlySubs ?? 0)
  const [hoardTotal,  setHoardTotal]  = useState(cached?.hoardTotal ?? 0)
  const [upcoming,      setUpcoming]      = useState<UpcomingSub[]>(cached?.upcoming ?? [])
  const [enRoute,       setEnRoute]       = useState<EnRouteItem[]>(cached?.enRoute ?? [])
  const [activity,      setActivity]      = useState<ActivityRow[]>(cached?.activity ?? [])
  const [sparkPoints,   setSparkPoints]   = useState<DayPoint[]>(cached?.sparkPoints ?? [])
  const [loading,       setLoading]       = useState(!cached)
  const [fabOpen,       setFabOpen]       = useState(false)
  const [expenseOpen,   setExpenseOpen]   = useState(false)
  const [wishlistOpen,  setWishlistOpen]  = useState(false)
  const [cards,         setCards]         = useState<CardOption[]>([])
  const [banks,         setBanks]         = useState<BankOption[]>([])
  const [defaultCardId, setDefaultCardId] = useState<string | null>(null)

  const supabase          = useMemo(() => createClient(), [])
  const loadGen           = useRef(0)
  const abortRef          = useRef<AbortController | null>(null)

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++loadGen.current

    try {
      const todayStr   = localToday()
      const [y, m]     = todayStr.split('-')
      const monthStart = `${y}-${m}-01`
      const monthEnd   = `${y}-${m}-${new Date(Number(y), Number(m), 0).getDate()}`
      const sig        = controller.signal

      const [
        { data: monthExp },
        { data: monthInc },
        { data: activeSubs },
        { data: upcomingData },
        { data: enRouteData },
        { data: recentExp },
        { data: recentInc },
        { data: allTimeExp },
        { data: allTimeInc },
      ] = await Promise.all([
        supabase.from('expenses').select('cost, date, name').gte('date', monthStart).lte('date', monthEnd).abortSignal(sig),
        supabase.from('income').select('amount, date').gte('date', monthStart).lte('date', monthEnd).abortSignal(sig),
        supabase.from('subscriptions').select('id, name, monthly_cost').eq('status', 'Active').abortSignal(sig),
        supabase.from('subscriptions')
          .select('id, name, cost, next_renewal, billing, category, card_id')
          .eq('status', 'Active')
          .gte('next_renewal', todayStr)
          .order('next_renewal', { ascending: true })
          .limit(3)
          .abortSignal(sig),
        supabase.from('wishlist')
          .select('id, name, bought_cost, ordered_at')
          .eq('status', 'Ordered')
          .order('ordered_at', { ascending: false })
          .abortSignal(sig),
        supabase.from('expenses')
          .select('id, name, cost, date, categories(name)')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(5)
          .abortSignal(sig),
        supabase.from('income')
          .select('id, name, amount, date, source')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(5)
          .abortSignal(sig),
        supabase.from('expenses').select('cost').abortSignal(sig),
        supabase.from('income').select('amount').abortSignal(sig),
      ])

      if (gen !== loadGen.current) return

      const newSpent        = (monthExp    ?? []).reduce((s, e) => s + Number(e.cost),              0)
      const newEarned       = (monthInc    ?? []).reduce((s, i) => s + Number(i.amount),             0)
      const newMonthlySubs  = (activeSubs ?? []).reduce((s, r) => s + Number(r.monthly_cost ?? 0), 0)
      const newHoardIncome  = (allTimeInc ?? []).reduce((s, r) => s + Number(r.amount),            0)
      const newHoardExpense = (allTimeExp ?? []).reduce((s, r) => s + Number(r.cost),              0)
      const newHoardTotal   = newHoardIncome - newHoardExpense

      const newUpcoming: UpcomingSub[] = (upcomingData ?? []).map(s => ({
        id:           String(s.id),
        name:         String(s.name),
        cost:         Number(s.cost),
        next_renewal: s.next_renewal ? String(s.next_renewal) : null,
        billing:      s.billing as UpcomingSub['billing'],
        category:     s.category ? String(s.category) : null,
        card_id:      (s as { card_id?: string | null }).card_id
          ? String((s as { card_id?: string | null }).card_id) : null,
      }))

      const subNameSet = new Set((activeSubs ?? []).map(s => String(s.name).toLowerCase()))

      const newEnRoute: EnRouteItem[] = (enRouteData ?? []).map(w => ({
        id:          String(w.id),
        name:        String(w.name),
        bought_cost: w.bought_cost != null ? Number(w.bought_cost) : null,
        ordered_at:  w.ordered_at ? String(w.ordered_at) : null,
      }))

      const newActivity: ActivityRow[] = [
        ...(recentExp ?? []).map(e => ({
          id:       String(e.id),
          name:     String(e.name),
          amount:   -Number(e.cost),
          date:     String(e.date),
          category: (e.categories as unknown as { name: string } | null)?.name ?? 'Other',
          isIncome: false,
          isSub:    subNameSet.has(String(e.name ?? '').toLowerCase()),
        })),
        ...(recentInc ?? []).map(i => ({
          id:       String(i.id),
          name:     String(i.name),
          amount:   Number(i.amount),
          date:     String(i.date),
          category: String(i.source ?? 'Other'),
          isIncome: true,
          isSub:    false,
        })),
      ]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 3)

      // Cumulative monthly sparkline — day 1 → today, 3 series
      const todayDay = Number(todayStr.split('-')[2])
      const monthDays: string[] = []
      for (let d = 1; d <= todayDay; d++) {
        monthDays.push(`${y}-${m.padStart(2, '0')}-${String(d).padStart(2, '0')}`)
      }
      const dailyExp: Record<string, number> = {}
      const dailyInc: Record<string, number> = {}
      const dailySub: Record<string, number> = {}
      for (const e of monthExp ?? []) {
        const k = String(e.date)
        if (subNameSet.has(String(e.name ?? '').toLowerCase())) {
          dailySub[k] = (dailySub[k] ?? 0) + Number(e.cost)
        } else {
          dailyExp[k] = (dailyExp[k] ?? 0) + Number(e.cost)
        }
      }
      for (const i of monthInc ?? []) {
        const k = String(i.date)
        dailyInc[k] = (dailyInc[k] ?? 0) + Number(i.amount)
      }
      let cumExp = 0, cumInc = 0, cumSub = 0
      const newSparkPoints: DayPoint[] = monthDays.map(dateStr => {
        cumExp += dailyExp[dateStr] ?? 0
        cumInc += dailyInc[dateStr] ?? 0
        cumSub += dailySub[dateStr] ?? 0
        return {
          day:   String(Number(dateStr.split('-')[2])),
          label: new Date(dateStr + 'T12:00:00').toLocaleString('en-US', { month: 'short', day: 'numeric' }),
          exp:   cumExp,
          inc:   cumInc,
          sub:   cumSub,
        }
      })

      pageCache.set('home', {
        spent: newSpent, earned: newEarned,
        monthlySubs: newMonthlySubs, hoardTotal: newHoardTotal,
        upcoming: newUpcoming, enRoute: newEnRoute, activity: newActivity,
        sparkPoints: newSparkPoints,
      })

      setSpent(newSpent)
      setEarned(newEarned)
      setMonthlySubs(newMonthlySubs)
      setHoardTotal(newHoardTotal)
      setUpcoming(newUpcoming)
      setEnRoute(newEnRoute)
      setActivity(newActivity)
      setSparkPoints(newSparkPoints)
      setLoading(false)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('home loadData error:', err)
    }
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++; abortRef.current?.abort() } }, [loadData])

  useEffect(() => {
    let mounted = true
    async function loadWallet() {
      try {
        const [{ data: c }, { data: b }] = await Promise.all([
          supabase.from('cards').select('id, name, last4, is_default').order('is_default', { ascending: false }).order('created_at', { ascending: false }),
          supabase.from('banks').select('id, name').order('created_at', { ascending: false }),
        ])
        if (!mounted) return
        const cList = c ?? []
        setDefaultCardId((cList as { is_default: boolean; id: string }[]).find(x => x.is_default)?.id ?? null)
        setCards(cList.map(x => ({ id: String(x.id), name: String(x.name), last4: x.last4 ? String(x.last4) : null })))
        setBanks((b ?? []).map(x => ({ id: String(x.id), name: String(x.name) })))
      } catch (err) {
        console.error('home loadWallet error:', err)
      }
    }
    loadWallet()
    return () => { mounted = false }
  }, [supabase])

  const { distance: pullDist, refreshing: pullRefreshing, threshold: pullThreshold } =
    usePullToRefresh(loadData)

  async function handleAdd(tx: SeedTx) {
    showToast(`${tx.name} added`, { type: 'add' })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (tx.type === 'Expense') {
      const { data: existing } = await supabase
        .from('categories').select('id').eq('user_id', user.id).eq('name', tx.category).maybeSingle()
      let categoryId: string | null = existing?.id ?? null
      if (!categoryId) {
        const { data: created } = await supabase
          .from('categories').insert({ user_id: user.id, name: tx.category }).select('id').single()
        categoryId = created?.id ?? null
      }
      await supabase.from('expenses').insert({
        user_id:     user.id,
        name:        tx.name,
        cost:        tx.amount,
        date:        tx.date,
        description: tx.description ?? null,
        category_id: categoryId,
        status:      'Procured',
        card_id:     tx.card_id ?? null,
      })
    } else {
      await supabase.from('income').insert({
        user_id:     user.id,
        name:        tx.name,
        amount:      tx.amount,
        date:        tx.date,
        description: tx.description ?? null,
        source:      tx.category,
        bank_id:     tx.bank_id ?? null,
      })
    }

    await loadData()
  }

  async function handleAddWish(item: NewWishItem) {
    showToast(`${item.name} added to wishlist`, { type: 'add' })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('wishlist').insert({
      user_id:       user.id,
      name:          item.name,
      original_cost: item.original_cost,
      description:   item.description,
      category:      item.category,
      url:           item.url,
      status:        'Interested',
    })
  }

  function handleSubPaid(sub: UpcomingSub) {
    setSpent(prev => prev + sub.cost)
    loadData()
  }

  async function handleMarkArrived(id: string, name: string) {
    setEnRoute(prev => prev.filter(i => i.id !== id))
    const cached = pageCache.get<HomeCache>('home')
    if (cached) pageCache.set('home', { ...cached, enRoute: cached.enRoute.filter(i => i.id !== id) })
    showToast(`${name} arrived`, { type: 'payment' })
    await supabase.from('wishlist').delete().eq('id', id)
  }

  const saved       = earned - spent
  const netPositive = saved >= 0
  const hasData     = spent > 0 || earned > 0

  return (
    <>
    <div className="min-h-screen bg-bg-base tab-enter">

      <PullIndicator distance={pullDist} threshold={pullThreshold} refreshing={pullRefreshing} />

      <div className="pt-12" />

      {loading && (
        <div className="mx-4 mt-5 flex flex-col gap-3">
          <div className="h-[220px] rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" />
          <div className="h-[340px] rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" />
        </div>
      )}

      {!loading && (
        <>
          <HomeHero
            spent={spent}
            saved={saved}
            netPositive={netPositive}
            hasData={hasData}
            points={sparkPoints}
          />

          {/* ── Hoard pile ──────────────────────────────────────────────── */}
          <HoardChest hoardTotal={hoardTotal} thisMonthNet={saved} />

          <UpcomingBills initial={upcoming} onPaid={handleSubPaid} />

          {/* ── En route ────────────────────────────────────────────────── */}
          {enRoute.length > 0 && (
            <div className="mx-4 mt-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint">En Route</p>
              </div>
              <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                {enRoute.map(item => (
                  <SwipeToDelete
                    key={item.id}
                    onRight={() => handleMarkArrived(item.id, item.name)}
                    rightLabel={<Truck size={18} strokeWidth={1.5} />}
                    rightBg="bg-emerald-600"
                  >
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                        <Truck size={15} strokeWidth={1.75} className="text-gold" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-ink truncate">{item.name}</p>
                        <p className="text-[11px] text-ink-muted">
                          {item.ordered_at ? `Ordered ${fmtDate(item.ordered_at)}` : 'En route'}
                        </p>
                      </div>
                      {item.bought_cost != null && (
                        <p className="text-[15px] font-semibold font-mono text-ink flex-shrink-0">
                          {$fd(item.bought_cost)}
                        </p>
                      )}
                    </div>
                  </SwipeToDelete>
                ))}
              </div>
            </div>
          )}

          {/* ── Recent activity ─────────────────────────────────────────── */}
          <div className="mx-4 mt-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint">Recent Activity</p>
              <Link href="/money" className="text-[11px] font-medium text-gold">All →</Link>
            </div>
            {activity.length > 0 ? (
              <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                {activity.map(row => (
                  <div key={row.id} className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <CategoryIcon
                        category={row.category}
                        type={row.isIncome ? 'Income' : 'Expense'}
                        isSub={row.isSub}
                        size={15}
                        className={row.isIncome ? 'text-emerald' : row.isSub ? 'text-white/60' : 'text-gold'}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-ink truncate">{row.name}</p>
                      <p className="text-[11px] text-ink-muted">{fmtDate(row.date)}</p>
                    </div>
                    <p className={`text-[15px] font-semibold font-mono flex-shrink-0 ${row.amount > 0 ? 'text-emerald' : 'text-ink'}`}>
                      {row.amount > 0 ? '+' : '−'}{$fd(Math.abs(row.amount))}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-bg-surface border border-white/[0.06] rounded-card py-10 text-center text-ink-faint text-[13px]">
                No transactions yet — add your first one in Money.
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-10" />
    </div>

    {/* ── FAB ─────────────────────────────────────────────────────────── */}
    {fabOpen && (
      <div className="fixed inset-0" style={{ zIndex: 39 }} onClick={() => setFabOpen(false)} />
    )}
    {fabOpen && (
      <div className="fixed flex flex-col gap-4" style={{ right: 16, bottom: 148, zIndex: 41, width: 104 }}>
        <button className="w-full" onClick={() => { setFabOpen(false); setWishlistOpen(true) }}
          style={{ animation: 'fab-item-in 0.32s cubic-bezier(0.34,1.56,0.64,1) 0.06s both' }}>
          <span className="block w-full text-center text-[13px] font-semibold text-white gradient-gold rounded-full py-2 shadow-lg">Wishlist</span>
        </button>
        <button className="w-full" onClick={() => { setFabOpen(false); setExpenseOpen(true) }}
          style={{ animation: 'fab-item-in 0.32s cubic-bezier(0.34,1.56,0.64,1) 0s both' }}>
          <span className="block w-full text-center text-[13px] font-semibold text-white gradient-gold rounded-full py-2 shadow-lg">Expense</span>
        </button>
      </div>
    )}
    <button
      onClick={() => setFabOpen(f => !f)}
      className="fixed gradient-gold rounded-full flex items-center justify-center text-white font-light select-none"
      style={{ right: 16, bottom: 80, width: 56, height: 56, fontSize: 28, zIndex: 40, boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.25)', transform: fabOpen ? 'rotate(45deg)' : undefined, transition: 'transform 0.2s ease' }}
      aria-label="Add"
    >+</button>

    <AddTransactionSheet
      open={expenseOpen}
      onClose={() => setExpenseOpen(false)}
      onAdd={handleAdd}
      cards={cards}
      banks={banks}
      defaultCardId={defaultCardId}
      defaultCategory={getAppPrefs().defaultExpCat}
    />
    <AddWishlistSheet
      open={wishlistOpen}
      onClose={() => setWishlistOpen(false)}
      onAdd={handleAddWish}
    />
    </>
  )
}
