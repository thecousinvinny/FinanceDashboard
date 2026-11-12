'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { localToday, $fd, fmtDate, haptic } from '@/lib/utils'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { HomeHero } from '@/components/home/HomeHero'
import { UpcomingBills, type UpcomingSub } from '@/components/home/UpcomingBills'
import { AddTransactionSheet, type CardOption, type BankOption } from '@/components/money/AddTransactionSheet'
import { AddWishlistSheet, type NewWishItem } from '@/components/plans/AddWishlistSheet'
import { pageCache } from '@/lib/page-cache'
import { getAppPrefs } from '@/lib/app-prefs'
import { showToast } from '@/lib/toast'
import { reportDbError, requireUser } from '@/lib/db-error'
import { PullIndicator } from '@/components/ui/PullIndicator'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import type { HeroSeries } from '@/components/home/PaceChart'
import { buildHeroSeries, heroHistoryStart, EMPTY_SERIES } from '@/lib/hero-series'
import type { SeedTx } from '@/lib/data/transactions'
import { Truck, PlusCircle, Star, ArrowUpCircle } from 'lucide-react'
import { GlobalFAB } from '@/components/ui/GlobalFAB'
import { useOnScreenReturn, useScreenActive, useScreenReady } from '@/lib/tab-nav'
import { LoadBars } from '@/components/ui/LoadBars'
import { sameAsLast } from '@/lib/same-data'
import { ActivityDetailSheet, type ActivityRef } from '@/components/home/ActivityDetailSheet'

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
  created:  string
  category: string
  isIncome: boolean
  isSub:    boolean
}

/**
 * Recent activity is one feed over two tables, paged PAGE at a time as you
 * scroll. Each table is fetched newest-first up to `shown` rows (or to its
 * end): the newest `shown` of the merge can't take more than that from either
 * table, so merging what's fetched is always exact.
 */
const PAGE = 20
interface ActivityFeed {
  exp:     ActivityRow[]
  inc:     ActivityRow[]
  expDone: boolean
  incDone: boolean
  shown:   number
}
const EMPTY_FEED: ActivityFeed = { exp: [], inc: [], expDone: false, incDone: false, shown: PAGE }
const byNewest = (a: ActivityRow, b: ActivityRow) =>
  b.date.localeCompare(a.date) || b.created.localeCompare(a.created) || b.id.localeCompare(a.id)

const EXP_COLS = 'id, name, cost, date, created_at, categories(name)'
const INC_COLS = 'id, name, amount, date, created_at, source'
type ExpRow = { id: unknown; name: unknown; cost: unknown; date: unknown; created_at: unknown; categories: unknown }
type IncRow = { id: unknown; name: unknown; amount: unknown; date: unknown; created_at: unknown; source: unknown }
const expRow = (e: ExpRow, subs: Set<string>): ActivityRow => ({
  id:       String(e.id),
  name:     String(e.name),
  amount:   -Number(e.cost),
  date:     String(e.date),
  created:  String(e.created_at ?? ''),
  category: (e.categories as { name: string } | null)?.name ?? 'Other',
  isIncome: false,
  isSub:    subs.has(String(e.name ?? '').toLowerCase()),
})
const incRow = (i: IncRow): ActivityRow => ({
  id:       String(i.id),
  name:     String(i.name),
  amount:   Number(i.amount),
  date:     String(i.date),
  created:  String(i.created_at ?? ''),
  category: String(i.source ?? 'Other'),
  isIncome: true,
  isSub:    false,
})

interface HomeCache {
  spent:             number
  upcoming:          UpcomingSub[]
  enRoute:           EnRouteItem[]
  feed:              ActivityFeed
  heroMonth:         HeroSeries
  heroYear:          HeroSeries
}

export default function HomePage() {
  const cached = pageCache.get<HomeCache>('home')

  const [spent,         setSpent]         = useState(cached?.spent ?? 0)
  const [upcoming,      setUpcoming]      = useState<UpcomingSub[]>(cached?.upcoming ?? [])
  const [enRoute,       setEnRoute]       = useState<EnRouteItem[]>(cached?.enRoute ?? [])
  const [feed,          setFeed]          = useState<ActivityFeed>(cached?.feed ?? EMPTY_FEED)
  const [loadingMore,   setLoadingMore]   = useState(false)
  const [heroMonth,          setHeroMonth]          = useState<HeroSeries>(cached?.heroMonth ?? EMPTY_SERIES)
  const [heroYear,           setHeroYear]           = useState<HeroSeries>(cached?.heroYear ?? EMPTY_SERIES)
  const [loading,            setLoading]            = useState(!cached)
  const [expenseOpen,   setExpenseOpen]   = useState(false)
  const [detailItem,    setDetailItem]    = useState<ActivityRef | null>(null)
  const [txMode,        setTxMode]        = useState<'Expense' | 'Income'>('Expense')
  const [wishlistOpen,  setWishlistOpen]  = useState(false)
  const [cards,         setCards]         = useState<CardOption[]>([])
  const [banks,         setBanks]         = useState<BankOption[]>([])
  const [defaultCardId, setDefaultCardId] = useState<string | null>(null)

  const supabase          = useMemo(() => createClient(), [])
  const loadGen           = useRef(0)
  const dataSigRef        = useRef('')
  const abortRef          = useRef<AbortController | null>(null)
  const feedRef           = useRef(feed)
  feedRef.current         = feed
  const subNamesRef       = useRef(new Set<string>())
  const moreGen           = useRef(0)
  const moreAbortRef      = useRef<AbortController | null>(null)
  const active            = useScreenActive()

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++loadGen.current

    try {
      const todayStr      = localToday()
      const [y, m, dStr]  = todayStr.split('-')
      const monthStart    = `${y}-${m}-01`
      const monthEnd      = `${y}-${m}-${new Date(Number(y), Number(m), 0).getDate()}`
      const yearStart     = `${y}-01-01`
      const sig           = controller.signal

      // The hero's history reaches back to the start of last month (lib/hero-series)
      const histStart  = heroHistoryStart(todayStr)
      // A refresh keeps every page you've scrolled through
      const want = Math.max(PAGE, feedRef.current.shown)
      moreGen.current++; moreAbortRef.current?.abort(); moreAbortRef.current = null; setLoadingMore(false)

      const [
        { data: monthExp },
        { data: activeSubs },
        { data: upcomingData },
        { data: enRouteData },
        { data: recentExp },
        { data: recentInc },
        { data: yearExp },
        { data: yearInc },
      ] = await Promise.all([
        supabase.from('expenses').select('cost, date, name').gte('date', monthStart).lte('date', monthEnd).abortSignal(sig),
        supabase.from('subscriptions').select('name').eq('status', 'Active').abortSignal(sig),
        supabase.from('subscriptions')
          .select('id, name, cost, next_renewal, billing, billing_every, billing_unit, category, card_id')
          .eq('status', 'Active')
          .not('next_renewal', 'is', null)
          .order('next_renewal', { ascending: true })
          .limit(5)
          .abortSignal(sig),
        supabase.from('wishlist')
          .select('id, name, bought_cost, ordered_at')
          .eq('status', 'Ordered')
          .order('ordered_at', { ascending: false })
          .abortSignal(sig),
        supabase.from('expenses').select(EXP_COLS)
          .order('date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(0, want - 1)
          .abortSignal(sig),
        supabase.from('income').select(INC_COLS)
          .order('date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false })
          .range(0, want - 1)
          .abortSignal(sig),
        supabase.from('expenses').select('cost, date, name').gte('date', histStart).lte('date', todayStr).abortSignal(sig),
        supabase.from('income').select('amount, date').gte('date', histStart).lte('date', todayStr).abortSignal(sig),
      ])

      if (gen !== loadGen.current) return

      const newSpent        = (monthExp    ?? []).reduce((s, e) => s + Number(e.cost),              0)

      const newUpcoming: UpcomingSub[] = (upcomingData ?? []).map(s => ({
        id:           String(s.id),
        name:         String(s.name),
        cost:         Number(s.cost),
        next_renewal: s.next_renewal ? String(s.next_renewal) : null,
        billing:      s.billing as UpcomingSub['billing'],
        billing_every: (s.billing_every as number | null) ?? null,
        billing_unit:  (s.billing_unit as string | null) ?? null,
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

      subNamesRef.current = subNameSet
      const newFeed: ActivityFeed = {
        exp:     (recentExp ?? []).map(e => expRow(e as ExpRow, subNameSet)),
        inc:     (recentInc ?? []).map(i => incRow(i as IncRow)),
        expDone: (recentExp ?? []).length < want,
        incDone: (recentInc ?? []).length < want,
        shown:   want,
      }

      // Hero: running spend this month vs last month, and this year by month
      const { month: newHeroMonth, year: newHeroYear } = buildHeroSeries(yearExp ?? [], yearInc ?? [], subNameSet, todayStr)

      const homeData = {
        spent: newSpent,
        upcoming: newUpcoming, enRoute: newEnRoute, feed: newFeed,
        heroMonth: newHeroMonth, heroYear: newHeroYear,
      }
      // A return-to-tab refresh that changed nothing must not re-render
      if (sameAsLast(dataSigRef, homeData)) { setLoading(false); return }
      pageCache.set('home', homeData)

      setSpent(newSpent)
      setUpcoming(newUpcoming)
      setEnRoute(newEnRoute)
      setFeed(newFeed)
      setHeroMonth(newHeroMonth)
      setHeroYear(newHeroYear)
      setLoading(false)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('home loadData error:', err)
    }
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++; abortRef.current?.abort() } }, [loadData])
  // Kept alive across tabs — refresh quietly whenever this screen is shown again
  useOnScreenReturn(loadData)
  useScreenReady(!loading)   // releases the load screen once this screen has its data

  // ── Recent activity paging ─────────────────────────────────────────────────
  const activity = useMemo(
    () => [...feed.exp, ...feed.inc].sort(byNewest).slice(0, feed.shown),
    [feed],
  )
  const hasMore = !(feed.expDone && feed.incDone) || feed.exp.length + feed.inc.length > feed.shown

  const loadMore = useCallback(async () => {
    const f = feedRef.current
    if (moreAbortRef.current) return   // one page at a time
    const shown = f.shown + PAGE
    const needExp = !f.expDone && f.exp.length < shown
    const needInc = !f.incDone && f.inc.length < shown
    if (!needExp && !needInc) { setFeed({ ...f, shown }); return }
    const controller = new AbortController()
    moreAbortRef.current = controller
    const gen = ++moreGen.current
    setLoadingMore(true)
    try {
      const sig = controller.signal
      const [e, i] = await Promise.all([
        needExp
          ? supabase.from('expenses').select(EXP_COLS)
              .order('date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false })
              .range(f.exp.length, shown - 1).abortSignal(sig)
          : Promise.resolve({ data: [] as ExpRow[] }),
        needInc
          ? supabase.from('income').select(INC_COLS)
              .order('date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: false })
              .range(f.inc.length, shown - 1).abortSignal(sig)
          : Promise.resolve({ data: [] as IncRow[] }),
      ])
      if (gen !== moreGen.current) return
      const cur  = feedRef.current
      const seen = new Set([...cur.exp, ...cur.inc].map(x => x.id))
      const eRows = (e.data ?? []) as ExpRow[], iRows = (i.data ?? []) as IncRow[]
      const next: ActivityFeed = {
        exp:     [...cur.exp, ...eRows.map(x => expRow(x, subNamesRef.current)).filter(x => !seen.has(x.id))],
        inc:     [...cur.inc, ...iRows.map(incRow).filter(x => !seen.has(x.id))],
        // Done keys off the raw page length, never the deduped one
        expDone: cur.expDone || (needExp && eRows.length < shown - f.exp.length),
        incDone: cur.incDone || (needInc && iRows.length < shown - f.inc.length),
        shown,
      }
      setFeed(next)
      const c = pageCache.get<HomeCache>('home')
      if (c) pageCache.set('home', { ...c, feed: next })
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') console.error('home loadMore error:', err)
    } finally {
      if (gen === moreGen.current) setLoadingMore(false)
      if (moreAbortRef.current === controller) moreAbortRef.current = null
    }
  }, [supabase])
  useEffect(() => () => { moreGen.current++; moreAbortRef.current?.abort() }, [])

  // Load the next page a screen before the end of the list. Only while this
  // screen is visible: hidden screens are still laid out, and the sentinel
  // would page through everything in the background.
  //
  // And only after you scrolled since the last page landed (or when the page
  // can't scroll yet): a page that arrives with the sentinel still in view
  // must not chain into the next one. Anything that holds the page at the
  // bottom (a browser restoring an old scroll offset) otherwise paged through
  // the whole history 20 rows at a time.
  const sentinelRef  = useRef<HTMLDivElement>(null)
  const scrolledRef  = useRef(false)
  useEffect(() => { scrolledRef.current = false }, [feed.shown])
  const pagingRef    = useRef({ hasMore, loadMore })
  pagingRef.current  = { hasMore, loadMore }
  useEffect(() => {
    if (!active) return
    // Your own input only (wheel, touch, keys, a scrollbar drag) — a scroll
    // event also fires for the browser's restoring and for layout shifts
    let raf = 0
    const onInput = () => {
      scrolledRef.current = true
      // The sentinel may already be in range, where the observer won't fire
      // again: check it once the input has moved the page
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const el = sentinelRef.current
        if (el && pagingRef.current.hasMore && el.getBoundingClientRect().top < window.innerHeight + 800) pagingRef.current.loadMore()
      })
    }
    const evs = ['wheel', 'touchmove', 'keydown', 'mousedown'] as const
    evs.forEach(ev => window.addEventListener(ev, onInput, { passive: true }))
    return () => { cancelAnimationFrame(raf); evs.forEach(ev => window.removeEventListener(ev, onInput)) }
  }, [active])
  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !active || !hasMore || loading) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      const canScroll = document.documentElement.scrollHeight > window.innerHeight + 40
      if (scrolledRef.current || !canScroll) loadMore()
    }, { rootMargin: '0px 0px 800px 0px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [active, hasMore, loading, loadMore, feed.shown])

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

  const { indicatorRef: pullRef, refreshing: pullRefreshing } =
    usePullToRefresh(loadData)

  async function handleAdd(tx: SeedTx) {
    showToast(`${tx.name} added`, { type: 'add' })

    const user = await requireUser(supabase, 'add transaction')
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
      const { error } = await supabase.from('expenses').insert({
        user_id:     user.id,
        name:        tx.name,
        cost:        tx.amount,
        date:        tx.date,
        description: tx.description ?? null,
        category_id: categoryId,
        status:      'Procured',
        card_id:     tx.card_id ?? null,
      })
      reportDbError(error, 'add expense')
    } else {
      const { error } = await supabase.from('income').insert({
        user_id:     user.id,
        name:        tx.name,
        amount:      tx.amount,
        date:        tx.date,
        description: tx.description ?? null,
        source:      tx.category,
        bank_id:     tx.bank_id ?? null,
      })
      reportDbError(error, 'add income')
    }

    await loadData()
  }

  async function handleAddWish(item: NewWishItem) {
    showToast(`${item.name} added to wishlist`, { type: 'add' })
    const user = await requireUser(supabase, 'add wishlist item')
    if (!user) return
    const { error } = await supabase.from('wishlist').insert({
      user_id:       user.id,
      name:          item.name,
      original_cost: item.original_cost,
      description:   item.description,
      category:      item.category,
      url:           item.url,
      status:        'Interested',
    })
    reportDbError(error, 'add wishlist item')
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
    // Keep the item as a Delivered record with today's arrival date (editable later
    // in OUT → Wishlist → Delivered). Don't delete — it holds the paid + delivery dates.
    await supabase.from('wishlist').update({ status: 'Delivered', delivered_at: localToday() }).eq('id', id)
  }

  return (
    <>
    <div className="min-h-screen bg-bg-base tab-enter">

      <PullIndicator indicatorRef={pullRef} refreshing={pullRefreshing} />

      <div style={{ height: 'calc(env(safe-area-inset-top, 44px) + 8px)' }} />

      {loading && (
        <div className="mx-4 mt-5 flex flex-col gap-3">
          <div className="h-[220px] rounded-card bg-bg-surface border border-ink/[0.06] animate-pulse" />
          <div className="h-[340px] rounded-card bg-bg-surface border border-ink/[0.06] animate-pulse" />
        </div>
      )}

      {!loading && (
        <>
          <HomeHero spent={spent} month={heroMonth} year={heroYear} live={!loading} />

          <UpcomingBills initial={upcoming} onPaid={handleSubPaid} />

          {/* ── En route ────────────────────────────────────────────────── */}
          {enRoute.length > 0 && (
            <div className="mx-4 mt-6">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint">En Route</p>
              </div>
              <div className="bg-bg-surface border border-ink/[0.06] rounded-card overflow-hidden divide-y divide-ink/[0.04]">
                {enRoute.map(item => (
                  <SwipeToDelete
                    key={item.id}
                    onRight={() => handleMarkArrived(item.id, item.name)}
                    rightLabel={<Truck size={18} strokeWidth={1.5} />}
                    rightBg="bg-emerald-600"
                  >
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-ink/[0.06] flex items-center justify-center flex-shrink-0">
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
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Recent Activity</p>
            {activity.length > 0 ? (
              <div className="bg-bg-surface border border-ink/[0.06] rounded-card overflow-hidden divide-y divide-ink/[0.04]">
                {activity.map(row => (
                  <SwipeToDelete key={row.id} onTap={() => { haptic('tap'); setDetailItem(row) }}>
                  <div className="w-full text-left flex items-center gap-3 px-4 py-3.5 select-none cursor-pointer">
                    <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-ink/[0.06] flex items-center justify-center flex-shrink-0">
                      <CategoryIcon
                        category={row.category}
                        type={row.isIncome ? 'Income' : 'Expense'}
                        isSub={row.isSub}
                        size={15}
                        className={row.isIncome ? 'text-emerald' : row.isSub ? 'text-ink/60' : 'text-gold'}
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
                  </SwipeToDelete>
                ))}
              </div>
            ) : (
              <div className="bg-bg-surface border border-ink/[0.06] rounded-card py-10 text-center text-ink-faint text-[13px]">
                No transactions yet — add your first one in Money.
              </div>
            )}
            {activity.length > 0 && hasMore && (
              <div ref={sentinelRef} className="flex justify-center py-5" style={{ minHeight: 44 }}>
                {loadingMore && <LoadBars />}
              </div>
            )}
          </div>
        </>
      )}

      <div className="h-10" />
    </div>

    {/* ── FAB ─────────────────────────────────────────────────────────── */}
    <GlobalFAB actions={[
      { Icon: Star,       label: 'Add to Wishlist', onTap: () => setWishlistOpen(true) },
      { Icon: ArrowUpCircle, label: 'New Income',   onTap: () => { setTxMode('Income');  setExpenseOpen(true) } },
      { Icon: PlusCircle, label: 'New Expense',     onTap: () => { setTxMode('Expense'); setExpenseOpen(true) } },
    ]} />

    <AddTransactionSheet
      mode={txMode}
      open={expenseOpen}
      onClose={() => setExpenseOpen(false)}
      onAdd={handleAdd}
      cards={cards}
      banks={banks}
      defaultCardId={defaultCardId}
      defaultBankId={getAppPrefs().defaultBankId ?? null}
      defaultCategory={getAppPrefs().defaultExpCat}
    />
    <AddWishlistSheet
      open={wishlistOpen}
      onClose={() => setWishlistOpen(false)}
      onAdd={handleAddWish}
    />
    <ActivityDetailSheet item={detailItem} onClose={() => setDetailItem(null)} />
    </>
  )
}
