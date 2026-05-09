'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { NEXT_STATUS, STATUS_LABEL, STATUS_COLORS, STATUS_PROGRESS } from '@/lib/data/studio'
import { fmtDate, daysUntilLabel, $fc, cn } from '@/lib/utils'
import type { CommissionStatus } from '@/types'
import { AddCommissionSheet, type NewCommission } from '@/components/studio/AddCommissionSheet'

type Filter = 'All' | 'Pending' | 'Approved' | 'In Progress'

const FILTERS: Filter[] = ['All', 'Pending', 'Approved', 'In Progress']

interface Commission {
  id:           string
  client_name:  string
  project_name: string
  project_type: string | null
  value:        number
  deposit:      number | null
  deadline:     string | null
  status:       CommissionStatus
  notes:        string | null
  paid_at:      string | null
  income_id:    string | null
}

export default function StudioPage() {
  const [filter,      setFilter]      = useState<Filter>('All')
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading,     setLoading]     = useState(true)
  const [sheetOpen,   setSheetOpen]   = useState(false)

  const supabase = useMemo(() => createClient(), [])

  const loadData = useCallback(async () => {
    const { data } = await supabase
      .from('commissions')
      .select('id, client_name, project_name, project_type, value, deposit, deadline, status, notes, paid_at, income_id')
      .order('created_at', { ascending: false })

    setCommissions((data ?? []).map(c => ({
      id:           String(c.id),
      client_name:  String(c.client_name),
      project_name: String(c.project_name),
      project_type: c.project_type ? String(c.project_type) : null,
      value:        Number(c.value),
      deposit:      c.deposit != null ? Number(c.deposit) : null,
      deadline:     c.deadline     ? String(c.deadline)     : null,
      status:       c.status as CommissionStatus,
      notes:        c.notes    ? String(c.notes)    : null,
      paid_at:      c.paid_at  ? String(c.paid_at)  : null,
      income_id:    c.income_id ? String(c.income_id) : null,
    })))

    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  async function handleAdd(newC: NewCommission) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const optimistic: Commission = {
      id: `tmp-${Date.now()}`, client_name: newC.client_name,
      project_name: newC.project_name, project_type: newC.project_type,
      value: newC.value, deposit: newC.deposit, deadline: newC.deadline,
      status: 'Pending', notes: newC.notes, paid_at: null, income_id: null,
    }
    setCommissions(prev => [optimistic, ...prev])

    const { error } = await supabase.from('commissions').insert({
      user_id:      user.id,
      client_name:  newC.client_name,
      project_name: newC.project_name,
      project_type: newC.project_type,
      value:        newC.value,
      deposit:      newC.deposit,
      deadline:     newC.deadline,
      notes:        newC.notes,
      status:       'Pending',
    })
    if (error) console.error('commission insert error:', JSON.stringify(error))
    await loadData()
  }

  async function advance(commission: Commission) {
    const next = NEXT_STATUS[commission.status]
    if (!next) return

    // Optimistic update
    setCommissions(prev => prev.map(c =>
      c.id === commission.id ? { ...c, status: next } : c,
    ))

    if (next === 'Paid') {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: incomeRow } = await supabase
          .from('income')
          .insert({
            user_id:       user.id,
            name:          `${commission.client_name} — ${commission.project_name}`,
            amount:        commission.value,
            date:          new Date().toISOString().slice(0, 10),
            source:        'Freelance',
            commission_id: commission.id,
          })
          .select('id')
          .single()

        await supabase.from('commissions').update({
          status:    'Paid',
          paid_at:   new Date().toISOString(),
          income_id: incomeRow?.id ?? null,
        }).eq('id', commission.id)
      }
    } else {
      await supabase.from('commissions').update({ status: next }).eq('id', commission.id)
    }

    await loadData()
  }

  const visible = useMemo(
    () => filter === 'All'
      ? commissions
      : commissions.filter(c => c.status === filter),
    [commissions, filter],
  )

  const openValue = useMemo(
    () => commissions.filter(c => c.status !== 'Paid').reduce((s, c) => s + c.value, 0),
    [commissions],
  )
  const paidValue = useMemo(
    () => commissions.filter(c => c.status === 'Paid').reduce((s, c) => s + c.value, 0),
    [commissions],
  )
  const counts = useMemo(() => ({
    Pending: commissions.filter(c => c.status === 'Pending').length,
    Active:  commissions.filter(c => c.status === 'Approved' || c.status === 'In Progress').length,
    Done:    commissions.filter(c => c.status === 'Completed' || c.status === 'Paid').length,
  }), [commissions])

  return (
    <>
    <div className="min-h-screen bg-bg-base tab-enter">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-5 pt-14 pb-0 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">
            Studio
          </p>
          <h1 className="text-[28px] font-bold tracking-[-0.03em] text-ink">Commission Desk</h1>
        </div>
        <button
          onClick={() => setSheetOpen(true)}
          className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-white text-[22px] font-light shadow-gold mt-10 select-none"
          aria-label="Add commission"
        >
          +
        </button>
      </div>

      {/* ── Ledger summary card ──────────────────────────────────────────── */}
      <div className="mx-4 mt-5 bg-bg-surface border border-white/[0.06] rounded-card p-5">
        <div className="flex items-start justify-between mb-2">
          <p className="text-[9px] font-medium tracking-[0.14em] uppercase text-ink-faint">
            Matte Black Ledger
          </p>
          <span className="text-gold text-[16px]">⊕</span>
        </div>

        <div className="flex items-end gap-4 mb-1">
          <div>
            <div className="flex items-start">
              <span className="font-mono text-[16px] font-light text-ink-muted mt-1 mr-0.5">$</span>
              <span className="font-mono text-[38px] font-light leading-none tracking-tight text-ink">
                {openValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <p className="text-[11px] text-ink-muted mt-1">open commission value</p>
          </div>
          <div className="text-right pb-1">
            <p className="text-[16px] font-semibold font-mono text-emerald">
              {$fc(paidValue)}
            </p>
            <p className="text-[10px] text-ink-faint">paid</p>
          </div>
        </div>

        <div className="flex gap-6 pt-4 border-t border-white/[0.06] mt-3">
          {([
            { label: 'Pending', value: counts.Pending, color: 'text-ink'     },
            { label: 'Active',  value: counts.Active,  color: 'text-emerald' },
            { label: 'Done',    value: counts.Done,    color: 'text-ink'     },
          ] as const).map(({ label, value, color }) => (
            <div key={label}>
              <p className={`text-[24px] font-bold tracking-tight ${color}`}>{value}</p>
              <p className="text-[11px] text-ink-faint">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Status filters ────────────────────────────────────────────────── */}
      <div className="flex gap-2 mx-4 mt-4 overflow-x-auto pb-1">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'px-4 py-2 rounded-pill text-[11px] font-semibold whitespace-nowrap flex-shrink-0 transition-all select-none',
              filter === f
                ? 'gradient-gold text-white'
                : 'bg-bg-surface border border-white/[0.06] text-ink-muted',
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="mx-4 mt-4 flex flex-col gap-3">
          {[1, 2].map(i => (
            <div key={i} className="h-[120px] rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Commission cards ──────────────────────────────────────────────── */}
      {!loading && (
        <div className="mx-4 mt-4 flex flex-col gap-3">
          {visible.length === 0 && (
            <div className="bg-bg-surface border border-white/[0.06] rounded-card py-10 text-center text-ink-faint text-[13px]">
              No commissions yet.
            </div>
          )}

          {visible.map(c => {
            const progress   = STATUS_PROGRESS[c.status]
            const colorClass = STATUS_COLORS[c.status]
            const nextLabel  = STATUS_LABEL[c.status]
            const deadline   = c.deadline ? daysUntilLabel(c.deadline) : null
            const isPastDue  = deadline?.includes('ago')

            return (
              <div key={c.id} className="bg-bg-surface border border-white/[0.06] rounded-card p-4">
                {/* Top row */}
                <div className="flex items-start justify-between mb-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold text-ink">{c.client_name}</p>
                    <p className="text-[12px] text-ink-muted mt-0.5">{c.project_name}</p>
                  </div>
                  <p className="text-[17px] font-bold font-mono text-gold flex-shrink-0 ml-3">
                    {$fc(c.value)}
                  </p>
                </div>

                {/* Meta row */}
                <div className="flex items-center gap-2 mb-3">
                  <span className={cn('text-[11px]', isPastDue ? 'text-ruby' : 'text-ink-faint')}>
                    📅 {c.deadline ? fmtDate(c.deadline) : 'No deadline'}
                    {deadline ? ` · ${deadline}` : ''}
                  </span>
                  <span className={cn(
                    'ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-md border',
                    colorClass,
                  )}>
                    {c.status}
                  </span>
                </div>

                {/* Progress bar */}
                {progress > 0 && (
                  <div className="h-1.5 bg-white/[0.07] rounded-full overflow-hidden mb-3">
                    <div
                      className="h-full rounded-full gradient-gold transition-all duration-500"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                )}

                {/* Notes */}
                {c.notes && (
                  <p className="text-[11px] text-ink-faint mb-3 italic">{c.notes}</p>
                )}

                {/* Paid badge */}
                {c.status === 'Paid' && (
                  <p className="text-[11px] text-emerald flex items-center gap-1.5">
                    <span>✓</span> Logged to income
                  </p>
                )}

                {/* Action row */}
                {nextLabel && c.status !== 'Paid' && (
                  <div className="flex gap-2 pt-3 border-t border-white/[0.04]">
                    <button
                      onClick={() => advance(c)}
                      className={cn(
                        'flex-1 py-2 text-[11px] font-semibold rounded-xl border transition-all',
                        colorClass,
                      )}
                    >
                      {nextLabel}
                    </button>
                    <button className="py-2 px-3 text-[11px] font-semibold text-ink-muted bg-bg-overlay border border-white/[0.06] rounded-xl">
                      Edit
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="h-10" />
    </div>

    <AddCommissionSheet
      open={sheetOpen}
      onClose={() => setSheetOpen(false)}
      onAdd={handleAdd}
    />
    </>
  )
}
