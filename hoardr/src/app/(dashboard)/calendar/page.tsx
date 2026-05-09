'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type EventType = 'expense' | 'income' | 'sub'

interface CalEvent {
  title:  string
  type:   EventType
  amount: string
}

const DOT_COLOR: Record<EventType, string> = {
  expense: '#D4AF37',
  income:  '#22c55e',
  sub:     '#ef4444',
}

const EVENT_COLOR: Record<EventType, string> = {
  expense: 'bg-gold/20    text-gold',
  income:  'bg-emerald/20 text-emerald',
  sub:     'bg-ruby/20    text-ruby',
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), [])
  const [year,     setYear]     = useState(today.getFullYear())
  const [month,    setMonth]    = useState(today.getMonth())
  const [selected, setSelected] = useState<string | null>(null)
  const [eventMap, setEventMap] = useState<Record<string, CalEvent[]>>({})

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const supabase = useMemo(() => createClient(), [])

  const loadData = useCallback(async () => {
    const [{ data: expenses }, { data: income }, { data: subs }] = await Promise.all([
      supabase.from('expenses').select('name, cost, date'),
      supabase.from('income').select('name, amount, date'),
      supabase.from('subscriptions').select('name, cost, next_renewal').eq('status', 'Active'),
    ])

    const map: Record<string, CalEvent[]> = {}

    function push(date: string, ev: CalEvent) {
      if (!map[date]) map[date] = []
      map[date].push(ev)
    }

    for (const e of expenses ?? []) {
      push(String(e.date), {
        title:  String(e.name),
        type:   'expense',
        amount: `−$${Number(e.cost).toFixed(2)}`,
      })
    }

    for (const i of income ?? []) {
      push(String(i.date), {
        title:  String(i.name),
        type:   'income',
        amount: `+$${Number(i.amount).toFixed(2)}`,
      })
    }

    for (const s of subs ?? []) {
      if (s.next_renewal) {
        push(String(s.next_renewal), {
          title:  String(s.name),
          type:   'sub',
          amount: `$${Number(s.cost).toFixed(2)}`,
        })
      }
    }

    setEventMap(map)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function goToPrev() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelected(null)
  }
  function goToNext() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelected(null)
  }
  function goToToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelected(todayStr)
  }

  const selectedEvents = selected ? (eventMap[selected] ?? []) : []
  const selectedLabel  = selected
    ? new Date(selected + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen bg-bg-base tab-enter flex flex-col">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-5 pt-14 pb-4">
        <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">
          Schedule
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Calendar</h1>
          <div className="flex gap-2">
            <button
              onClick={goToPrev}
              className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none"
            >
              ‹
            </button>
            <button
              onClick={goToNext}
              className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none"
            >
              ›
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[18px] font-semibold text-ink">{monthLabel}</p>
          <button
            onClick={goToToday}
            className="text-[11px] font-medium text-gold select-none"
          >
            Today
          </button>
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex gap-4 px-5 pb-3">
        {([['expense', 'Expense'], ['income', 'Income'], ['sub', 'Subscription']] as [EventType, string][]).map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: DOT_COLOR[type] }}/>
            <span className="text-[10px] text-ink-faint">{label}</span>
          </div>
        ))}
      </div>

      {/* ── Day headers ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 px-3 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint py-1">
            {d}
          </div>
        ))}
      </div>

      {/* ── Month grid ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 px-3 gap-y-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="h-12"/>

          const ds         = dateStr(day)
          const dayEvents  = eventMap[ds] ?? []
          const isSelected = selected === ds
          const isTod      = ds === todayStr

          return (
            <button
              key={i}
              onClick={() => setSelected(isSelected ? null : ds)}
              className="flex flex-col items-center py-1 gap-1 h-12 select-none"
            >
              <span className={cn(
                'w-8 h-8 flex items-center justify-center rounded-xl text-[13px] font-medium transition-all',
                isTod      ? 'gradient-gold text-white font-bold'                   : '',
                isSelected && !isTod ? 'bg-bg-surface border border-white/10 text-ink' : '',
                !isTod && !isSelected ? 'text-ink-muted'                             : '',
              )}>
                {day}
              </span>
              <div className="flex gap-[3px]">
                {dayEvents.slice(0, 3).map((ev, j) => (
                  <span
                    key={j}
                    className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                    style={{ background: DOT_COLOR[ev.type] }}
                  />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Selected day panel ───────────────────────────────────────────── */}
      {selectedLabel && (
        <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden mb-4">
          <div className="px-4 pt-4 pb-3 border-b border-white/[0.04]">
            <p className="text-[18px] font-semibold text-ink">{selectedLabel}</p>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="py-8 text-center text-ink-faint text-[13px]">
              Nothing on this day.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {selectedEvents.map((ev, idx) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-3.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ background: DOT_COLOR[ev.type] }}
                  />
                  <p className="text-[14px] font-medium text-ink flex-1">{ev.title}</p>
                  <span className={cn(
                    'text-[11px] font-semibold font-mono px-2 py-0.5 rounded-md',
                    EVENT_COLOR[ev.type],
                  )}>
                    {ev.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!selectedLabel && (
        <div className="mx-4 mt-4 mb-4 bg-bg-surface border border-white/[0.06] rounded-card py-8 text-center text-ink-faint text-[13px]">
          Tap a day to see events.
        </div>
      )}
    </div>
  )
}
