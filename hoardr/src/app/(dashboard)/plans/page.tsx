'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PillGroup } from '@/components/ui/Pill'
import { AddSubscriptionSheet, type NewSub } from '@/components/plans/AddSubscriptionSheet'
import { AddWishlistSheet, type NewWishItem } from '@/components/plans/AddWishlistSheet'
import { EditSubscriptionSheet, type SubEdits } from '@/components/plans/EditSubscriptionSheet'
import { EditWishlistSheet, type WishEdits } from '@/components/plans/EditWishlistSheet'
import { daysUntilLabel, $fc, $fk, cn, calcSubCosts } from '@/lib/utils'
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
}

interface WishItem {
  id:            string
  name:          string
  original_cost: number | null
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
  const [tab,           setTab]          = useState<Tab>('Subscriptions')
  const [subs,          setSubs]         = useState<Sub[]>([])
  const [wishlist,      setWishlist]     = useState<WishItem[]>([])
  const [loading,       setLoading]      = useState(true)
  const [subSheet,      setSubSheet]     = useState(false)
  const [wishSheet,     setWishSheet]    = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [editSub,       setEditSub]      = useState<Sub | null>(null)
  const [editWish,      setEditWish]     = useState<WishItem | null>(null)

  const supabase = useMemo(() => createClient(), [])

  const loadData = useCallback(async () => {
    const [{ data: subsData }, { data: wishData }] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('id, name, cost, billing, status, next_renewal, monthly_cost, annual_cost')
        .order('next_renewal', { ascending: true }),
      supabase
        .from('wishlist')
        .select('id, name, original_cost, status')
        .order('created_at', { ascending: false }),
    ])

    setSubs((subsData ?? []).map(s => ({
      id:           String(s.id),
      name:         String(s.name),
      billing:      s.billing as BillingCycle,
      cost:         Number(s.cost),
      monthly_cost: Number(s.monthly_cost ?? 0),
      annual_cost:  Number(s.annual_cost  ?? 0),
      next_renewal: s.next_renewal ? String(s.next_renewal) : null,
      status:       String(s.status),
    })))

    setWishlist((wishData ?? []).map(w => ({
      id:            String(w.id),
      name:          String(w.name),
      original_cost: w.original_cost != null ? Number(w.original_cost) : null,
      status:        String(w.status),
    })))

    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  async function handleMarkPurchased(id: string) {
    const item = wishlist.find(w => w.id === id)
    setWishlist(prev => prev.map(w => w.id === id ? { ...w, status: 'Purchased' } : w))

    const { data: { user } } = await supabase.auth.getUser()

    let expenseId: string | null = null

    // Auto-log as expense if the item has a price
    if (user && item && item.original_cost != null && item.original_cost > 0) {
      // Resolve or create a 'Shopping' category
      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', 'Shopping')
        .maybeSingle()

      let categoryId: string | null = existing?.id ?? null
      if (!categoryId) {
        const { data: created } = await supabase
          .from('categories')
          .insert({ user_id: user.id, name: 'Shopping' })
          .select('id')
          .single()
        categoryId = created?.id ?? null
      }

      const today = new Date().toISOString().slice(0, 10)
      const { data: expRow, error: expErr } = await supabase
        .from('expenses')
        .insert({
          user_id:     user.id,
          name:        item.name,
          cost:        item.original_cost,
          date:        today,
          category_id: categoryId,
          status:      'Procured',
        })
        .select('id')
        .single()
      if (expErr) console.error('wishlist expense create error:', JSON.stringify(expErr))
      expenseId = expRow?.id ?? null
    }

    const { error } = await supabase
      .from('wishlist')
      .update({ status: 'Purchased', ...(expenseId ? { expense_id: expenseId } : {}) })
      .eq('id', id)
    if (error) { console.error('mark purchased error:', JSON.stringify(error)); await loadData() }
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
      next_renewal: sub.next_renewal, status: 'Active',
    }])

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }

    await supabase.from('subscriptions').insert({
      user_id:      user.id,
      name:         sub.name,
      cost:         sub.cost,
      billing:      sub.billing,
      next_renewal: sub.next_renewal,
      status:       'Active',
      payments:     0,
      monthly_cost: monthly,
      annual_cost:  annual,
    })

    await loadData()
  }

  async function handleAddWish(item: NewWishItem) {
    const tempId = `temp-${Date.now()}`

    // Optimistic update
    setWishlist(prev => [{
      id: tempId, name: item.name,
      original_cost: item.original_cost, status: 'Interested',
    }, ...prev])

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { await loadData(); return }

    await supabase.from('wishlist').insert({
      user_id:       user.id,
      name:          item.name,
      original_cost: item.original_cost,
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
      })
      .eq('id', id)
    if (error) { console.error('edit sub error:', JSON.stringify(error)); await loadData() }
  }

  async function handleEditWish(id: string, edits: WishEdits) {
    setWishlist(prev => prev.map(w => w.id === id ? { ...w, ...edits } : w))
    const { error } = await supabase
      .from('wishlist')
      .update({ name: edits.name, original_cost: edits.original_cost })
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
          className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-white text-[22px] font-light shadow-gold mt-10 select-none"
          aria-label="Add"
        >
          +
        </button>
      </div>

      {/* ── Tab toggle ───────────────────────────────────────────────────── */}
      <div className="mx-4 mt-5">
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
          <div className="grid grid-cols-2 gap-3 mx-4 mt-4">
            <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-medium tracking-[0.06em] uppercase text-ink-muted">Per Month</p>
                <span className="text-ink-faint text-[11px]">⬛</span>
              </div>
              <p className="text-[26px] font-bold font-mono tracking-tight text-ink">
                {$fk(totals.monthly)}
              </p>
            </div>
            <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-medium tracking-[0.06em] uppercase text-ink-muted">Per Year</p>
                <span className="text-ink-faint text-[11px]">∞</span>
              </div>
              <p className="text-[26px] font-bold font-mono tracking-tight text-ink">
                {$fk(totals.annual)}
              </p>
            </div>
          </div>

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
                  return (
                    <SwipeToDelete key={sub.id} onDelete={() => handleCancelSub(sub.id)} actionLabel="Cancel" actionBg="bg-amber-600" onTap={() => setEditSub(sub)}>
                      <div className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface">
                        <div className="w-9 h-9 rounded-[10px] bg-bg-overlay flex items-center justify-center text-[15px] flex-shrink-0">
                          ♻️
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
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04] opacity-60">
                  {cancelledSubs.map(sub => (
                    <SwipeToDelete key={sub.id} onDelete={() => handleDeleteSub(sub.id)}>
                      <div className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface">
                        <div className="w-9 h-9 rounded-[10px] bg-bg-overlay flex items-center justify-center text-[15px] flex-shrink-0">
                          ♻️
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
        <div className="mx-4 mt-4 flex flex-col gap-3">
          {wishlist.length === 0 && (
            <div className="bg-bg-surface border border-white/[0.06] rounded-card py-12 text-center text-ink-faint text-[13px]">
              Nothing on your wishlist — tap + to add an item.
            </div>
          )}
          {wishlist.map(item => (
            <SwipeToDelete key={item.id} onDelete={() => handleDeleteWish(item.id)} className="rounded-card" onTap={() => setEditWish(item)}>
              <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4 flex items-center gap-4">
                <div className="w-11 h-11 rounded-[12px] bg-bg-overlay flex items-center justify-center text-[20px] flex-shrink-0">
                  ✦
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-ink truncate">{item.name}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    {item.original_cost != null ? `Goal: ${$fc(item.original_cost)}` : 'No price set'}
                  </p>
                </div>
                {item.status === 'Interested' ? (
                  <button
                    onClick={() => handleMarkPurchased(item.id)}
                    className="w-9 h-9 rounded-full bg-emerald/10 border border-emerald/20 flex items-center justify-center text-emerald text-[16px] flex-shrink-0 select-none active:scale-95 transition-transform"
                    aria-label="Mark as purchased"
                  >
                    ✓
                  </button>
                ) : (
                  <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full flex-shrink-0 bg-emerald/10 text-emerald">
                    Purchased
                  </span>
                )}
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
    />
    <EditWishlistSheet
      item={editWish}
      open={editWish !== null}
      onClose={() => setEditWish(null)}
      onSave={handleEditWish}
    />
  </>
  )
}
