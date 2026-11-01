'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Card } from '@/types'
import { $fd, $fk, fmtDate } from '@/lib/utils'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Segmented } from '@/components/ui/Form'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { LoadBars } from '@/components/ui/LoadBars'
import { CardVisual } from './CardVisual'

export interface CardExpense { id: string; name: string; cost: number; date: string; categories: { name: string } | null }
export interface CardSub {
  id: string; name: string; cost: number; billing: string; monthly_cost: number
  annual_cost: number; next_renewal: string | null; category: string | null
}

type Range = 'Month' | 'Year' | 'All'
const RANGES: Range[] = ['Month', 'Year', 'All']
const RANGE_LABEL: Record<Range, string> = { Month: 'This mo', Year: 'This yr', All: 'All' }
const SPENT_LABEL: Record<Range, string> = { Month: 'this month', Year: 'this year', All: 'all time' }
const PAGE = 40

interface Props {
  card:     Card | null
  open:     boolean
  onClose:  () => void
  onEdit:   () => void
  expenses: CardExpense[]
  subs:     CardSub[]
  loading:  boolean
  stats?:   { expenses: number; subs: number }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Tap a card on In → Accounts: what's been spent on it, its subscriptions and expenses. */
export function CardDetailSheet({ card, open, onClose, onEdit, expenses, subs, loading, stats }: Props) {
  const [range, setRange] = useState<Range>('Month')
  const [shown, setShown] = useState(PAGE)
  useEffect(() => { if (open) { setRange('Month'); setShown(PAGE) } }, [open, card?.id])

  const now = new Date()
  const from = range === 'Month' ? `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
             : range === 'Year'  ? `${now.getFullYear()}-01-01` : ''
  const subNames = useMemo(() => new Set(subs.map(s => s.name.toLowerCase())), [subs])
  const inRange = useMemo(() => expenses.filter(e => !from || e.date >= from), [expenses, from])
  const spent = inRange.reduce((s, e) => s + Number(e.cost), 0)
  const subSpent = inRange.filter(e => subNames.has(e.name.toLowerCase())).reduce((s, e) => s + Number(e.cost), 0)
  const perMonth = subs.reduce((s, x) => s + x.monthly_cost, 0)

  // The list follows the range too, grouped by month
  const groups = useMemo(() => {
    const out: { key: string; label: string; total: number; rows: CardExpense[] }[] = []
    for (const e of inRange.slice(0, shown)) {
      const key = e.date.slice(0, 7)
      let g = out[out.length - 1]
      if (!g || g.key !== key) {
        const [y, m] = key.split('-').map(Number)
        g = { key, label: new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), total: 0, rows: [] }
        out.push(g)
      }
      g.rows.push(e); g.total += Number(e.cost)
    }
    return out
  }, [inRange, shown])

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={card?.name ?? 'Card'}
      cancelLabel="Close"
      actionPlacement="nav"
      action={{ label: 'Edit', onClick: onEdit }}
    >
      {card && (
        <div className="px-4 pt-3">
          <CardVisual card={card} expenseCount={stats?.expenses ?? 0} subCount={stats?.subs ?? 0} />
        </div>
      )}

      {/* Spent, for the range picked */}
      <div className="flex flex-col items-center pt-5 pb-1">
        <p className="text-[12.5px] uppercase tracking-[0.03em] text-ink-muted">Spent {SPENT_LABEL[range]}</p>
        <p className="text-[40px] font-semibold tracking-[-0.03em] tabular-nums text-ink leading-tight">{$fd(spent)}</p>
        <p className="text-[13px] text-ink-muted">
          {inRange.length} {inRange.length === 1 ? 'purchase' : 'purchases'}{subSpent > 0 ? ` · ${$fk(subSpent)} subscriptions` : ''}
        </p>
      </div>
      <FormGroup plain>
        <Segmented options={RANGES} value={range} onChange={r => { setRange(r); setShown(PAGE) }} labels={RANGE_LABEL} />
      </FormGroup>

      {loading ? (
        <div className="flex justify-center py-10"><LoadBars /></div>
      ) : (
        <>
          {subs.length > 0 && (
            <FormGroup header={`Subscriptions · ${$fk(perMonth)}/mo`}>
              {subs.map(s => (
                <FormRow key={s.id} label={
                  <span className="flex flex-col min-w-0">
                    <span className="truncate">{s.name}</span>
                    <span className="text-[13px] text-ink-muted">{s.billing}{s.next_renewal ? ` · renews ${fmtDate(s.next_renewal)}` : ''}</span>
                  </span>
                }>
                  <span className="tabular-nums text-ink">{$fd(s.cost)}</span>
                </FormRow>
              ))}
            </FormGroup>
          )}

          {groups.length === 0 ? (
            <p className="py-10 text-center text-[14px] text-ink-muted">
              No purchases on this card {range === 'Month' ? 'this month' : range === 'Year' ? 'this year' : 'yet'}.
            </p>
          ) : groups.map(g => (
            <FormGroup key={g.key} header={
              <span className="flex justify-between"><span>{g.label}</span><span className="tabular-nums">{$fd(g.total)}</span></span>
            }>
              {g.rows.map(e => {
                const isSub = subNames.has(e.name.toLowerCase())
                return (
                  <FormRow key={e.id} label={
                    <span className="flex items-center gap-3 min-w-0">
                      <CategoryIcon category={e.categories?.name ?? 'Other'} type="Expense" isSub={isSub} size={16}
                        className={isSub ? 'text-[var(--sem-sub)]' : 'text-gold'} />
                      <span className="flex flex-col min-w-0">
                        <span className="truncate">{e.name}</span>
                        <span className="text-[13px] text-ink-muted">{fmtDate(e.date)}</span>
                      </span>
                    </span>
                  }>
                    <span className="tabular-nums text-ink">−{$fd(Number(e.cost))}</span>
                  </FormRow>
                )
              })}
            </FormGroup>
          ))}

          {inRange.length > shown && (
            <button type="button" onClick={() => setShown(s => s + PAGE)}
              className="block mx-auto mt-4 h-[36px] px-5 rounded-full text-[14px] text-ink"
              style={{ background: 'rgb(var(--rgb-ink) / 0.08)' }}>
              Show more · {inRange.length - shown} left
            </button>
          )}
        </>
      )}
    </Sheet>
  )
}
