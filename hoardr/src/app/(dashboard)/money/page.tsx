'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PillGroup } from '@/components/ui/Pill'
import { AddTransactionSheet } from '@/components/money/AddTransactionSheet'
import { getCategoryEmoji, type SeedTx } from '@/lib/data/transactions'
import { groupByMonth, fmtDate, $fk, $fc, cn } from '@/lib/utils'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'

type Filter = 'All' | 'Expenses' | 'Income'

export default function MoneyPage() {
  const [filter,    setFilter]    = useState<Filter>('All')
  const [txList,    setTxList]    = useState<SeedTx[]>([])
  const [loading,   setLoading]   = useState(true)
  const [sheetOpen, setSheetOpen] = useState(false)

  const supabase = useMemo(() => createClient(), [])

  const loadData = useCallback(async () => {
    const [{ data: expenses }, { data: income }] = await Promise.all([
      supabase
        .from('expenses')
        .select('id, name, cost, date, categories(name)')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('income')
        .select('id, name, amount, date, source')
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
      })),
      ...(income ?? []).map(i => ({
        id:       String(i.id),
        type:     'Income' as const,
        name:     String(i.name),
        category: String(i.source ?? 'Other'),
        date:     String(i.date),
        amount:   Number(i.amount),
      })),
    ]

    setTxList(rows)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

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
      })
      if (expErr) console.error('expense insert error:', JSON.stringify(expErr))
    } else {
      const { error: incErr } = await supabase.from('income').insert({
        user_id: user.id,
        name:    tx.name,
        amount:  tx.amount,
        date:    tx.date,
        source:  tx.category,
      })
      if (incErr) console.error('income insert error:', JSON.stringify(incErr))
    }

    await loadData()
  }

  // Sort newest-first before any grouping
  const sorted = useMemo(
    () => [...txList].sort((a, b) => b.date.localeCompare(a.date)),
    [txList],
  )

  // Stat cards: current month (most recent in data)
  const currentMonthKey = sorted[0]?.date.slice(0, 7) ?? ''

  const monthSpent = useMemo(
    () => sorted
      .filter(t => t.type === 'Expense' && t.date.startsWith(currentMonthKey))
      .reduce((s, t) => s + t.amount, 0),
    [sorted, currentMonthKey],
  )

  const monthEarned = useMemo(
    () => sorted
      .filter(t => t.type === 'Income' && t.date.startsWith(currentMonthKey))
      .reduce((s, t) => s + t.amount, 0),
    [sorted, currentMonthKey],
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
          className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-white text-[22px] font-light shadow-gold mt-10 select-none"
          aria-label="Add transaction"
        >
          +
        </button>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mx-4 mt-5">
        <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium tracking-[0.06em] uppercase text-ink-muted">Spent</p>
            <span className="text-ruby text-lg">↗</span>
          </div>
          <p className="text-[26px] font-bold font-mono tracking-tight text-ruby">
            {$fk(monthSpent)}
          </p>
        </div>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-medium tracking-[0.06em] uppercase text-ink-muted">Earned</p>
            <span className="text-emerald text-lg">↙</span>
          </div>
          <p className="text-[26px] font-bold font-mono tracking-tight text-emerald">
            {$fk(monthEarned)}
          </p>
        </div>
      </div>

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
                      net >= 0 ? 'text-emerald' : 'text-ruby',
                    )}>
                      {net >= 0 ? '+' : '−'}{$fk(Math.abs(net))} net
                    </p>
                  )}
                  {filter === 'Expenses' && (
                    <p className="text-[11px] font-semibold font-mono text-ruby">
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
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                  {group.rows.map(row => {
                    const tx = row as SeedTx
                    const emoji = getCategoryEmoji(tx.category, tx.type)
                    return (
                      <SwipeToDelete key={tx.id} onDelete={() => handleDelete(tx)}>
                        <div className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface">
                          <div className="w-9 h-9 rounded-[10px] bg-bg-overlay flex items-center justify-center text-[15px] flex-shrink-0">
                            {emoji}
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
    />
  </>
  )
}
