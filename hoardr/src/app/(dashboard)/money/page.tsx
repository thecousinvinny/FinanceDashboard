'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PillGroup } from '@/components/ui/Pill'
import { AddTransactionSheet, type CardOption, type BankOption } from '@/components/money/AddTransactionSheet'
import { EditTransactionSheet, type TxEdits } from '@/components/money/EditTransactionSheet'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { type SeedTx } from '@/lib/data/transactions'
import { groupByMonth, fmtDate, $fk, $fc, cn } from '@/lib/utils'
import { SlotNumber } from '@/components/ui/SlotNumber'
import { pageCache } from '@/lib/page-cache'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { PullIndicator } from '@/components/ui/PullIndicator'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

type Filter = 'All' | 'Expenses' | 'Income'

export default function MoneyPage() {
  const [filter,    setFilter]    = useState<Filter>('All')
  const cachedTx = pageCache.get<SeedTx[]>('money')
  const [txList,    setTxList]    = useState<SeedTx[]>(cachedTx ?? [])
  const [loading,   setLoading]   = useState(!cachedTx)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editTx,    setEditTx]    = useState<SeedTx | null>(null)
  const [cards,         setCards]         = useState<CardOption[]>([])
  const [banks,         setBanks]         = useState<BankOption[]>([])
  const [defaultCardId, setDefaultCardId] = useState<string | null>(null)
  const [subNames,      setSubNames]      = useState<Set<string>>(new Set())

  const supabase = useMemo(() => createClient(), [])
  const loadGen  = useRef(0)

  const loadData = useCallback(async () => {
    const gen = ++loadGen.current
    const [{ data: expenses }, { data: income }] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, name, cost, date, card_id, categories(name)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('income')
        .select('id, name, amount, date, source, bank_id')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
    ])

    const rows: SeedTx[] = [
      ...(expenses ?? []).map(e => ({
        id:       String(e.id),
        type:     'Expense' as const,
        name:     String(e.name),
        category: (e.categories as unknown as { name: string } | null)?.name ?? 'Other',
        date:     String(e.date),
        amount:   Number(e.cost),
        card_id:  e.card_id ? String(e.card_id) : null,
      })),
      ...(income ?? []).map(i => ({
        id:       String(i.id),
        type:     'Income' as const,
        name:     String(i.name),
        category: String(i.source ?? 'Other'),
        date:     String(i.date),
        amount:   Number(i.amount),
        bank_id:  i.bank_id ? String(i.bank_id) : null,
      })),
    ]

    if (gen !== loadGen.current) return
    setTxList(rows)
    pageCache.set('money', rows)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++ } }, [loadData])

  const { distance: pullDist, refreshing: pullRefreshing, threshold: pullThreshold } =
    usePullToRefresh(loadData)

  // Load wallet data once on mount — cards/banks change only in Wallet tab
  useEffect(() => {
    async function loadWallet() {
      const [{ data: c }, { data: b }, { data: subs }] = await Promise.all([
        supabase.from('cards').select('id, name, last4, is_default').order('is_default', { ascending: false }).order('created_at', { ascending: false }),
        supabase.from('banks').select('id, name').order('created_at', { ascending: false }),
        supabase.from('subscriptions').select('name').eq('status', 'Active'),
      ])
      const cList = c ?? []
      setDefaultCardId((cList as { is_default: boolean; id: string }[]).find(x => x.is_default)?.id ?? null)
      setCards(cList.map(x => ({ id: String(x.id), name: String(x.name), last4: x.last4 ? String(x.last4) : null })))
      setBanks((b ?? []).map(x => ({ id: String(x.id), name: String(x.name) })))
      setSubNames(new Set((subs ?? []).map(s => String(s.name).toLowerCase())))
    }
    loadWallet()
  }, [supabase])

  async function handleDelete(tx: SeedTx) {
    setTxList(prev => prev.filter(t => t.id !== tx.id))
    const table = tx.type === 'Expense' ? 'expenses' : 'income'
    const { error } = await supabase.from(table).delete().eq('id', tx.id)
    if (error) { console.error('delete error:', JSON.stringify(error)); await loadData() }
  }

  async function handleAdd(tx: SeedTx) {
    // Optimistic insert
    setTxList(prev => [tx, ...prev])

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) { console.error('handleAdd: no user', userErr); return }

    if (tx.type === 'Expense') {
      const { data: existing } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', user.id)
        .eq('name', tx.category)
        .maybeSingle()

      let categoryId: string | null = existing?.id ?? null

      if (!categoryId) {
        const { data: created, error: catErr } = await supabase
          .from('categories')
          .insert({ user_id: user.id, name: tx.category })
          .select('id')
          .single()
        if (catErr) console.error('category insert error:', JSON.stringify(catErr))
        categoryId = created?.id ?? null
      }

      const { error: expErr } = await supabase.from('expenses').insert({
        user_id:     user.id,
        name:        tx.name,
        cost:        tx.amount,
        date:        tx.date,
        category_id: categoryId,
        status:      'Procured',
        card_id:     tx.card_id ?? null,
      })
      if (expErr) console.error('expense insert error:', JSON.stringify(expErr))
    } else {
      const { error: incErr } = await supabase.from('income').insert({
        user_id: user.id,
        name:    tx.name,
        amount:  tx.amount,
        date:    tx.date,
        source:  tx.category,
        bank_id: tx.bank_id ?? null,
      })
      if (incErr) console.error('income insert error:', JSON.stringify(incErr))
    }

    await loadData()
  }

  async function handleSave(id: string, updates: TxEdits) {
    const tx = txList.find(t => t.id === id)
    if (!tx) return

    setTxList(prev => prev.map(t => t.id === id
      ? { ...t, name: updates.name, amount: updates.amount, category: updates.category, date: updates.date, card_id: updates.card_id, bank_id: updates.bank_id }
      : t))

    if (tx.type === 'Expense') {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { await loadData(); return }

      const { data: existing } = await supabase
        .from('categories').select('id').eq('user_id', user.id).eq('name', updates.category).maybeSingle()

      let categoryId: string | null = existing?.id ?? null
      if (!categoryId) {
        const { data: created } = await supabase
          .from('categories').insert({ user_id: user.id, name: updates.category }).select('id').single()
        categoryId = created?.id ?? null
      }

      const { error } = await supabase
        .from('expenses')
        .update({ name: updates.name, cost: updates.amount, date: updates.date, category_id: categoryId, card_id: updates.card_id })
        .eq('id', id)
      if (error) { console.error('edit expense error:', JSON.stringify(error)); await loadData() }
    } else {
      const { error } = await supabase
        .from('income')
        .update({ name: updates.name, amount: updates.amount, date: updates.date, source: updates.category, bank_id: updates.bank_id })
        .eq('id', id)
      if (error) { console.error('edit income error:', JSON.stringify(error)); await loadData() }
    }
  }

  const { monthSpent, monthEarned } = useMemo(() => {
    const mo = new Date().toISOString().slice(0, 7)
    return {
      monthSpent:  txList.filter(t => t.type === 'Expense' && t.date.startsWith(mo)).reduce((s, t) => s + t.amount, 0),
      monthEarned: txList.filter(t => t.type === 'Income'  && t.date.startsWith(mo)).reduce((s, t) => s + t.amount, 0),
    }
  }, [txList])

  const catBreakdown = useMemo(() => {
    const mo = new Date().toISOString().slice(0, 7)
    const totals: Record<string, number> = {}
    for (const t of txList) {
      if (t.type !== 'Expense' || !t.date.startsWith(mo)) continue
      totals[t.category] = (totals[t.category] ?? 0) + t.amount
    }
    const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const top = entries[0]?.[1] ?? 1
    return entries.map(([name, total]) => ({ name, total, pct: Math.round((total / top) * 100) }))
  }, [txList])

  // Sort newest-first before any grouping
  const sorted = useMemo(
    () => [...txList].sort((a, b) => b.date.localeCompare(a.date)),
    [txList],
  )

  // Filtered + grouped list
  const filtered = useMemo(
    () => filter === 'All'
      ? sorted
      : sorted.filter(t => t.type === (filter === 'Expenses' ? 'Expense' : 'Income')),
    [sorted, filter],
  )

  const groups = useMemo(
    () => groupByMonth(filtered).map(g => ({
      ...g,
      spent:  g.rows.filter(r => (r as SeedTx).type === 'Expense').reduce((s, r) => s + (r as SeedTx).amount, 0),
      earned: g.rows.filter(r => (r as SeedTx).type === 'Income').reduce((s, r)  => s + (r as SeedTx).amount, 0),
    })),
    [filtered],
  )

  return (
  <>
    <div className="min-h-screen bg-bg-base tab-enter">

      <PullIndicator distance={pullDist} threshold={pullThreshold} refreshing={pullRefreshing} />

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-5 pt-14 pb-0 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">
            Activity
          </p>
          <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Money</h1>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-white text-[22px] font-light mt-10 select-none"
          aria-label="Add transaction"
        >
          +
        </button>
      </div>

      {/* ── Summary tiles ────────────────────────────────────────────────── */}
      <div className="mx-4 mt-5 flex gap-3">
        <div className="flex-1 bg-bg-surface border border-white/[0.06] rounded-[22px] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-ink-muted">Spent</p>
            <span className="text-[12px] text-gold">↑</span>
          </div>
          <p className="text-[26px] font-bold font-mono tracking-tight text-ink"><SlotNumber value={monthSpent} format={$fk} /></p>
        </div>
        <div className="flex-1 bg-bg-surface border border-white/[0.06] rounded-[22px] p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold tracking-[0.1em] uppercase text-ink-muted">Earned</p>
            <span className="text-[12px] text-emerald">↓</span>
          </div>
          <p className="text-[26px] font-bold font-mono tracking-tight text-ink"><SlotNumber value={monthEarned} format={$fk} /></p>
        </div>
      </div>

      {/* ── Category breakdown ───────────────────────────────────────────── */}
      {!loading && filter !== 'Income' && catBreakdown.length > 0 && (
        <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card px-4 py-3">
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">This Month</p>
          <div className="space-y-2.5">
            {catBreakdown.map(cat => (
              <div key={cat.name}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <CategoryIcon category={cat.name} type="Expense" size={12}
                      className={subNames.has(cat.name.toLowerCase()) ? 'text-white/60' : 'text-gold'} />
                    <span className="text-[12px] font-medium text-ink truncate">{cat.name}</span>
                  </div>
                  <span className="text-[12px] font-semibold font-mono text-ink ml-3 flex-shrink-0">{$fc(cat.total)}</span>
                </div>
                <div className="h-[3px] rounded-full bg-bg-overlay overflow-hidden">
                  <div className="h-full rounded-full bg-gold/50 transition-all duration-500" style={{ width: `${cat.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Filter pills ─────────────────────────────────────────────────── */}
      <div className="mx-4 mt-4">
        <PillGroup
          options={['All', 'Expenses', 'Income'] as Filter[]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="mx-4 mt-5 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-[62px] rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Transaction list ─────────────────────────────────────────────── */}
      {!loading && (
        <div className="mx-4 mt-5 space-y-5">
          {groups.length === 0 && (
            <div className="py-12 text-center text-ink-faint text-[13px]">
              No transactions yet — add your first one above.
            </div>
          )}

          {groups.map(group => {
            const net = group.earned - group.spent
            return (
              <div key={group.key}>
                {/* Month header */}
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint">
                    {group.label}
                  </p>
                  {filter === 'All' && (
                    <p className={cn(
                      'text-[11px] font-semibold font-mono',
                      net >= 0 ? 'text-emerald' : 'text-gold',
                    )}>
                      {net >= 0 ? '+' : '−'}{$fk(Math.abs(net))} net
                    </p>
                  )}
                  {filter === 'Expenses' && (
                    <p className="text-[11px] font-semibold font-mono text-gold">
                      −{$fk(group.spent)}
                    </p>
                  )}
                  {filter === 'Income' && (
                    <p className="text-[11px] font-semibold font-mono text-emerald">
                      +{$fk(group.earned)}
                    </p>
                  )}
                </div>

                {/* Rows */}
                <div className="space-y-2.5">
                  {group.rows.map(row => {
                    const tx = row as SeedTx
                    return (
                      <SwipeToDelete key={tx.id} onDelete={() => handleDelete(tx)} onTap={() => setEditTx(tx)} className="rounded-[18px]">
                        <div className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface border border-white/[0.06] rounded-[18px]">
                          <div className="w-10 h-10 rounded-full bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                            <CategoryIcon category={tx.category} type={tx.type} size={15}
                              className={tx.type === 'Income' ? 'text-emerald' : subNames.has(tx.name.toLowerCase()) ? 'text-white/60' : 'text-gold'} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-ink truncate">{tx.name}</p>
                            <p className="text-[11px] text-ink-muted">
                              {tx.category} · {fmtDate(tx.date)}
                            </p>
                          </div>
                          <p className={cn(
                            'text-[15px] font-semibold font-mono flex-shrink-0',
                            tx.type === 'Income' ? 'text-emerald' : 'text-ink',
                          )}>
                            {tx.type === 'Income' ? '+' : '−'}{$fc(tx.amount)}
                          </p>
                        </div>
                      </SwipeToDelete>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="h-10" />
    </div>

    <AddTransactionSheet
      open={sheetOpen}
      onClose={() => setSheetOpen(false)}
      onAdd={handleAdd}
      cards={cards}
      banks={banks}
      defaultCardId={defaultCardId}
    />
    <EditTransactionSheet
      tx={editTx}
      open={editTx !== null}
      onClose={() => setEditTx(null)}
      onSave={handleSave}
      cards={cards}
      banks={banks}
    />
  </>
  )
}
