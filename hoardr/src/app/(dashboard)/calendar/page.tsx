'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Plus, Trash2, SlidersHorizontal, LayoutGrid, AlignJustify } from 'lucide-react'
import { PullIndicator } from '@/components/ui/PullIndicator'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
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
  color?:         string
}

const DOT_COLOR: Record<EventType, string> = {
  expense: '#E8C46B',
  income:  '#4ADE80',
  sub:     '#F36369',
  custom:  '#a78bfa',
  google:  '#4285F4',
}

// Timepage detail-mode dot palette
const DETAIL_DOT: Record<EventType, string> = {
  expense: '#D4AF37',   // gold
  income:  '#22c55e',   // emerald
  sub:     '#f97316',   // orange
  custom:  '#a78bfa',   // violet
  google:  '#ffffff',   // white
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

// ── Event detail bottom sheet ─────────────────────────────────────────────────
function EventDetailSheet({ event, onClose, onDelete }: {
  event: CalEvent | null
  onClose: () => void
  onDelete: (ev: CalEvent) => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const open = event !== null

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setDeleting(false), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  async function handleDelete() {
    if (!event) return
    setDeleting(true)
    await onDelete(event)
    onClose()
  }

  const isTimeEv   = event?.type === 'custom' || event?.type === 'google'
  const timeLabel  = isTimeEv ? event?.amount : null
  const amtLabel   = !isTimeEv ? event?.amount : null
  const dotColor   = event ? (event.color ?? DETAIL_DOT[event.type]) : '#fff'

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={onClose}
        />
      )}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300"
        style={{
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          background: '#111118',
          borderRadius: '20px 20px 0 0',
          willChange: 'transform',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>

        {event && (
          <div style={{ padding: '16px 24px 28px' }}>
            {/* Title row */}
            <div className="flex items-start gap-3 mb-5">
              <span
                style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, flexShrink: 0, marginTop: 7 }}
              />
              <h2 style={{ fontSize: 22, fontWeight: 600, color: '#f0f0f8', lineHeight: 1.3, margin: 0 }}>
                {event.title}
              </h2>
            </div>

            {/* Detail rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginLeft: 21 }}>
              {timeLabel && timeLabel !== '' && (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', margin: 0 }}>
                  🕐 {timeLabel}
                </p>
              )}
              {amtLabel && (
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', fontWeight: 600, margin: 0 }}>
                  {amtLabel}
                </p>
              )}
              {event.location && (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
                  📍 {event.location}
                </p>
              )}
              {event.notes && (
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.55, margin: 0 }}>
                  {event.notes}
                </p>
              )}
            </div>

            {event.type === 'custom' && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  marginTop: 28, marginLeft: 21,
                  display: 'flex', alignItems: 'center', gap: 6,
                  color: '#ef4444', fontSize: 14, fontWeight: 500,
                  background: 'none', border: 'none', padding: '8px 0',
                  opacity: deleting ? 0.5 : 1, cursor: 'pointer',
                }}
              >
                <Trash2 size={14} />
                {deleting ? 'Deleting…' : 'Delete event'}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  )
}

// ── Grid-mode event row ───────────────────────────────────────────────────────
function EventRow({ ev, onDelete, compact = false }: {
  ev: CalEvent
  onDelete: (ev: CalEvent) => Promise<void>
  compact?: boolean
}) {
  return (
    <div className={cn('flex items-start gap-3 px-4', compact ? 'py-2.5' : 'py-3.5')}>
      <span
        className={cn('rounded-full flex-shrink-0 mt-1.5', compact ? 'w-1.5 h-1.5' : 'w-2 h-2')}
        style={{ background: ev.color ?? DOT_COLOR[ev.type] }}
      />
      <div className="flex-1 min-w-0">
        <p className={cn('font-medium text-ink', compact ? 'text-[13px]' : 'text-[14px]')}>{ev.title}</p>
        {ev.location && <p className="text-[11px] text-ink-muted mt-0.5 truncate">📍 {ev.location}</p>}
        {ev.notes    && <p className="text-[11px] text-ink-faint mt-0.5 line-clamp-2">{ev.notes}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {ev.amount && (
          <span className={cn('font-semibold font-mono px-2 py-0.5 rounded-md', compact ? 'text-[10px]' : 'text-[11px]', EVENT_COLOR[ev.type])}>
            {ev.amount}
          </span>
        )}
        {ev.type === 'custom' && (
          <button
            onClick={() => onDelete(ev)}
            className={cn('rounded-full bg-bg-overlay flex items-center justify-center', compact ? 'w-6 h-6' : 'w-7 h-7')}
          >
            <Trash2 size={compact ? 10 : 12} className="text-ruby" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

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
  const [viewMode,      setViewMode]     = useState<'grid' | 'detail'>('grid')
  const [detailEvent,   setDetailEvent]  = useState<CalEvent | null>(null)

  const todayStr    = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const supabase    = useMemo(() => createClient(), [])
  const loadGen     = useRef(0)
  const gEvLoadGen  = useRef(0)
  const dayElRefs   = useRef(new Map<string, HTMLElement>())
  const lastHapticDay = useRef<string | null>(null)

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

    if (profile?.calendar_prefs) setPrefs(profile.calendar_prefs as CalPrefs)

    const map: Record<string, CalEvent[]> = {}
    function push(date: string, ev: CalEvent) {
      if (!map[date]) map[date] = []
      map[date].push(ev)
    }

    for (const e of expenses ?? [])
      push(String(e.date), { title: String(e.name), type: 'expense', amount: `−$${Number(e.cost).toFixed(2)}` })
    for (const i of income ?? [])
      push(String(i.date), { title: String(i.name), type: 'income', amount: `+$${Number(i.amount).toFixed(2)}` })
    for (const s of subs ?? []) {
      if (s.next_renewal)
        push(String(s.next_renewal), { title: String(s.name), type: 'sub', amount: `$${Number(s.cost).toFixed(2)}` })
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

  const { distance: pullDist, refreshing: pullRefreshing, threshold: pullThreshold } =
    usePullToRefresh(loadData)

  // ── Google Calendar list ──────────────────────────────────────────────────
  useEffect(() => {
    if ((!settingsOpen && !addOpen) || googleCals.length > 0) return
    setCalsLoading(true)
    fetch('/api/calendar?action=calendars')
      .then(r => r.json())
      .then((data: { items?: GCalendar[] }) => setGoogleCals(data.items ?? []))
      .catch(() => {})
      .finally(() => setCalsLoading(false))
  }, [settingsOpen, addOpen, googleCals.length])

  // ── Google Calendar events for current month ──────────────────────────────
  useEffect(() => {
    const calIds = prefs.googleCalendarIds
    if (calIds.length === 0) { setGoogleEvMap({}); return }

    const gen   = ++gEvLoadGen.current
    const tMin  = new Date(year, month, 1).toISOString()
    const tMax  = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
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
          const date  = ev.start.date ?? ev.start.dateTime?.slice(0, 10)
          if (!date) continue
          const startT = ev.start.dateTime ? ev.start.dateTime.slice(11, 16) : null
          const endT   = ev.end.dateTime   ? ev.end.dateTime.slice(11, 16)   : null
          const label  = startT ? `${startT}${endT ? ` – ${endT}` : ''}` : ''
          if (!map[date]) map[date] = []
          map[date].push({ id: ev.id, title: ev.summary ?? '(no title)', type: 'google', amount: label, location: ev.location, color })
        }
      }
      setGoogleEvMap(map)
    })

    return () => { gEvLoadGen.current++ }
  }, [prefs.googleCalendarIds, year, month, googleCals])

  // ── Scroll to today when entering detail mode ─────────────────────────────
  useEffect(() => {
    if (viewMode !== 'detail') return
    const t = setTimeout(() => {
      const el = dayElRefs.current.get(todayStr)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => clearTimeout(t)
  }, [viewMode, year, month, todayStr])

  // ── Haptic feedback: 8ms pulse when a new day section enters view ─────────
  useEffect(() => {
    if (viewMode !== 'detail') return
    lastHapticDay.current = null

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const dayKey = (entry.target as HTMLElement).dataset.day
            if (dayKey && dayKey !== lastHapticDay.current) {
              lastHapticDay.current = dayKey
              navigator.vibrate?.(8)
            }
            break
          }
        }
      },
      { rootMargin: '-12% 0px -82% 0px', threshold: 0 },
    )

    dayElRefs.current.forEach(el => observer.observe(el))
    return () => observer.disconnect()
  // Re-run when month/year change so new refs get observed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, year, month, daysInMonth])

  // ── Save prefs ────────────────────────────────────────────────────────────
  async function savePrefs(newPrefs: CalPrefs) {
    setPrefs(newPrefs)
    await supabase.from('profiles').update({ calendar_prefs: newPrefs }).eq(
      'id',
      (await supabase.auth.getUser()).data.user?.id ?? '',
    )
  }

  // ── Custom event handlers ─────────────────────────────────────────────────
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

  // ── Merged + filtered event map ───────────────────────────────────────────
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

  // ── Grid helpers ──────────────────────────────────────────────────────────
  const firstDay = new Date(year, month, 1).getDay()
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
    <div
      className="min-h-screen tab-enter flex flex-col"
      style={{ background: viewMode === 'detail' ? '#0a0a0a' : undefined }}
      // bg-bg-base applied via className when in grid mode
    >
      <div className={viewMode === 'grid' ? 'bg-bg-base' : ''}>

        <PullIndicator distance={pullDist} threshold={pullThreshold} refreshing={pullRefreshing} />

        {/* ── Header ───────────────────────────────────────────────── */}
        <div className="px-5 pt-14 pb-4">
          <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">Schedule</p>
          <div className="flex items-center justify-between">
            <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Calendar</h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode(v => v === 'grid' ? 'detail' : 'grid')}
                className="w-9 h-9 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center select-none"
                aria-label="Toggle view"
              >
                {viewMode === 'grid'
                  ? <AlignJustify size={15} className="text-ink-muted" />
                  : <LayoutGrid   size={15} className="text-gold" />
                }
              </button>
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

      </div>{/* end grid-mode background wrapper */}

      {/* ══ GRID MODE ════════════════════════════════════════════════ */}
      {viewMode === 'grid' && (
        <div className="bg-bg-base">
          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 px-3 mb-1">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className="text-center text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint py-1">{d}</div>
            ))}
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-7 px-3 gap-y-0.5">
            {cells.map((day, i) => {
              if (day === null) return <div key={i} className="h-12" />
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
                    isTod            ? 'gradient-gold text-white font-bold'            : '',
                    isSel && !isTod  ? 'bg-bg-surface border border-white/10 text-ink' : '',
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

          {/* Selected day panel */}
          {selectedLabel && (
            <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden mb-4">
              <div className="px-4 pt-4 pb-3 border-b border-white/[0.04] flex items-center justify-between">
                <p className="text-[18px] font-semibold text-ink">{selectedLabel}</p>
                <button
                  onClick={() => setAddOpen(true)}
                  className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center select-none"
                >
                  <Plus size={13} className="text-white" />
                </button>
              </div>
              {selectedEvents.length === 0 ? (
                <div className="py-8 text-center text-ink-faint text-[13px]">Nothing on this day.</div>
              ) : (
                <div className="divide-y divide-white/[0.04]">
                  {selectedEvents.map((ev, idx) => (
                    <EventRow key={idx} ev={ev} onDelete={handleDeleteCustomEvent} />
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
      )}

      {/* ══ DETAIL MODE — Timepage scroll view ═══════════════════════ */}
      {viewMode === 'detail' && (
        <div>
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
            const ds        = dateStr(day)
            const dayEvents = visibleMap[ds] ?? []
            const isTod     = ds === todayStr
            const date      = new Date(year, month, day)
            const dayAbbr   = date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()

            return (
              <div
                key={day}
                ref={el => { if (el) dayElRefs.current.set(ds, el); else dayElRefs.current.delete(ds) }}
                data-day={ds}
                className="flex"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', minHeight: 72 }}
              >
                {/* Left: rotated day label */}
                <div style={{
                  width: 52,
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'center',
                  paddingTop: 20,
                  paddingBottom: 16,
                }}>
                  <span style={{
                    writingMode: 'vertical-rl',
                    transform: 'rotate(180deg)',
                    fontSize: 11,
                    letterSpacing: '0.1em',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: isTod ? '#c9a84c' : 'rgba(255,255,255,0.28)',
                    lineHeight: 1.2,
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                  }}>
                    {dayAbbr}&thinsp;{day}
                  </span>
                </div>

                {/* Vertical rule */}
                <div style={{
                  width: 1,
                  flexShrink: 0,
                  background: isTod ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.05)',
                }} />

                {/* Right: event list */}
                <div style={{
                  flex: 1,
                  paddingLeft: 18,
                  paddingRight: 20,
                  paddingTop: 16,
                  paddingBottom: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 16,
                }}>
                  {dayEvents.length === 0 && (
                    <div style={{ height: 40 }} />
                  )}

                  {dayEvents.map((ev, idx) => {
                    const isTimeEv  = ev.type === 'custom' || ev.type === 'google'
                    const timeLabel = isTimeEv && ev.amount ? ev.amount : null
                    const amtLabel  = !isTimeEv ? ev.amount : null
                    const dot       = ev.color ?? DETAIL_DOT[ev.type]

                    return (
                      <button
                        key={idx}
                        onClick={() => { setDetailEvent(ev); navigator.vibrate?.(6) }}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 11,
                          textAlign: 'left',
                          width: '100%',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                        }}
                      >
                        {/* Dot */}
                        <span style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: dot,
                          flexShrink: 0,
                          marginTop: 7,
                        }} />

                        {/* Text */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {timeLabel && (
                            <p style={{
                              fontSize: 10,
                              color: 'rgba(255,255,255,0.38)',
                              fontFamily: 'var(--font-dm-mono, monospace)',
                              letterSpacing: '0.05em',
                              margin: '0 0 3px',
                            }}>
                              {timeLabel}
                            </p>
                          )}
                          <p style={{
                            fontSize: 16,
                            fontWeight: 400,
                            color: 'rgba(255,255,255,0.88)',
                            lineHeight: 1.35,
                            margin: 0,
                          }}>
                            {ev.title}
                          </p>
                          {amtLabel && (
                            <p style={{
                              fontSize: 10,
                              color: 'rgba(255,255,255,0.35)',
                              fontFamily: 'var(--font-dm-mono, monospace)',
                              letterSpacing: '0.04em',
                              margin: '3px 0 0',
                            }}>
                              {amtLabel}
                            </p>
                          )}
                          {ev.location && (
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: '3px 0 0' }}>
                              📍 {ev.location}
                            </p>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Bottom padding clears the nav bar */}
          <div style={{ height: 110 }} />
        </div>
      )}
    </div>

    <EventDetailSheet
      event={detailEvent}
      onClose={() => setDetailEvent(null)}
      onDelete={handleDeleteCustomEvent}
    />

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
