'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Plus, Trash2, SlidersHorizontal } from 'lucide-react'
import { AddEventSheet, type NewCalEvent } from '@/components/calendar/AddEventSheet'
import { CalendarSettingsSheet, type CalPrefs, type GCalendar } from '@/components/calendar/CalendarSettingsSheet'
import { createCalEvent, deleteCalEvent, allDayEvent, timedEvent } from '@/lib/calendar'

type EventType = 'expense' | 'income' | 'sub' | 'custom' | 'google'

interface CalEvent {
  id?:            string
  title:          string
  type:           EventType
  amount:         string
  location?:      string
  notes?:         string
  googleEventId?: string
  color?:         string   // per-calendar color for google events
}

const DOT_COLOR: Record<EventType, string> = {
  expense: '#E8C46B',
  income:  '#4ADE80',
  sub:     '#F36369',
  custom:  '#a78bfa',
  google:  '#4285F4',
}

const EVENT_COLOR: Record<EventType, string> = {
  expense: 'bg-gold/20    text-gold',
  income:  'bg-emerald/20 text-emerald',
  sub:     'bg-ruby/20    text-ruby',
  custom:  'bg-violet-500/20 text-violet-300',
  google:  'bg-blue-500/20   text-blue-300',
}

const DEFAULT_PREFS: CalPrefs = {
  visibleTypes:      ['sub', 'custom', 'google'],
  googleCalendarIds: [],
}

export default function CalendarPage() {
  const today = useMemo(() => new Date(), [])
  const [year,          setYear]         = useState(today.getFullYear())
  const [month,         setMonth]        = useState(today.getMonth())
  const [selected,      setSelected]     = useState<string | null>(null)
  const [eventMap,      setEventMap]     = useState<Record<string, CalEvent[]>>({})
  const [googleEvMap,   setGoogleEvMap]  = useState<Record<string, CalEvent[]>>({})
  const [prefs,         setPrefs]        = useState<CalPrefs>(DEFAULT_PREFS)
  const [googleCals,    setGoogleCals]   = useState<GCalendar[]>([])
  const [calsLoading,   setCalsLoading]  = useState(false)
  const [addOpen,       setAddOpen]      = useState(false)
  const [settingsOpen,  setSettingsOpen] = useState(false)

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const supabase   = useMemo(() => createClient(), [])
  const loadGen    = useRef(0)
  const gEvLoadGen = useRef(0)

  // ── Load Supabase events + saved prefs ────────────────────────────────────
  const loadData = useCallback(async () => {
    const gen = ++loadGen.current
    const [
      { data: expenses },
      { data: income },
      { data: subs },
      { data: customEvents },
      { data: profile },
    ] = await Promise.all([
      supabase.from('expenses').select('name, cost, date'),
      supabase.from('income').select('name, amount, date'),
      supabase.from('subscriptions').select('name, cost, next_renewal').eq('status', 'Active'),
      supabase.from('cal_events').select('id, title, date, start_time, end_time, location, notes, google_event_id').order('created_at'),
      supabase.from('profiles').select('calendar_prefs').single(),
    ])

    if (gen !== loadGen.current) return

    if (profile?.calendar_prefs) {
      setPrefs(profile.calendar_prefs as CalPrefs)
    }

    const map: Record<string, CalEvent[]> = {}
    function push(date: string, ev: CalEvent) {
      if (!map[date]) map[date] = []
      map[date].push(ev)
    }

    for (const e of expenses ?? []) {
      push(String(e.date), { title: String(e.name), type: 'expense', amount: `−$${Number(e.cost).toFixed(2)}` })
    }
    for (const i of income ?? []) {
      push(String(i.date), { title: String(i.name), type: 'income', amount: `+$${Number(i.amount).toFixed(2)}` })
    }
    for (const s of subs ?? []) {
      if (s.next_renewal) {
        push(String(s.next_renewal), { title: String(s.name), type: 'sub', amount: `$${Number(s.cost).toFixed(2)}` })
      }
    }
    for (const c of customEvents ?? []) {
      const label = c.start_time ? `${c.start_time}${c.end_time ? ` – ${c.end_time}` : ''}` : ''
      push(String(c.date), {
        id:            String(c.id),
        title:         String(c.title),
        type:          'custom',
        amount:        label,
        location:      c.location ? String(c.location) : undefined,
        notes:         c.notes    ? String(c.notes)    : undefined,
        googleEventId: c.google_event_id ? String(c.google_event_id) : undefined,
      })
    }

    setEventMap(map)
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++ } }, [loadData])

  // ── Load Google Calendar list when settings or add sheet opens ───────────
  useEffect(() => {
    if ((!settingsOpen && !addOpen) || googleCals.length > 0) return
    setCalsLoading(true)
    fetch('/api/calendar?action=calendars')
      .then(r => r.json())
      .then((data: { items?: GCalendar[] }) => {
        setGoogleCals(data.items ?? [])
      })
      .catch(() => {})
      .finally(() => setCalsLoading(false))
  }, [settingsOpen, addOpen, googleCals.length])

  // ── Fetch Google Calendar events when month or selected calendars change ───
  useEffect(() => {
    const calIds = prefs.googleCalendarIds
    if (calIds.length === 0) { setGoogleEvMap({}); return }

    const gen    = ++gEvLoadGen.current
    const tMin   = new Date(year, month, 1).toISOString()
    const tMax   = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

    // Build a color lookup from already-fetched calendar list
    const colorMap: Record<string, string> = {}
    for (const cal of googleCals) colorMap[cal.id] = cal.backgroundColor

    Promise.all(
      calIds.map(calId =>
        fetch(`/api/calendar?action=events&calendarId=${encodeURIComponent(calId)}&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`)
          .then(r => r.json())
          .then((data: { items?: Array<{
            id: string; summary?: string; location?: string;
            start: { date?: string; dateTime?: string };
            end:   { date?: string; dateTime?: string };
          }> }) => ({ calId, items: data.items ?? [] }))
          .catch(() => ({ calId, items: [] })),
      ),
    ).then(results => {
      if (gen !== gEvLoadGen.current) return
      const map: Record<string, CalEvent[]> = {}
      for (const { calId, items } of results) {
        const color = colorMap[calId] ?? '#4285F4'
        for (const ev of items) {
          const date = ev.start.date ?? ev.start.dateTime?.slice(0, 10)
          if (!date) continue
          const startT = ev.start.dateTime ? ev.start.dateTime.slice(11, 16) : null
          const endT   = ev.end.dateTime   ? ev.end.dateTime.slice(11, 16)   : null
          const label  = startT ? `${startT}${endT ? ` – ${endT}` : ''}` : ''
          if (!map[date]) map[date] = []
          map[date].push({
            id:       ev.id,
            title:    ev.summary ?? '(no title)',
            type:     'google',
            amount:   label,
            location: ev.location,
            color,
          })
        }
      }
      setGoogleEvMap(map)
    })

    return () => { gEvLoadGen.current++ }
  }, [prefs.googleCalendarIds, year, month, googleCals])

  // ── Save prefs to Supabase ─────────────────────────────────────────────────
  async function savePrefs(newPrefs: CalPrefs) {
    setPrefs(newPrefs)
    await supabase.from('profiles').update({ calendar_prefs: newPrefs }).eq(
      'id',
      (await supabase.auth.getUser()).data.user?.id ?? '',
    )
  }

  // ── Custom event handlers ──────────────────────────────────────────────────
  async function handleAddEvent(ev: NewCalEvent) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const gcal = ev.allDay
      ? allDayEvent(ev.title, ev.date, ev.notes || undefined, ev.location || undefined)
      : timedEvent(ev.title, ev.date, ev.startTime, ev.endTime, {
          description: ev.notes    || undefined,
          location:    ev.location || undefined,
        })
    const googleEventId = await createCalEvent(gcal, ev.calendarId)
    await supabase.from('cal_events').insert({
      user_id: user.id, title: ev.title, date: ev.date,
      start_time: ev.allDay ? null : ev.startTime,
      end_time:   ev.allDay ? null : ev.endTime,
      location:   ev.location || null,
      notes:      ev.notes    || null,
      google_event_id: googleEventId,
    })
    await loadData()
  }

  async function handleDeleteCustomEvent(ev: CalEvent) {
    if (!ev.id) return
    if (ev.googleEventId) await deleteCalEvent(ev.googleEventId)
    await supabase.from('cal_events').delete().eq('id', ev.id)
    await loadData()
  }

  // ── Merged + filtered event map ────────────────────────────────────────────
  const visibleMap = useMemo(() => {
    const m: Record<string, CalEvent[]> = {}
    for (const [date, evs] of Object.entries(eventMap)) {
      const filtered = evs.filter(e => prefs.visibleTypes.includes(e.type))
      if (filtered.length) m[date] = filtered
    }
    if (prefs.visibleTypes.includes('google')) {
      for (const [date, evs] of Object.entries(googleEvMap)) {
        if (!m[date]) m[date] = []
        m[date].push(...evs)
      }
    }
    return m
  }, [eventMap, googleEvMap, prefs.visibleTypes])

  // ── Grid helpers ───────────────────────────────────────────────────────────
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  function dateStr(day: number) {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  function goToPrev() { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1); setSelected(null) }
  function goToNext() { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1); setSelected(null) }
  function goToToday() { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelected(todayStr) }

  const selectedEvents = selected ? (visibleMap[selected] ?? []) : []
  const selectedLabel  = selected
    ? new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : null

  return (
    <>
    <div className="min-h-screen bg-bg-base tab-enter flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-14 pb-4">
        <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">Schedule</p>
        <div className="flex items-center justify-between">
          <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Calendar</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-9 h-9 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center select-none"
              aria-label="Calendar filters"
            >
              <SlidersHorizontal size={15} className="text-ink-muted" />
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center select-none"
              aria-label="Add event"
            >
              <Plus size={18} className="text-white" />
            </button>
            <button onClick={goToPrev} className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none">‹</button>
            <button onClick={goToNext} className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none">›</button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[18px] font-semibold text-ink">{monthLabel}</p>
          <button onClick={goToToday} className="text-[11px] font-medium text-gold select-none">Today</button>
        </div>
      </div>

      {/* ── Day headers ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 px-3 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint py-1">{d}</div>
        ))}
      </div>

      {/* ── Month grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 px-3 gap-y-0.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} className="h-12"/>
          const ds        = dateStr(day)
          const dayEvents = visibleMap[ds] ?? []
          const isSel     = selected === ds
          const isTod     = ds === todayStr
          return (
            <button
              key={i}
              onClick={() => setSelected(isSel ? null : ds)}
              className="flex flex-col items-center py-1 gap-1 h-12 select-none"
            >
              <span className={cn(
                'w-8 h-8 flex items-center justify-center rounded-xl text-[13px] font-medium transition-all',
                isTod           ? 'gradient-gold text-white font-bold'             : '',
                isSel && !isTod ? 'bg-bg-surface border border-white/10 text-ink'  : '',
                !isTod && !isSel ? 'text-ink-muted'                                : '',
              )}>
                {day}
              </span>
              <div className="flex gap-[3px]">
                {dayEvents.slice(0, 3).map((ev, j) => (
                  <span
                    key={j}
                    className="w-[5px] h-[5px] rounded-full flex-shrink-0"
                    style={{ background: ev.color ?? DOT_COLOR[ev.type] }}
                  />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Selected day panel ──────────────────────────────────────── */}
      {selectedLabel && (
        <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden mb-4">
          <div className="px-4 pt-4 pb-3 border-b border-white/[0.04] flex items-center justify-between">
            <p className="text-[18px] font-semibold text-ink">{selectedLabel}</p>
            <button
              onClick={() => setAddOpen(true)}
              className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center select-none"
              aria-label="Add event on this day"
            >
              <Plus size={13} className="text-white" />
            </button>
          </div>

          {selectedEvents.length === 0 ? (
            <div className="py-8 text-center text-ink-faint text-[13px]">Nothing on this day.</div>
          ) : (
            <div className="divide-y divide-white/[0.04]">
              {selectedEvents.map((ev, idx) => (
                <div key={idx} className="flex items-start gap-3 px-4 py-3.5">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                    style={{ background: ev.color ?? DOT_COLOR[ev.type] }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-ink">{ev.title}</p>
                    {ev.location && <p className="text-[11px] text-ink-muted mt-0.5 truncate">📍 {ev.location}</p>}
                    {ev.notes    && <p className="text-[11px] text-ink-faint mt-0.5 line-clamp-2">{ev.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {ev.amount && (
                      <span className={cn('text-[11px] font-semibold font-mono px-2 py-0.5 rounded-md', EVENT_COLOR[ev.type])}>
                        {ev.amount}
                      </span>
                    )}
                    {ev.type === 'custom' && (
                      <button
                        onClick={() => handleDeleteCustomEvent(ev)}
                        className="w-7 h-7 rounded-full bg-bg-overlay flex items-center justify-center"
                      >
                        <Trash2 size={12} className="text-ruby" />
                      </button>
                    )}
                  </div>
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

    <AddEventSheet
      open={addOpen}
      defaultDate={selected ?? undefined}
      googleCals={googleCals.filter(cal => prefs.googleCalendarIds.includes(cal.id))}
      onClose={() => setAddOpen(false)}
      onAdd={handleAddEvent}
    />

    <CalendarSettingsSheet
      open={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      prefs={prefs}
      googleCals={googleCals}
      calsLoading={calsLoading}
      onSave={savePrefs}
    />
    </>
  )
}
