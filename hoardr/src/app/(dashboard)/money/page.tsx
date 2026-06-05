'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PillGroup } from '@/components/ui/Pill'
import { AddTransactionSheet, type CardOption, type BankOption } from '@/components/money/AddTransactionSheet'
import { EditTransactionSheet, type TxEdits } from '@/components/money/EditTransactionSheet'
import { AddSubscriptionSheet, type NewSub } from '@/components/plans/AddSubscriptionSheet'
import { EditSubscriptionSheet, type SubEdits } from '@/components/plans/EditSubscriptionSheet'
import { AddWishlistSheet, type NewWishItem } from '@/components/plans/AddWishlistSheet'
import { EditWishlistSheet, type WishEdits } from '@/components/plans/EditWishlistSheet'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { type SeedTx } from '@/lib/data/transactions'
import { groupByMonth, fmtDate, localToday, $fk, $fc, $fd, cn, calcSubCosts, nextRenewalDate, daysUntilLabel } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { SlotNumber } from '@/components/ui/SlotNumber'
import { pageCache } from '@/lib/page-cache'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { PullIndicator } from '@/components/ui/PullIndicator'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { createCalEvent, updateCalEvent, deleteCalEvent, allDayEvent } from '@/lib/calendar'
import { RefreshCw, CreditCard, XCircle, MinusCircle, Repeat2, ShoppingCart } from 'lucide-react'
import type { BillingCycle } from '@/types'
import { usePillSwipe } from '@/hooks/usePillSwipe'
import { getAppPrefs } from '@/lib/app-prefs'
import { GlobalFAB } from '@/components/ui/GlobalFAB'

type Tab = 'Expenses' | 'Subs' | 'Wishlist'

function CategoryPillBar({ cat, index, isSub = false, onClick, isExpanded = false }: {
  cat:   { name: string; total: number; pct: number }
  index: number
  isSub?: boolean
  onClick?: () => void
  isExpanded?: boolean
}) {
  const [animPct, setAnimPct] = useState(0)

  useEffect(() => {
    setAnimPct(0)
    const t = setTimeout(() => setAnimPct(cat.pct), 50 + index * 80)
    return () => clearTimeout(t)
  }, [cat.pct, index])

  const amountColor = cat.pct > 70 ? '#C9A84C' : '#556070'

  const inner = (
    <div style={{ position: 'relative', height: 32, borderRadius: 8, background: '#1C1F22' }}>
      {/* Fill — slides behind content, no overflow or flex */}
      <div style={{
        position:   'absolute',
        left: 0, top: 0, bottom: 0,
        width:      `${animPct}%`,
        borderRadius: 8,
        background: 'linear-gradient(90deg, rgba(201,168,76,0.40), rgba(201,168,76,0.12))',
        transition: 'width 600ms cubic-bezier(0.22, 1, 0.36, 1)',
      }} />
      {/* Content overlay — always full track width, never clipped */}
      <div style={{
        position:   'absolute',
        left: 10, right: 10, top: 0, bottom: 0,
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <CategoryIcon
            category={cat.name} type="Expense" size={12} isSub={isSub}
            className={isSub ? 'text-white/60' : 'text-gold'}
          />
          <span style={{ fontSize: 12, fontWeight: 500, color: '#E2EAF0', whiteSpace: 'nowrap' }}>
            {cat.name}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: amountColor, fontFamily: 'var(--font-big-shoulders)' }}>
            {$fd(cat.total)}
          </span>
          {onClick && (
            <span style={{
              fontSize: 12, color: '#45455a',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 200ms ease',
              display: 'inline-block', lineHeight: 1,
            }}>›</span>
          )}
        </div>
      </div>
    </div>
  )

  if (onClick) {
    return (
      <button onClick={onClick} className="w-full text-left select-none" style={{ WebkitUserSelect: 'none' }}>
        {inner}
      </button>
    )
  }
  return inner
}

const LIMIT = 100

interface Sub {
  id:           string
  name:         string
  billing:      BillingCycle
  cost:         number
  monthly_cost: number
  annual_cost:  number
  next_renewal: string | null
  status:       string
  card_id:      string | null
  category:     string | null
  cal_event_id: string | null
}

interface WishItem {
  id:            string
  name:          string
  original_cost: number | null
  category:      string | null
  url:           string | null
  description:   string | null
  bought_cost:   number | null
  ordered_at:    string | null
  status:        string
}

type SubExp = { name: string; cost: number; date: string }

function billingShort(billing: BillingCycle) {
  switch (billing) {
    case 'Annual':    return '/ yr'
    case 'Weekly':    return '/ wk'
    case 'BiWeekly':  return '/ 2wk'
    case 'Quarterly': return '/ qtr'
    default:          return '/ mo'
  }
}

const PILL_OPTIONS: Tab[] = ['Expenses', 'Subs', 'Wishlist']

export default function OutPage() {
  const [tab,           setTab]          = useState<Tab>('Expenses')
  const [expandedSubCat, setExpandedSubCat] = useState<string | null>(null)
  const [subStatCard, setSubStatCard]    = useState<'month' | 'year'>('month')
  usePillSwipe(tab, setTab, PILL_OPTIONS)
  useEffect(() => { setExpandedSubCat(null); setSubStatCard('month') }, [tab])
  useEffect(() => { setExpandedSubCat(null) }, [subStatCard])

  // Expenses
  const cachedTx = pageCache.get<SeedTx[]>('out')
  const [txList,        setTxList]       = useState<SeedTx[]>(cachedTx ?? [])
  const [loading,       setLoading]      = useState(!cachedTx)
  const [hasMore,       setHasMore]      = useState(false)
  const [loadingMore,   setLoadingMore]  = useState(false)
  const [sheetOpen,     setSheetOpen]    = useState(false)
  const [editTx,        setEditTx]       = useState<SeedTx | null>(null)
  const [savedMonth,    setSavedMonth]   = useState(0)

  // Subscriptions
  const [subs,          setSubs]         = useState<Sub[]>([])
  const [subExps,       setSubExps]      = useState<SubExp[]>([])
  const [showCancelled, setShowCancelled] = useState(false)
  const [editSub,       setEditSub]      = useState<Sub | null>(null)
  const [subSheet,      setSubSheet]     = useState(false)

  // Wishlist
  const [wishlist,      setWishlist]     = useState<WishItem[]>([])
  const [savedYear,     setSavedYear]    = useState(0)
  const [editWish,      setEditWish]     = useState<WishItem | null>(null)
  const [buyItem,       setBuyItem]      = useState<WishItem | null>(null)
  const [buyAmount,     setBuyAmount]    = useState('')
  const [buyDate,       setBuyDate]      = useState('')
  const [buyCardId,     setBuyCardId]    = useState<string | null>(null)
  const [wishSheet,     setWishSheet]    = useState(false)

  // Shared
  const [cards,         setCards]        = useState<CardOption[]>([])
  const [banks,         setBanks]        = useState<BankOption[]>([])
  const [defaultCardId, setDefaultCardId] = useState<string | null>(null)

  const supabase      = useMemo(() => createClient(), [])
  const loadGen       = useRef(0)
  const abortRef      = useRef<AbortController | null>(null)
  const txListRef     = useRef<SeedTx[]>(cachedTx ?? [])
  const hasMoreRef    = useRef(false)
  const isLoadingMore = useRef(false)
  const sentinelRef   = useRef<HTMLDivElement>(null)

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++loadGen.current
    try {
      const yearStart  = localToday().slice(0, 4) + '-01-01'
      const monthStart = localToday().slice(0, 7) + '-01'
      const [
        { data: expenses },
        { data: subsData },
        { data: wishData },
        { data: yearExps },
        { data: monthSav },
      ] = await Promise.all([
        supabase.from('expenses')
          .select('id, name, cost, date, description, card_id, savings, categories(name)')
          .order('date',       { ascending: false })
          .order('created_at', { ascending: false })
          .limit(LIMIT)
          .abortSignal(controller.signal),
        supabase.from('subscriptions')
          .select('id, name, cost, billing, status, next_renewal, monthly_cost, annual_cost, card_id, category, cal_event_id')
          .order('next_renewal', { ascending: true })
          .abortSignal(controller.signal),
        supabase.from('wishlist')
          .select('id, name, original_cost, category, url, description, bought_cost, ordered_at, status')
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal),
        supabase.from('expenses')
          .select('name, cost, date, savings')
          .gte('date', yearStart)
          .abortSignal(controller.signal),
        supabase.from('expenses')
          .select('savings')
          .gte('date', monthStart)
          .abortSignal(controller.signal),
      ])

      const rows: SeedTx[] = (expenses ?? []).map(e => ({
        id:          String(e.id),
        type:        'Expense' as const,
        name:        String(e.name),
        category:    (e.categories as unknown as { name: string } | null)?.name ?? 'Other',
        date:        String(e.date),
        amount:      Number(e.cost),
        savings:     e.savings != null ? Number(e.savings) : 0,
        description: e.description ? String(e.description) : null,
        card_id:     e.card_id ? String(e.card_id) : null,
      }))

      const newSubs: Sub[] = (subsData ?? []).map(s => ({
        id:           String(s.id),
        name:         String(s.name),
        billing:      s.billing as BillingCycle,
        cost:         Number(s.cost),
        monthly_cost: Number(s.monthly_cost ?? 0),
        annual_cost:  Number(s.annual_cost  ?? 0),
        next_renewal: s.next_renewal ? String(s.next_renewal) : null,
        status:       String(s.status),
        card_id:      s.card_id ? String(s.card_id) : null,
        category:     s.category ? String(s.category) : null,
        cal_event_id: s.cal_event_id ? String(s.cal_event_id) : null,
      }))

      const newWish: WishItem[] = (wishData ?? []).map(w => ({
        id:            String(w.id),
        name:          String(w.name),
        original_cost: w.original_cost != null ? Number(w.original_cost) : null,
        category:      w.category ? String(w.category) : null,
        url:           w.url ? String(w.url) : null,
        description:   (w as { description?: unknown }).description ? String((w as { description?: unknown }).description) : null,
        bought_cost:   w.bought_cost != null ? Number(w.bought_cost) : null,
        ordered_at:    w.ordered_at ? String(w.ordered_at) : null,
        status:        String(w.status),
      }))

      const newSubExps: SubExp[] = (yearExps ?? []).map(e => ({
        name: String(e.name), cost: Number(e.cost), date: String(e.date),
      }))

      const monthSaved = (monthSav ?? []).reduce((s, e) => {
        const v = Number(e.savings ?? 0); return v > 0 ? s + v : s
      }, 0)
      const yearSaved = (yearExps ?? []).reduce((s, e) => {
        const v = Number((e as { savings?: unknown }).savings ?? 0); return v > 0 ? s + v : s
      }, 0)

      if (gen !== loadGen.current) return
      setTxList(rows)
      setHasMore((expenses?.length ?? 0) >= LIMIT)
      setSubs(newSubs)
      setWishlist(newWish)
      setSubExps(newSubExps)
      setSavedMonth(monthSaved)
      setSavedYear(yearSaved)
      pageCache.set('out', rows)
      setLoading(false)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('loadData error:', err)
    }
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++; abortRef.current?.abort() } }, [loadData])
  useEffect(() => { txListRef.current = txList }, [txList])
  useEffect(() => { hasMoreRef.current = hasMore }, [hasMore])

  const { distance: pullDist, refreshing: pullRefreshing, threshold: pullThreshold } = usePullToRefresh(loadData)

  const loadMore = useCallback(async () => {
    if (isLoadingMore.current || !hasMoreRef.current) return
    isLoadingMore.current = true
    setLoadingMore(true)
    const list     = txListRef.current
    const lastDate = list[list.length - 1]?.date
    if (!lastDate) { isLoadingMore.current = false; setLoadingMore(false); return }
    const existingIds = new Set(list.map(t => t.id))
    try {
      const { data: expenses } = await supabase
        .from('expenses')
        .select('id, name, cost, date, description, card_id, savings, categories(name)')
        .lte('date', lastDate)
        .order('date',       { ascending: false })
        .order('created_at', { ascending: false })
        .limit(LIMIT)
      const newRows: SeedTx[] = (expenses ?? [])
        .filter(e => !existingIds.has(String(e.id)))
        .map(e => ({
          id:          String(e.id),
          type:        'Expense' as const,
          name:        String(e.name),
          category:    (e.categories as unknown as { name: string } | null)?.name ?? 'Other',
          date:        String(e.date),
          amount:      Number(e.cost),
          savings:     e.savings != null ? Number(e.savings) : 0,
          description: e.description ? String(e.description) : null,
          card_id:     e.card_id ? String(e.card_id) : null,
        }))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, LIMIT)
      setTxList(prev => [...prev, ...newRows])
      const more = newRows.length === LIMIT
      setHasMore(more)
      hasMoreRef.current = more
    } catch (err) {
      console.error('loadMore error:', err)
    } finally {
      isLoadingMore.current = false
      setLoadingMore(false)
    }
  }, [supabase])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore() },
      { rootMargin: '200px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMore])

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
        console.error('loadWallet error:', err)
      }
    }
    loadWallet()
    return () => { mounted = false }
  }, [supabase])

  // ── Expense handlers ───────────────────────────────────────────────────────

  function handleDelete(tx: SeedTx) {
    const snapshot = txListRef.current.slice()
    setTxList(prev => prev.filter(t => t.id !== tx.id))
    showToast(`${tx.name} deleted`, {
      type: 'delete',
      undo: {
        onUndo:   () => setTxList(snapshot),
        onCommit: () => { supabase.from('expenses').delete().eq('id', tx.id) },
      },
    })
  }

  async function handleAdd(tx: SeedTx) {
    if (tx.type === 'Expense') setTxList(prev => [tx, ...prev])
    showToast(`${tx.name} added`, { type: 'add' })
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return

    if (tx.type === 'Expense') {
      const { data: existing } = await supabase.from('categories').select('id').eq('user_id', user.id).eq('name', tx.category).maybeSingle()
      let categoryId: string | null = existing?.id ?? null
      if (!categoryId) {
        const { data: created } = await supabase.from('categories').insert({ user_id: user.id, name: tx.category }).select('id').single()
        categoryId = created?.id ?? null
      }
      const { error } = await supabase.from('expenses').insert({ user_id: user.id, name: tx.name, cost: tx.amount, original_cost: tx.original_cost ?? null, date: tx.date, description: tx.description ?? null, category_id: categoryId, status: 'Procured', card_id: tx.card_id ?? null })
      if (error) console.error('expense insert error:', JSON.stringify(error))
    } else {
      const { error } = await supabase.from('income').insert({ user_id: user.id, name: tx.name, amount: tx.amount, date: tx.date, description: tx.description ?? null, source: tx.category, bank_id: tx.bank_id ?? null })
      if (error) console.error('income insert error:', JSON.stringify(error))
    }
    await loadData()
  }

  async function handleSave(id: string, updates: TxEdits) {
    const tx = txList.find(t => t.id === id)
    if (!tx) return
    setTxList(prev => prev.map(t => t.id === id ? { ...t, name: updates.name, amount: updates.amount, category: updates.category, date: updates.date, description: updates.description, card_id: updates.card_id } : t))
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }
    const { data: existing } = await supabase.from('categories').select('id').eq('user_id', user.id).eq('name', updates.category).maybeSingle()
    let categoryId: string | null = existing?.id ?? null
    if (!categoryId) {
      const { data: created } = await supabase.from('categories').insert({ user_id: user.id, name: updates.category }).select('id').single()
      categoryId = created?.id ?? null
    }
    const { error } = await supabase.from('expenses').update({ name: updates.name, cost: updates.amount, date: updates.date, description: updates.description, category_id: categoryId, card_id: updates.card_id }).eq('id', id)
    if (error) { console.error('edit expense error:', JSON.stringify(error)); await loadData() }
  }

  // ── Subscription handlers ──────────────────────────────────────────────────

  async function handlePaySub(id: string) {
    const sub = subs.find(s => s.id === id)
    if (!sub) return
    const today      = localToday()
    const newRenewal = nextRenewalDate(sub.next_renewal ?? today, sub.billing)
    setSubs(prev => prev.map(s => s.id === id ? { ...s, next_renewal: newRenewal } : s))
    showToast(`${sub.name} paid`, { type: 'payment' })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }
    const categoryName = sub.category ?? 'Subscriptions'
    const { data: existingCat } = await supabase.from('categories').select('id').eq('user_id', user.id).eq('name', categoryName).maybeSingle()
    let categoryId: string | null = existingCat?.id ?? null
    if (!categoryId) {
      const { data: created } = await supabase.from('categories').insert({ user_id: user.id, name: categoryName }).select('id').single()
      categoryId = created?.id ?? null
    }
    await Promise.all([
      supabase.from('expenses').insert({ user_id: user.id, name: sub.name, cost: sub.cost, date: today, category_id: categoryId, card_id: sub.card_id }),
      supabase.from('subscriptions').update({ next_renewal: newRenewal }).eq('id', id),
    ])
    loadData()
  }

  async function handleCancelSub(id: string) {
    const sub = subs.find(s => s.id === id)
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status: 'Cancelled' } : s))
    const { error } = await supabase.from('subscriptions').update({ status: 'Cancelled' }).eq('id', id)
    if (error) { console.error('cancel sub error:', JSON.stringify(error)); await loadData(); return }
    if (!sub) return
    showToast(`${sub.name} cancelled`, {
      type: 'delete',
      undo: {
        onUndo:   () => { setSubs(prev => prev.map(s => s.id === id ? { ...s, status: 'Active' } : s)); supabase.from('subscriptions').update({ status: 'Active' }).eq('id', id) },
        onCommit: () => {},
      },
    })
  }

  async function handleRestoreSub(id: string) {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status: 'Active' } : s))
    const { error } = await supabase.from('subscriptions').update({ status: 'Active' }).eq('id', id)
    if (error) { console.error('restore sub error:', JSON.stringify(error)); await loadData() }
  }

  function handleDeleteSub(id: string) {
    const sub = subs.find(s => s.id === id)
    if (!sub) return
    const snapshot = subs.slice()
    setSubs(prev => prev.filter(s => s.id !== id))
    showToast(`${sub.name} deleted`, {
      type: 'delete',
      undo: {
        onUndo:   () => setSubs(snapshot),
        onCommit: () => {
          if (sub.cal_event_id) deleteCalEvent(sub.cal_event_id)
          supabase.from('subscriptions').delete().eq('id', id)
        },
      },
    })
  }

  async function handleAddSub(sub: NewSub) {
    const { monthly, annual } = calcSubCosts(sub.cost, sub.billing)
    const tempId = `temp-${Date.now()}`
    setSubs(prev => [...prev, { id: tempId, name: sub.name, billing: sub.billing, cost: sub.cost, monthly_cost: monthly, annual_cost: annual, next_renewal: sub.next_renewal, status: 'Active', card_id: sub.card_id, category: sub.category ?? null, cal_event_id: null }])
    if (sub.card_id) setDefaultCardId(sub.card_id)
    showToast(`${sub.name} added`, { type: 'add' })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }
    const { data: inserted } = await supabase.from('subscriptions').insert({ user_id: user.id, name: sub.name, cost: sub.cost, billing: sub.billing, next_renewal: sub.next_renewal, status: 'Active', payments: 0, monthly_cost: monthly, annual_cost: annual, card_id: sub.card_id, category: sub.category ?? null }).select('id').single()
    if (sub.next_renewal && inserted?.id) {
      const googleEventId = await createCalEvent(allDayEvent(`🔄 ${sub.name}`, sub.next_renewal, `${sub.billing} · $${sub.cost}`))
      if (googleEventId) await supabase.from('subscriptions').update({ cal_event_id: googleEventId }).eq('id', inserted.id)
    }
    await loadData()
  }

  async function handleEditSub(id: string, edits: SubEdits) {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, ...edits } : s))
    if (edits.card_id) setDefaultCardId(edits.card_id)
    const { error } = await supabase.from('subscriptions').update({ name: edits.name, cost: edits.cost, billing: edits.billing, next_renewal: edits.next_renewal, monthly_cost: edits.monthly_cost, annual_cost: edits.annual_cost, card_id: edits.card_id, category: edits.category ?? null }).eq('id', id)
    if (error) { console.error('edit sub error:', JSON.stringify(error)); await loadData(); return }
    if (edits.next_renewal) {
      const existing = subs.find(s => s.id === id)
      const gcalEv   = allDayEvent(`🔄 ${edits.name}`, edits.next_renewal, `${edits.billing} · $${edits.cost}`)
      if (existing?.cal_event_id) await updateCalEvent(existing.cal_event_id, gcalEv)
      else {
        const googleEventId = await createCalEvent(gcalEv)
        if (googleEventId) await supabase.from('subscriptions').update({ cal_event_id: googleEventId }).eq('id', id)
      }
    }
  }

  // ── Wishlist handlers ──────────────────────────────────────────────────────

  async function handleBuyItem(id: string, paidCost: number, date: string, cardId: string | null) {
    const item     = wishlist.find(w => w.id === id)
    if (!item) return
    setWishlist(prev => prev.map(w => w.id === id ? { ...w, status: 'Ordered', bought_cost: paidCost, ordered_at: date } : w))
    showToast(`${item.name} ordered`, { type: 'payment' })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }
    const categoryName = item.category ?? 'Shopping'
    const { data: existing } = await supabase.from('categories').select('id').eq('user_id', user.id).eq('name', categoryName).maybeSingle()
    let categoryId: string | null = existing?.id ?? null
    if (!categoryId) {
      const { data: created } = await supabase.from('categories').insert({ user_id: user.id, name: categoryName }).select('id').single()
      categoryId = created?.id ?? null
    }
    await supabase.from('expenses').insert({ user_id: user.id, name: item.name, cost: paidCost, date, category_id: categoryId, status: 'Procured', card_id: cardId, description: item.url ?? null, original_cost: item.original_cost ?? null })
    await supabase.from('wishlist').update({ status: 'Ordered', bought_cost: paidCost, ordered_at: date }).eq('id', id)
    loadData()
  }

  function handleDeleteWish(id: string) {
    const item     = wishlist.find(w => w.id === id)
    if (!item) return
    const snapshot = wishlist.slice()
    setWishlist(prev => prev.filter(w => w.id !== id))
    showToast(`${item.name} deleted`, {
      type: 'delete',
      undo: { onUndo: () => setWishlist(snapshot), onCommit: () => { supabase.from('wishlist').delete().eq('id', id) } },
    })
  }

  async function handleAddWish(item: NewWishItem) {
    const tempId = `temp-${Date.now()}`
    setWishlist(prev => [{ id: tempId, name: item.name, original_cost: item.original_cost, category: item.category, url: item.url, description: item.description, bought_cost: null, ordered_at: null, status: 'Interested' }, ...prev])
    showToast(`${item.name} added`, { type: 'add' })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }
    await supabase.from('wishlist').insert({ user_id: user.id, name: item.name, original_cost: item.original_cost, category: item.category, url: item.url, description: item.description, status: 'Interested' })
    await loadData()
  }

  async function handleEditWish(id: string, edits: WishEdits) {
    setWishlist(prev => prev.map(w => w.id === id ? { ...w, ...edits } : w))
    const { error } = await supabase.from('wishlist').update({ name: edits.name, original_cost: edits.original_cost, category: edits.category, url: edits.url, description: edits.description }).eq('id', id)
    if (error) { console.error('edit wish error:', JSON.stringify(error)); await loadData() }
  }

  // ── Computed ───────────────────────────────────────────────────────────────

  const activeSubs    = useMemo(() => subs.filter(s => s.status === 'Active'),    [subs])
  const cancelledSubs = useMemo(() => subs.filter(s => s.status === 'Cancelled'), [subs])
  const interestedWish = useMemo(() => wishlist.filter(w => w.status === 'Interested'), [wishlist])

  const subNames = useMemo(() =>
    new Set(activeSubs.map(s => s.name.toLowerCase())),
  [activeSubs])

  const monthSpent = useMemo(() => {
    const mo = localToday().slice(0, 7)
    return txList.filter(t => t.date.startsWith(mo)).reduce((s, t) => s + t.amount, 0)
  }, [txList])

  const subTotals = useMemo(() => ({
    monthly: activeSubs.reduce((s, sub) => s + sub.monthly_cost, 0),
    annual:  activeSubs.reduce((s, sub) => s + sub.annual_cost,  0),
  }), [activeSubs])

  const paidTotals = useMemo(() => {
    const now        = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const yearStart  = `${now.getFullYear()}-01-01`
    const matched    = subExps.filter(e => subNames.has(e.name.toLowerCase()))
    return {
      monthly: matched.filter(e => e.date >= monthStart).reduce((s, e) => s + e.cost, 0),
      annual:  matched.filter(e => e.date >= yearStart ).reduce((s, e) => s + e.cost, 0),
    }
  }, [subNames, subExps])

  const subNameCatMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const s of activeSubs) map.set(s.name.toLowerCase(), s.category ?? 'Subscriptions')
    return map
  }, [activeSubs])

  const paidMonthCatBreakdown = useMemo(() => {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const totals: Record<string, number> = {}
    for (const e of subExps) {
      if (!subNames.has(e.name.toLowerCase()) || e.date < monthStart) continue
      const cat = subNameCatMap.get(e.name.toLowerCase()) ?? 'Subscriptions'
      totals[cat] = (totals[cat] ?? 0) + e.cost
    }
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1])
    const top = entries[0]?.[1] ?? 1
    return entries.map(([name, total]) => ({ name, total, pct: Math.round(total / top * 100) }))
  }, [subExps, subNames, subNameCatMap])

  const paidYearCatBreakdown = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const e of subExps) {
      if (!subNames.has(e.name.toLowerCase())) continue
      const cat = subNameCatMap.get(e.name.toLowerCase()) ?? 'Subscriptions'
      totals[cat] = (totals[cat] ?? 0) + e.cost
    }
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1])
    const top = entries[0]?.[1] ?? 1
    return entries.map(([name, total]) => ({ name, total, pct: Math.round(total / top * 100) }))
  }, [subExps, subNames, subNameCatMap])

  const wishStats = useMemo(() => {
    const total = interestedWish.reduce((s, w) => s + (w.original_cost ?? 0), 0)
    const saved = wishlist.filter(w => w.status === 'Purchased').reduce((s, w) => {
      const diff = (w.original_cost ?? 0) - (w.bought_cost ?? 0)
      return diff > 0 ? s + diff : s
    }, 0)
    return { total, saved }
  }, [wishlist, interestedWish])

  const catBreakdown = useMemo(() => {
    const mo = localToday().slice(0, 7)
    const totals: Record<string, number> = {}
    for (const t of txList) {
      if (!t.date.startsWith(mo)) continue
      totals[t.category] = (totals[t.category] ?? 0) + t.amount
    }
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const top = entries[0]?.[1] ?? 1
    return entries.map(([name, total]) => ({ name, total, pct: Math.round((total / top) * 100) }))
  }, [txList])

  const subCatBreakdown = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const s of activeSubs) {
      const cat = s.category ?? 'Subscriptions'
      totals[cat] = (totals[cat] ?? 0) + s.monthly_cost
    }
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const top = entries[0]?.[1] ?? 1
    return entries.map(([name, total]) => ({ name, total, pct: Math.round((total / top) * 100) }))
  }, [activeSubs])

  const wishCatBreakdown = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const w of interestedWish) {
      const cat = w.category ?? 'Other'
      totals[cat] = (totals[cat] ?? 0) + (w.original_cost ?? 0)
    }
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const top = entries[0]?.[1] ?? 1
    return entries.map(([name, total]) => ({ name, total, pct: Math.round((total / top) * 100) }))
  }, [interestedWish])

  const sorted = useMemo(() => [...txList].sort((a, b) => b.date.localeCompare(a.date)), [txList])
  const groups = useMemo(() =>
    groupByMonth(sorted).map(g => ({
      ...g,
      spent: g.rows.reduce((s, r) => s + (r as SeedTx).amount, 0),
    })),
  [sorted])

  return (
  <>
    <div className="min-h-screen bg-bg-base tab-enter">

      <PullIndicator distance={pullDist} threshold={pullThreshold} refreshing={pullRefreshing} />
      <div style={{ height: 'calc(env(safe-area-inset-top, 44px) + 8px)' }} />

      {/* ── Pills ────────────────────────────────────────────────────────── */}
      <div className="mx-4 mt-4">
        <PillGroup options={['Expenses', 'Subs', 'Wishlist'] as Tab[]} value={tab} onChange={setTab} />
      </div>

      {/* ── Stat tiles ───────────────────────────────────────────────────── */}
      {!loading && tab === 'Expenses' && (
        <div className="mx-4 mt-4 flex gap-2">
          <div className="flex-1 bg-bg-surface border border-white/[0.06] rounded-[22px] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-ink-muted">Spent</p>
              <span className="text-[13px] text-gold">↑</span>
            </div>
            <p className="text-[26px] font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
              <SlotNumber value={monthSpent} format={$fc} />
            </p>
          </div>
          <div className="flex-1 bg-bg-surface border border-white/[0.06] rounded-[22px] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-ink-muted">Saved</p>
              <span className="text-[13px] text-emerald">✦</span>
            </div>
            <p className="text-[26px] font-bold tracking-tight text-emerald" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
              <SlotNumber value={savedMonth} format={$fc} />
            </p>
          </div>
        </div>
      )}
      {!loading && tab === 'Subs' && (
        <div className="mx-4 mt-4 flex gap-2">
          <button
            onClick={() => setSubStatCard('month')}
            className={cn('flex-1 bg-bg-surface border rounded-[22px] p-4 text-left transition-colors select-none',
              subStatCard === 'month' ? 'border-gold/40' : 'border-white/[0.06]')}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={cn('text-[10px] font-semibold tracking-[0.1em] uppercase', subStatCard === 'month' ? 'text-gold' : 'text-ink-muted')}>This Month</p>
              <span className="text-[13px] text-gold">↻</span>
            </div>
            <p className="text-[26px] font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
              <SlotNumber value={paidTotals.monthly} format={$fc} />
            </p>
            <p className="text-[11px] font-mono text-ink-faint mt-1">/ <SlotNumber value={subTotals.monthly} format={$fc} /></p>
          </button>
          <button
            onClick={() => setSubStatCard('year')}
            className={cn('flex-1 bg-bg-surface border rounded-[22px] p-4 text-left transition-colors select-none',
              subStatCard === 'year' ? 'border-gold/40' : 'border-white/[0.06]')}
          >
            <div className="flex items-center justify-between mb-3">
              <p className={cn('text-[10px] font-semibold tracking-[0.1em] uppercase', subStatCard === 'year' ? 'text-gold' : 'text-ink-muted')}>This Year</p>
              <span className="text-[13px] text-emerald">∞</span>
            </div>
            <p className="text-[26px] font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
              <SlotNumber value={paidTotals.annual} format={$fc} />
            </p>
            <p className="text-[11px] font-mono text-ink-faint mt-1">/ <SlotNumber value={subTotals.annual} format={$fc} /></p>
          </button>
        </div>
      )}
      {!loading && tab === 'Wishlist' && (
        <div className="mx-4 mt-4 flex gap-2">
          <div className="flex-1 bg-bg-surface border border-white/[0.06] rounded-[22px] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-ink-muted">On List</p>
              <span className="text-[13px] text-gold">★</span>
            </div>
            <p className="text-[26px] font-bold tracking-tight text-ink" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
              <SlotNumber value={wishStats.total} format={$fc} />
            </p>
          </div>
          <div className="flex-1 bg-bg-surface border border-white/[0.06] rounded-[22px] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-ink-muted">Saved / Yr</p>
              <span className="text-[13px] text-emerald">✦</span>
            </div>
            <p className="text-[26px] font-bold tracking-tight text-emerald" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
              <SlotNumber value={savedYear} format={$fc} />
            </p>
          </div>
        </div>
      )}

      {/* ── Category breakdown ────────────────────────────────────────────── */}
      {!loading && tab === 'Expenses' && catBreakdown.length > 0 && (
        <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card px-4 py-3">
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">This Month</p>
          <div className="space-y-2">
            {catBreakdown.map((cat, i) => (
              <CategoryPillBar key={cat.name} cat={cat} index={i} isSub={subNames.has(cat.name.toLowerCase())} />
            ))}
          </div>
        </div>
      )}
      {!loading && tab === 'Subs' && (() => {
        const breakdown = subStatCard === 'month' ? paidMonthCatBreakdown : paidYearCatBreakdown
        if (breakdown.length === 0) return null
        const now = new Date()
        const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        return (
          <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card px-4 py-3">
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">
              {subStatCard === 'month' ? 'Paid This Month by Category' : 'Paid This Year by Category'}
            </p>
            <div className="space-y-2">
              {breakdown.map((cat, i) => {
                const isOpen = expandedSubCat === cat.name

                type DrillItem = { key: string; name: string; amount: number; meta: string }
                let drillItems: DrillItem[]
                if (subStatCard === 'month') {
                  drillItems = subExps
                    .filter(e => subNames.has(e.name.toLowerCase()) && e.date >= monthStart && (subNameCatMap.get(e.name.toLowerCase()) ?? 'Subscriptions') === cat.name)
                    .map(e => ({ key: `${e.name}-${e.date}`, name: e.name, amount: e.cost, meta: fmtDate(e.date) }))
                } else {
                  const byName = new Map<string, { total: number; count: number }>()
                  for (const e of subExps) {
                    if (!subNames.has(e.name.toLowerCase())) continue
                    if ((subNameCatMap.get(e.name.toLowerCase()) ?? 'Subscriptions') !== cat.name) continue
                    const cur = byName.get(e.name) ?? { total: 0, count: 0 }
                    byName.set(e.name, { total: cur.total + e.cost, count: cur.count + 1 })
                  }
                  drillItems = [...byName.entries()]
                    .sort((a, b) => b[1].total - a[1].total)
                    .map(([name, { total, count }]) => ({ key: name, name, amount: total, meta: `${count}×` }))
                }

                return (
                  <div key={cat.name}>
                    <CategoryPillBar
                      cat={cat}
                      index={i}
                      onClick={() => setExpandedSubCat(isOpen ? null : cat.name)}
                      isExpanded={isOpen}
                    />
                    <div style={{
                      overflow: 'hidden',
                      maxHeight: isOpen ? `${drillItems.length * 48 + 4}px` : 0,
                      opacity: isOpen ? 1 : 0,
                      transition: 'max-height 300ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease',
                    }}>
                      <div className="pt-1 divide-y divide-white/[0.04]">
                        {drillItems.map(item => (
                          <div key={item.key} className="flex items-center py-2.5 px-1">
                            <p className="flex-1 text-[13px] font-medium text-ink truncate">{item.name}</p>
                            <div className="text-right flex-shrink-0">
                              <p className="text-[12px] font-semibold font-mono text-gold">{$fd(item.amount)}</p>
                              <p className="text-[10px] font-mono text-ink-faint">{item.meta}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
      {!loading && tab === 'Wishlist' && wishCatBreakdown.length > 0 && (
        <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card px-4 py-3">
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Wish List by Category</p>
          <div className="space-y-2">
            {wishCatBreakdown.map((cat, i) => (
              <CategoryPillBar key={cat.name} cat={cat} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="mx-4 mt-5 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-[62px] rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Expenses ─────────────────────────────────────────────────────── */}
      {!loading && tab === 'Expenses' && (
        <div className="mx-4 mt-5 space-y-5">
          {groups.length === 0 && (
            <div className="py-12 text-center text-ink-faint text-[13px]">No expenses yet — add your first one above.</div>
          )}
          {groups.map(group => (
            <div key={group.key}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint">{group.label}</p>
                <p className="text-[11px] font-semibold font-mono text-gold">−{$fk(group.spent)}</p>
              </div>
              <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                {group.rows.map(row => {
                  const tx = row as SeedTx
                  return (
                    <SwipeToDelete key={tx.id} onDelete={() => handleDelete(tx)} onTap={() => setEditTx(tx)}>
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                          <CategoryIcon category={tx.category} type="Expense" size={15}
                            isSub={subNames.has(tx.name.toLowerCase())}
                            className={subNames.has(tx.name.toLowerCase()) ? 'text-white/60' : 'text-gold'} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-ink truncate">{tx.name}</p>
                          <p className="text-[11px] text-ink-muted">{tx.category} · {fmtDate(tx.date)}</p>
                        </div>
                        <p className="text-[15px] font-semibold font-mono flex-shrink-0 text-ink">−{$fd(tx.amount)}</p>
                      </div>
                    </SwipeToDelete>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Subscriptions ────────────────────────────────────────────────── */}
      {!loading && tab === 'Subs' && (
        <>
          {activeSubs.length === 0 ? (
            <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card py-12 text-center text-ink-faint text-[13px]">
              No active subscriptions — tap + to add one.
            </div>
          ) : (
            <div className="mx-4 mt-4">
              <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                {activeSubs.map(sub => {
                  const renewal   = sub.next_renewal ? daysUntilLabel(sub.next_renewal) : '—'
                  const isOverdue = typeof renewal === 'string' && renewal.includes('ago')
                  const card      = sub.card_id ? cards.find(c => c.id === sub.card_id) ?? null : null
                  return (
                    <SwipeToDelete
                      key={sub.id}
                      onDelete={() => handleCancelSub(sub.id)}
                      actionLabel={<XCircle size={18} strokeWidth={1.5} className="text-white" />}
                      actionBg="bg-amber-600"
                      onTap={() => setEditSub(sub)}
                      onRight={() => handlePaySub(sub.id)}
                      rightLabel={<CreditCard size={18} strokeWidth={1.5} className="text-white" />}
                    >
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                          {sub.category
                            ? <CategoryIcon category={sub.category} type="Expense" isSub size={15} className="text-gold" />
                            : <RefreshCw size={15} className="text-gold" strokeWidth={1.75} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-ink">{sub.name}</p>
                          <div className="flex items-center gap-1">
                            <span className={cn('text-[11px]', isOverdue ? 'text-ruby' : 'text-ink-muted')}>{renewal}</span>
                            {card && <span className="text-[10px] text-ink-faint">· {card.name}</span>}
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[15px] font-semibold font-mono text-ink">{$fd(sub.cost)}</p>
                          <p className="text-[10px] text-ink-faint">{billingShort(sub.billing)}</p>
                        </div>
                      </div>
                    </SwipeToDelete>
                  )
                })}
              </div>
            </div>
          )}
          {cancelledSubs.length > 0 && (
            <div className="mx-4 mt-4">
              <button
                onClick={() => setShowCancelled(v => !v)}
                className="flex items-center gap-2 text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-3 select-none"
              >
                <span className={cn('transition-transform', showCancelled ? 'rotate-90' : '')} style={{ display: 'inline-block' }}>›</span>
                Cancelled ({cancelledSubs.length})
              </button>
              {showCancelled && (
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04] opacity-60">
                  {cancelledSubs.map(sub => (
                    <SwipeToDelete key={sub.id} onDelete={() => handleDeleteSub(sub.id)}>
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                          <RefreshCw size={15} className="text-ink-faint" strokeWidth={1.75} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-ink line-through">{sub.name}</p>
                          <p className="text-[11px] text-ink-faint">Cancelled</p>
                        </div>
                        <button
                          onClick={() => handleRestoreSub(sub.id)}
                          className="text-[11px] font-semibold text-emerald bg-emerald/10 px-3 py-1.5 rounded-[10px] flex-shrink-0 select-none"
                        >
                          Restore
                        </button>
                      </div>
                    </SwipeToDelete>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Wishlist ─────────────────────────────────────────────────────── */}
      {!loading && tab === 'Wishlist' && (
        <div className="mx-4 mt-4">
          {interestedWish.length === 0 ? (
            <div className="bg-bg-surface border border-white/[0.06] rounded-card py-12 text-center text-ink-faint text-[13px]">
              Nothing on your wishlist — tap + to add an item.
            </div>
          ) : (
            <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
              {interestedWish.map(item => (
                <SwipeToDelete
                  key={item.id}
                  onDelete={() => handleDeleteWish(item.id)}
                  onTap={() => setEditWish(item)}
                  onRight={item.status === 'Interested' ? () => { setBuyItem(item); setBuyAmount(''); setBuyDate(localToday()); setBuyCardId(defaultCardId) } : undefined}
                  rightLabel={<CreditCard size={18} strokeWidth={1.5} className="text-white" />}
                >
                  <div className="flex items-center gap-3 px-4 py-3.5">
                    <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                      <CategoryIcon category={item.category ?? 'Other'} type="Expense" size={15} className="text-gold" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-ink truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {(item.description || item.category) && (
                          <p className="text-[11px] text-ink-muted truncate">{item.description ?? item.category}</p>
                        )}
                        {item.url && (
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-[11px] font-semibold text-gold flex-shrink-0 select-none">
                            View →
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {item.original_cost != null ? (
                        <>
                          <p className="text-[15px] font-semibold font-mono text-ink">{$fd(item.original_cost)}</p>
                          <p className="text-[10px] text-ink-faint">list</p>
                        </>
                      ) : (
                        <p className="text-[11px] text-ink-faint">no price</p>
                      )}
                    </div>
                  </div>
                </SwipeToDelete>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Infinite scroll sentinel (Expenses only) */}
      {tab === 'Expenses' && (
        <>
          <div ref={sentinelRef} className="h-px" />
          {loadingMore && <p className="py-3 text-center text-[11px] text-ink-faint">Loading…</p>}
        </>
      )}
      <div className="h-10" />
    </div>

    {/* ── FAB ───────────────────────────────────────────────────────────── */}
    <GlobalFAB actions={[
      { Icon: Repeat2,      label: 'New Subscription', onTap: () => setSubSheet(true)   },
      { Icon: ShoppingCart, label: 'Add to Wishlist',  onTap: () => setWishSheet(true)  },
      { Icon: MinusCircle,  label: 'New Expense',      onTap: () => setSheetOpen(true)  },
    ]} />

    <AddTransactionSheet
      open={sheetOpen}
      onClose={() => setSheetOpen(false)}
      onAdd={handleAdd}
      cards={cards}
      banks={banks}
      defaultCardId={defaultCardId}
      defaultBankId={getAppPrefs().defaultBankId ?? null}
      defaultCategory={getAppPrefs().defaultExpCat}
    />
    <EditTransactionSheet
      tx={editTx}
      open={editTx !== null}
      onClose={() => setEditTx(null)}
      onSave={handleSave}
      cards={cards}
      banks={banks}
    />
    <AddSubscriptionSheet
      open={subSheet}
      onClose={() => setSubSheet(false)}
      onAdd={handleAddSub}
      cards={cards}
      defaultCardId={defaultCardId}
      defaultBilling={getAppPrefs().defaultBilling as BillingCycle}
    />
    <AddWishlistSheet
      open={wishSheet}
      onClose={() => setWishSheet(false)}
      onAdd={handleAddWish}
    />
    <EditSubscriptionSheet
      sub={editSub}
      open={editSub !== null}
      onClose={() => setEditSub(null)}
      onSave={handleEditSub}
      cards={cards}
    />
    <EditWishlistSheet
      item={editWish}
      open={editWish !== null}
      onClose={() => setEditWish(null)}
      onSave={handleEditWish}
    />

    {/* ── Buy sheet ────────────────────────────────────────────────────── */}
    <div
      onClick={() => setBuyItem(null)}
      className={cn('fixed inset-0 z-[59] transition-opacity duration-300', buyItem ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    />
    <div
      className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', buyItem ? 'translate-y-0' : 'translate-y-full')}
      style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex justify-center pt-3 pb-2">
        <div className="w-9 h-1 rounded-full bg-white/20" />
      </div>
      <div className="flex items-center justify-between px-5 mb-5">
        <div>
          <h2 className="text-[18px] font-bold tracking-tight text-ink">Mark as Bought</h2>
          {buyItem && <p className="text-[12px] text-ink-muted mt-0.5 truncate max-w-[220px]">{buyItem.name}</p>}
        </div>
        <button onClick={() => setBuyItem(null)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
      </div>
      <div className="px-5 space-y-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
        {buyItem?.original_cost != null && (
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-ink-muted">List price</p>
            <p className="text-[13px] font-mono text-ink-muted">{$fd(buyItem.original_cost)}</p>
          </div>
        )}
        <div>
          <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">What did you pay?</p>
          <div className="flex items-center gap-1.5 bg-bg-overlay rounded-[14px] px-4 py-3">
            <span className="text-[22px] font-light text-ink-muted font-mono">$</span>
            <input
              type="text" inputMode="decimal" placeholder="0.00" value={buyAmount}
              onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setBuyAmount(v) }}
              className="flex-1 bg-transparent text-[28px] font-bold font-mono text-ink outline-none placeholder:text-ink-faint"
            />
          </div>
          {buyItem?.original_cost != null && parseFloat(buyAmount) > 0 && buyItem.original_cost > parseFloat(buyAmount) && (
            <p className="text-[11px] text-emerald font-mono mt-2">You saved {$fd(buyItem.original_cost - parseFloat(buyAmount))}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Date</p>
          <div className="overflow-hidden rounded-[14px]">
            <input type="date" value={buyDate} onChange={e => setBuyDate(e.target.value)}
              className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5 text-[15px] text-ink outline-none focus:border-gold/40"
              style={{ colorScheme: 'dark' }} />
          </div>
        </div>
        {cards.length > 0 && (
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Card</p>
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              <button onClick={() => setBuyCardId(null)}
                className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all select-none',
                  buyCardId === null ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                None
              </button>
              {cards.map(c => (
                <button key={c.id} onClick={() => setBuyCardId(c.id)}
                  className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all select-none',
                    buyCardId === c.id ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                  {c.name}{c.last4 ? ` ••••${c.last4}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={() => {
            const paid = parseFloat(buyAmount)
            if (!paid || !buyItem) return
            handleBuyItem(buyItem.id, paid, buyDate || localToday(), buyCardId)
            setBuyItem(null)
            setBuyAmount('')
          }}
          disabled={!parseFloat(buyAmount)}
          className={cn('w-full py-4 rounded-[14px] text-[15px] font-semibold transition-all select-none', parseFloat(buyAmount) ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-faint')}
        >
          Add to Expenses
        </button>
      </div>
    </div>
  </>
  )
}
