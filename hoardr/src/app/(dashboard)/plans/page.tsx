'use client'

import { useState, useMemo, useCallback, useEffect, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PillGroup } from '@/components/ui/Pill'
import { AddSubscriptionSheet, type NewSub } from '@/components/plans/AddSubscriptionSheet'
import { AddWishlistSheet, type NewWishItem } from '@/components/plans/AddWishlistSheet'
import { EditSubscriptionSheet, type SubEdits } from '@/components/plans/EditSubscriptionSheet'
import { EditWishlistSheet, type WishEdits } from '@/components/plans/EditWishlistSheet'
import { daysUntilLabel, $fc, $fk, cn, calcSubCosts, localToday, nextRenewalDate } from '@/lib/utils'
import { SlotNumber } from '@/components/ui/SlotNumber'
import { createCalEvent, updateCalEvent, deleteCalEvent, allDayEvent } from '@/lib/calendar'
import { pageCache } from '@/lib/page-cache'
import { RefreshCw, CreditCard } from 'lucide-react'
import { PullIndicator } from '@/components/ui/PullIndicator'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import type { CardOption } from '@/components/money/AddTransactionSheet'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import type { BillingCycle } from '@/types'

type Tab = 'Subscriptions' | 'Wishlist'

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
  bought_cost:   number | null
  status:        string
}

function billingShort(billing: BillingCycle) {
  switch (billing) {
    case 'Annual':    return '/ yr'
    case 'Weekly':    return '/ wk'
    case 'BiWeekly':  return '/ 2wk'
    case 'Quarterly': return '/ qtr'
    default:          return '/ mo'
  }
}

export default function PlansPage() {
  return (
    <Suspense fallback={null}>
      <PlansPageInner />
    </Suspense>
  )
}

function PlansPageInner() {
  const searchParams = useSearchParams()
  const initialTab   = (searchParams.get('tab') as Tab | null) ?? 'Subscriptions'
  const [tab,           setTab]          = useState<Tab>(initialTab)
  type PlansCache = { subs: Sub[]; wishlist: WishItem[] }
  const cached = pageCache.get<PlansCache>('plans')
  const [subs,          setSubs]         = useState<Sub[]>(cached?.subs ?? [])
  const [wishlist,      setWishlist]     = useState<WishItem[]>(cached?.wishlist ?? [])
  const [loading,       setLoading]      = useState(!cached)
  const [subSheet,      setSubSheet]     = useState(false)
  const [wishSheet,     setWishSheet]    = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [editSub,       setEditSub]      = useState<Sub | null>(null)
  const [editWish,      setEditWish]     = useState<WishItem | null>(null)
  const [buyItem,       setBuyItem]      = useState<WishItem | null>(null)
  const [buyAmount,     setBuyAmount]    = useState('')
  const [cards,         setCards]        = useState<CardOption[]>([])
  const [defaultCardId, setDefaultCardId] = useState<string | null>(null)

  const supabase = useMemo(() => createClient(), [])
  const loadGen  = useRef(0)

  const loadData = useCallback(async () => {
    const gen = ++loadGen.current
    const [{ data: subsData }, { data: wishData }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('id, name, cost, billing, status, next_renewal, monthly_cost, annual_cost, card_id, category, cal_event_id')
        .order('next_renewal', { ascending: true }),
      supabase
        .from('wishlist')
        .select('id, name, original_cost, category, url, bought_cost, status')
        .eq('status', 'Interested')
        .order('created_at', { ascending: false }),
    ])

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
      bought_cost:   w.bought_cost != null ? Number(w.bought_cost) : null,
      status:        String(w.status),
    }))
    if (gen !== loadGen.current) return
    setSubs(newSubs)
    setWishlist(newWish)
    pageCache.set('plans', { subs: newSubs, wishlist: newWish })
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++ } }, [loadData])

  const { distance: pullDist, refreshing: pullRefreshing, threshold: pullThreshold } =
    usePullToRefresh(loadData)

  useEffect(() => {
    async function loadCards() {
      const { data } = await supabase.from('cards').select('id, name, last4, is_default').order('is_default', { ascending: false }).order('created_at', { ascending: false })
      const cList = data ?? []
      setDefaultCardId((cList as { is_default: boolean; id: string }[]).find(x => x.is_default)?.id ?? null)
      setCards(cList.map(c => ({ id: String(c.id), name: String(c.name), last4: c.last4 ? String(c.last4) : null })))
    }
    loadCards()
  }, [supabase])

  async function handleBuyItem(id: string, paidCost: number) {
    const item = wishlist.find(w => w.id === id)
    if (!item) return

    setWishlist(prev => prev.map(w => w.id === id ? { ...w, status: 'Purchased', bought_cost: paidCost } : w))

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }

    const categoryName = item.category ?? 'Shopping'
    const { data: existing } = await supabase
      .from('categories').select('id').eq('user_id', user.id).eq('name', categoryName).maybeSingle()

    let categoryId: string | null = existing?.id ?? null
    if (!categoryId) {
      const { data: created } = await supabase
        .from('categories').insert({ user_id: user.id, name: categoryName }).select('id').single()
      categoryId = created?.id ?? null
    }

    const today = new Date().toISOString().slice(0, 10)
    const { data: expRow, error: expErr } = await supabase
      .from('expenses')
      .insert({ user_id: user.id, name: item.name, cost: paidCost, date: today, category_id: categoryId, status: 'Procured' })
      .select('id')
      .single()
    if (expErr) console.error('wishlist buy expense error:', JSON.stringify(expErr))

    const { error } = await supabase
      .from('wishlist')
      .update({ status: 'Purchased', bought_cost: paidCost, ...(expRow?.id ? { expense_id: expRow.id } : {}) })
      .eq('id', id)
    if (error) { console.error('buy item error:', JSON.stringify(error)); await loadData() }
  }

  async function handlePaySub(id: string) {
    const sub = subs.find(s => s.id === id)
    if (!sub) return

    const today = localToday()
    const newRenewal = nextRenewalDate(sub.next_renewal ?? today, sub.billing)
    setSubs(prev => prev.map(s => s.id === id ? { ...s, next_renewal: newRenewal } : s))

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }

    // Find or create category for the subscription
    const categoryName = sub.category ?? 'Subscriptions'
    const { data: existingCat } = await supabase
      .from('categories').select('id').eq('user_id', user.id).eq('name', categoryName).maybeSingle()
    let categoryId: string | null = existingCat?.id ?? null
    if (!categoryId) {
      const { data: created } = await supabase
        .from('categories').insert({ user_id: user.id, name: categoryName }).select('id').single()
      categoryId = created?.id ?? null
    }

    await supabase.from('expenses').insert({
      user_id:     user.id,
      name:        sub.name,
      cost:        sub.cost,
      date:        today,
      category_id: categoryId,
      card_id:     sub.card_id,
    })

    const { error } = await supabase
      .from('subscriptions')
      .update({ next_renewal: newRenewal })
      .eq('id', id)
    if (error) { console.error('pay sub error:', JSON.stringify(error)); await loadData() }
  }

  async function handleCancelSub(id: string) {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status: 'Cancelled' } : s))
    const { error } = await supabase.from('subscriptions').update({ status: 'Cancelled' }).eq('id', id)
    if (error) { console.error('cancel sub error:', JSON.stringify(error)); await loadData() }
  }

  async function handleRestoreSub(id: string) {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, status: 'Active' } : s))
    const { error } = await supabase.from('subscriptions').update({ status: 'Active' }).eq('id', id)
    if (error) { console.error('restore sub error:', JSON.stringify(error)); await loadData() }
  }

  async function handleDeleteSub(id: string) {
    const sub = subs.find(s => s.id === id)
    if (sub?.cal_event_id) await deleteCalEvent(sub.cal_event_id)
    setSubs(prev => prev.filter(s => s.id !== id))
    const { error } = await supabase.from('subscriptions').delete().eq('id', id)
    if (error) { console.error('delete sub error:', JSON.stringify(error)); await loadData() }
  }

  async function handleDeleteWish(id: string) {
    setWishlist(prev => prev.filter(w => w.id !== id))
    const { error } = await supabase.from('wishlist').delete().eq('id', id)
    if (error) { console.error('delete wish error:', JSON.stringify(error)); await loadData() }
  }

  async function handleAddSub(sub: NewSub) {
    const { monthly, annual } = calcSubCosts(sub.cost, sub.billing)
    const tempId = `temp-${Date.now()}`

    // Optimistic update
    setSubs(prev => [...prev, {
      id: tempId, name: sub.name, billing: sub.billing,
      cost: sub.cost, monthly_cost: monthly, annual_cost: annual,
      next_renewal: sub.next_renewal, status: 'Active', card_id: sub.card_id,
      category: sub.category ?? null, cal_event_id: null,
    }])

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }

    const { data: inserted } = await supabase.from('subscriptions').insert({
      user_id:      user.id,
      name:         sub.name,
      cost:         sub.cost,
      billing:      sub.billing,
      next_renewal: sub.next_renewal,
      status:       'Active',
      payments:     0,
      monthly_cost: monthly,
      annual_cost:  annual,
      card_id:      sub.card_id,
      category:     sub.category ?? null,
    }).select('id').single()

    if (sub.next_renewal && inserted?.id) {
      const googleEventId = await createCalEvent(allDayEvent(
        `🔄 ${sub.name}`,
        sub.next_renewal,
        `${sub.billing} · $${sub.cost}`,
      ))
      if (googleEventId) {
        await supabase.from('subscriptions').update({ cal_event_id: googleEventId }).eq('id', inserted.id)
      }
    }

    await loadData()
  }

  async function handleAddWish(item: NewWishItem) {
    const tempId = `temp-${Date.now()}`

    // Optimistic update
    setWishlist(prev => [{
      id: tempId, name: item.name,
      original_cost: item.original_cost,
      category: item.category, url: item.url,
      bought_cost: null, status: 'Interested',
    }, ...prev])

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }

    await supabase.from('wishlist').insert({
      user_id:       user.id,
      name:          item.name,
      original_cost: item.original_cost,
      category:      item.category,
      url:           item.url,
      status:        'Interested',
    })

    await loadData()
  }

  async function handleEditSub(id: string, edits: SubEdits) {
    setSubs(prev => prev.map(s => s.id === id ? { ...s, ...edits } : s))
    const { error } = await supabase
      .from('subscriptions')
      .update({
        name:         edits.name,
        cost:         edits.cost,
        billing:      edits.billing,
        next_renewal: edits.next_renewal,
        monthly_cost: edits.monthly_cost,
        annual_cost:  edits.annual_cost,
        card_id:      edits.card_id,
        category:     edits.category ?? null,
      })
      .eq('id', id)
    if (error) { console.error('edit sub error:', JSON.stringify(error)); await loadData(); return }

    if (edits.next_renewal) {
      const existing = subs.find(s => s.id === id)
      const gcalEv   = allDayEvent(`🔄 ${edits.name}`, edits.next_renewal, `${edits.billing} · $${edits.cost}`)
      if (existing?.cal_event_id) {
        await updateCalEvent(existing.cal_event_id, gcalEv)
      } else {
        const googleEventId = await createCalEvent(gcalEv)
        if (googleEventId) {
          await supabase.from('subscriptions').update({ cal_event_id: googleEventId }).eq('id', id)
        }
      }
    }
  }

  async function handleEditWish(id: string, edits: WishEdits) {
    setWishlist(prev => prev.map(w => w.id === id ? { ...w, ...edits } : w))
    const { error } = await supabase
      .from('wishlist')
      .update({ name: edits.name, original_cost: edits.original_cost, category: edits.category, url: edits.url })
      .eq('id', id)
    if (error) { console.error('edit wish error:', JSON.stringify(error)); await loadData() }
  }

  const activeSubs    = useMemo(() => subs.filter(s => s.status === 'Active'),    [subs])
  const cancelledSubs = useMemo(() => subs.filter(s => s.status === 'Cancelled'), [subs])

  const totals = useMemo(() => ({
    monthly: activeSubs.reduce((s, sub) => s + sub.monthly_cost, 0),
    annual:  activeSubs.reduce((s, sub) => s + sub.annual_cost,  0),
  }), [activeSubs])

  return (
  <>
    <div className="min-h-screen bg-bg-base tab-enter">

      <PullIndicator distance={pullDist} threshold={pullThreshold} refreshing={pullRefreshing} />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-5 pt-14 pb-0 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">
            Plans
          </p>
          <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Plans</h1>
        </div>
        <button
          onClick={() => tab === 'Subscriptions' ? setSubSheet(true) : setWishSheet(true)}
          className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-white text-[22px] font-light mt-10 select-none"
          aria-label="Add"
        >
          +
        </button>
      </div>

      {/* ── Stat tiles ───────────────────────────────────────────────────── */}
      {!loading && (
        <div className="mx-4 mt-5 flex gap-3">
          <div className="flex-1 bg-bg-surface border border-white/[0.06] rounded-[22px] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-ink-muted">Per Month</p>
              <span className="text-[13px] text-gold">↻</span>
            </div>
            <p className="text-[26px] font-bold font-mono tracking-tight text-ink"><SlotNumber value={totals.monthly} format={$fk} /></p>
          </div>
          <div className="flex-1 bg-bg-surface border border-white/[0.06] rounded-[22px] p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-ink-muted">Per Year</p>
              <span className="text-[13px] text-emerald">∞</span>
            </div>
            <p className="text-[26px] font-bold font-mono tracking-tight text-ink"><SlotNumber value={totals.annual} format={$fk} /></p>
          </div>
        </div>
      )}

      {/* ── Tab toggle ───────────────────────────────────────────────────── */}
      <div className="mx-4 mt-4">
        <PillGroup
          options={['Subscriptions', 'Wishlist'] as Tab[]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="mx-4 mt-4 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-[62px] rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Subscriptions ────────────────────────────────────────────────── */}
      {!loading && tab === 'Subscriptions' && (
        <>
          {activeSubs.length === 0 ? (
            <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card py-12 text-center text-ink-faint text-[13px]">
              No active subscriptions — tap + to add one.
            </div>
          ) : (
            <div className="mx-4 mt-4">
              <div className="space-y-2.5">
                {activeSubs.map(sub => {
                  const renewal   = sub.next_renewal ? daysUntilLabel(sub.next_renewal) : '—'
                  const isOverdue = typeof renewal === 'string' && renewal.includes('ago')
                  return (
                    <SwipeToDelete
                      key={sub.id}
                      onDelete={() => handleCancelSub(sub.id)}
                      actionLabel="Cancel" actionBg="bg-amber-600"
                      onTap={() => setEditSub(sub)}
                      className="rounded-[18px]"
                      onRight={() => handlePaySub(sub.id)}
                      rightLabel={<CreditCard size={18} strokeWidth={1.5} className="text-white" />}
                    >
                      <div className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface border border-white/[0.06] rounded-[18px]">
                        <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                          {sub.category
                            ? <CategoryIcon category={sub.category} type="Expense" size={15} className="text-gold" />
                            : <RefreshCw size={15} className="text-gold" strokeWidth={1.75} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-ink">{sub.name}</p>
                          <p className={cn('text-[11px]', isOverdue ? 'text-ruby' : 'text-ink-muted')}>
                            {renewal}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[15px] font-semibold font-mono text-ink">
                            {$fc(sub.cost)}
                          </p>
                          <p className="text-[10px] text-ink-faint">
                            {billingShort(sub.billing)}
                          </p>
                        </div>
                      </div>
                    </SwipeToDelete>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Cancelled subs ───────────────────────────────────────────── */}
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
                <div className="space-y-2.5 opacity-60">
                  {cancelledSubs.map(sub => (
                    <SwipeToDelete key={sub.id} onDelete={() => handleDeleteSub(sub.id)} className="rounded-[18px]">
                      <div className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface border border-white/[0.06] rounded-[18px]">
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
        <div className="mx-4 mt-4 space-y-2.5">
          {wishlist.length === 0 && (
            <div className="bg-bg-surface border border-white/[0.06] rounded-[18px] py-12 text-center text-ink-faint text-[13px]">
              Nothing on your wishlist — tap + to add an item.
            </div>
          )}
          {wishlist.map(item => (
            <SwipeToDelete
              key={item.id}
              onDelete={() => handleDeleteWish(item.id)}
              className="rounded-[18px]"
              onTap={() => setEditWish(item)}
              onRight={item.status === 'Interested' ? () => { setBuyItem(item); setBuyAmount('') } : undefined}
              rightLabel={<CreditCard size={18} strokeWidth={1.5} className="text-white" />}
            >
              <div className="bg-bg-surface border border-white/[0.06] rounded-[18px] p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <CategoryIcon category={item.category ?? 'Other'} type="Expense" size={15} className="text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-ink truncate">{item.name}</p>
                    {item.original_cost != null && (
                      <p className="text-[13px] font-mono text-ink-muted mt-0.5">{$fc(item.original_cost)}</p>
                    )}
                    {(item.category || item.url) && (
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {item.category && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-bg-overlay text-ink-muted">
                            {item.category}
                          </span>
                        )}
                        {item.url && (
                          <a
                            href={item.url} target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-[10px] font-semibold text-gold select-none"
                          >
                            View →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  {item.status !== 'Interested' && (
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald/10 text-emerald">Bought</span>
                      {item.bought_cost != null && item.original_cost != null && item.original_cost > item.bought_cost && (
                        <span className="text-[10px] font-semibold text-emerald font-mono">saved {$fc(item.original_cost - item.bought_cost)}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </SwipeToDelete>
          ))}
        </div>
      )}

      <div className="h-10" />
    </div>

    {/* ── Sheets — outside tab-enter div so fixed positioning works ────── */}
    {tab === 'Subscriptions' && (
      <AddSubscriptionSheet
        open={subSheet}
        onClose={() => setSubSheet(false)}
        onAdd={handleAddSub}
        cards={cards}
        defaultCardId={defaultCardId}
      />
    )}
    {tab === 'Wishlist' && (
      <AddWishlistSheet
        open={wishSheet}
        onClose={() => setWishSheet(false)}
        onAdd={handleAddWish}
      />
    )}
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

    {/* ── Buy sheet ──────────────────────────────────────────────────────── */}
    <div
      onClick={() => setBuyItem(null)}
      className={cn(
        'fixed inset-0 z-[59] transition-opacity duration-300',
        buyItem ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
      )}
      style={{ background: 'rgba(0,0,0,0.72)' }}
    />
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300',
        buyItem ? 'translate-y-0' : 'translate-y-full',
      )}
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
            <p className="text-[13px] font-mono text-ink-muted">{$fc(buyItem.original_cost)}</p>
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
            <p className="text-[11px] text-emerald font-mono mt-2">
              You saved {$fc(buyItem.original_cost - parseFloat(buyAmount))}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            const paid = parseFloat(buyAmount)
            if (!paid || !buyItem) return
            handleBuyItem(buyItem.id, paid)
            setBuyItem(null)
            setBuyAmount('')
          }}
          disabled={!parseFloat(buyAmount)}
          className={cn(
            'w-full py-4 rounded-[14px] text-[15px] font-semibold transition-all select-none',
            parseFloat(buyAmount) ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-faint',
          )}
        >
          Add to Expenses
        </button>
      </div>
    </div>
  </>
  )
}

