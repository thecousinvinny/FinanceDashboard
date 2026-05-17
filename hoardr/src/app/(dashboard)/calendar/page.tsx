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

interface MonthKey { year: number; month: number }

// ── Color palettes ────────────────────────────────────────────────────────────
const DOT_COLOR: Record<EventType, string> = {
  expense: '#E8C46B', income: '#4ADE80', sub: '#F36369', custom: '#a78bfa', google: '#4285F4',
}
const DETAIL_DOT: Record<EventType, string> = {
  expense: '#D4AF37', income: '#22c55e', sub: '#f97316', custom: '#a78bfa', google: '#ffffff',
}
const EVENT_COLOR: Record<EventType, string> = {
  expense: 'bg-gold/20 text-gold', income: 'bg-emerald/20 text-emerald',
  sub: 'bg-ruby/20 text-ruby', custom: 'bg-violet-500/20 text-violet-300',
  google: 'bg-blue-500/20 text-blue-300',
}

const DEFAULT_PREFS: CalPrefs = { visibleTypes: ['sub', 'custom', 'google'], googleCalendarIds: [] }

// ── Pure helpers ──────────────────────────────────────────────────────────────
function addMonths(y: number, m: number, delta: number): MonthKey {
  let nm = m + delta, ny = y
  while (nm < 0)  { nm += 12; ny-- }
  while (nm > 11) { nm -= 12; ny++ }
  return { year: ny, month: nm }
}

function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function fmt12(hhmm: string) {
  const [h, min] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(min).padStart(2, '0')}${ampm}`
}

function getTimeLabel(ev: CalEvent): string | null {
  if (ev.type !== 'custom' && ev.type !== 'google') return null
  if (!ev.amount) return null
  const parts = ev.amount.split(' – ')
  if (parts.length === 2 && /^\d{2}:\d{2}$/.test(parts[0])) return `${fmt12(parts[0])} – ${fmt12(parts[1])}`
  if (/^\d{2}:\d{2}$/.test(ev.amount)) return fmt12(ev.amount)
  return ev.amount || null
}

function monthLabel(y: number, m: number) {
  return new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
}

// ── Event detail sheet ────────────────────────────────────────────────────────
function EventDetailSheet({ event, onClose, onDelete }: {
  event: CalEvent | null
  onClose: () => void
  onDelete: (ev: CalEvent) => Promise<void>
}) {
  const [deleting, setDeleting] = useState(false)
  const open = event !== null

  useEffect(() => {
    if (!open) { const t = setTimeout(() => setDeleting(false), 300); return () => clearTimeout(t) }
  }, [open])

  const timeLabel = event ? getTimeLabel(event) : null
  const amtLabel  = event && event.type !== 'custom' && event.type !== 'google' ? event.amount : null
  const dot       = event ? (event.color ?? DETAIL_DOT[event.type]) : '#fff'

  return (
    <>
      {open && <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.65)' }} onClick={onClose} />}
      <div className="fixed bottom-0 left-0 right-0 z-50 transition-transform duration-300"
        style={{ transform: open ? 'translateY(0)' : 'translateY(100%)', background: '#111118', borderRadius: '20px 20px 0 0', willChange: 'transform', maxHeight: '85dvh', display: 'flex', flexDirection: 'column' }}>
        {/* Fixed handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.18)' }} />
        </div>
        {/* Scrollable content */}
        {event && (
          <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 20px)' }}>
            <div style={{ padding: '16px 24px 28px' }}>
              <div className="flex items-start gap-3 mb-5">
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 7 }} />
                <h2 style={{ fontSize: 22, fontWeight: 600, color: '#f0f0f8', lineHeight: 1.3, margin: 0 }}>{event.title}</h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginLeft: 21 }}>
                {timeLabel  && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', margin: 0 }}>🕐 {timeLabel}</p>}
                {amtLabel   && <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', fontFamily: 'monospace', fontWeight: 600, margin: 0 }}>{amtLabel}</p>}
                {event.location && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>📍 {event.location}</p>}
                {event.notes    && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.38)', lineHeight: 1.55, margin: 0 }}>{event.notes}</p>}
              </div>
              {event.type === 'custom' && (
                <button onClick={async () => { setDeleting(true); await onDelete(event); onClose() }} disabled={deleting}
                  style={{ marginTop: 28, marginLeft: 21, display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontSize: 14, fontWeight: 500, background: 'none', border: 'none', padding: '8px 0', opacity: deleting ? 0.5 : 1, cursor: 'pointer' }}>
                  <Trash2 size={14} />{deleting ? 'Deleting…' : 'Delete event'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Grid-mode event row ───────────────────────────────────────────────────────
function EventRow({ ev, onDelete }: { ev: CalEvent; onDelete: (ev: CalEvent) => Promise<void> }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: ev.color ?? DOT_COLOR[ev.type] }} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-ink">{ev.title}</p>
        {ev.location && <p className="text-[11px] text-ink-muted mt-0.5 truncate">📍 {ev.location}</p>}
        {ev.notes    && <p className="text-[11px] text-ink-faint mt-0.5 line-clamp-2">{ev.notes}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {ev.amount && <span className={cn('text-[11px] font-semibold font-mono px-2 py-0.5 rounded-md', EVENT_COLOR[ev.type])}>{ev.amount}</span>}
        {ev.type === 'custom' && (
          <button onClick={() => onDelete(ev)} className="w-7 h-7 rounded-full bg-bg-overlay flex items-center justify-center">
            <Trash2 size={12} className="text-ruby" />
          </button>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today    = useMemo(() => new Date(), [])
  const todayStr = useMemo(() => toDateStr(today.getFullYear(), today.getMonth(), today.getDate()), [today])

  // Grid state
  const [gridYear,  setGridYear]  = useState(today.getFullYear())
  const [gridMonth, setGridMonth] = useState(today.getMonth())
  const [selected,  setSelected]  = useState<string | null>(null)

  // Shared data state
  const [eventMap,    setEventMap]    = useState<Record<string, CalEvent[]>>({})
  const [googleEvMap, setGoogleEvMap] = useState<Record<string, CalEvent[]>>({})
  const [prefs,       setPrefs]       = useState<CalPrefs>(DEFAULT_PREFS)
  const [googleCals,  setGoogleCals]  = useState<GCalendar[]>([])
  const [calsLoading, setCalsLoading] = useState(false)

  // UI state
  const [addOpen,      setAddOpen]      = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [viewMode,     setViewMode]     = useState<'grid' | 'detail'>('grid')
  const [detailEvent,  setDetailEvent]  = useState<CalEvent | null>(null)

  // Infinite scroll month list (detail mode)
  const [months, setMonths] = useState<MonthKey[]>(() =>
    Array.from({ length: 9 }, (_, i) => addMonths(today.getFullYear(), today.getMonth(), i - 4))
  )

  // Left-edge month label (detail mode)
  const [sideLbl, setSideLbl] = useState(() => monthLabel(today.getFullYear(), today.getMonth()))

  // Stable range key so Google Calendar effect doesn't re-run on reference change
  const rangeKey = useMemo(() => {
    const f = months[0], l = months[months.length - 1]
    return `${f.year}/${f.month}..${l.year}/${l.month}`
  }, [months])

  const supabase      = useMemo(() => createClient(), [])
  const loadGen       = useRef(0)
  const gEvGen        = useRef(0)
  const dayRefs       = useRef(new Map<string, HTMLElement>())
  const lastHapticDay = useRef<string | null>(null)
  const scrollRef     = useRef<HTMLDivElement>(null)
  const topSentRef    = useRef<HTMLDivElement>(null)
  const botSentRef    = useRef<HTMLDivElement>(null)
  const loadingMore   = useRef(false)
  // Keep a ref copy of months so the stable scroll handler can read latest value
  const monthsRef     = useRef(months)

  // Keep monthsRef in sync so the scroll handler always sees the latest list
  useEffect(() => { monthsRef.current = months }, [months])

  // ── Scroll-based haptic + month label ─────────────────────────────────────
  // Mirrors UIScrollViewDelegate scrollViewDidScroll: finds which day row sits
  // at a fixed Y threshold (120px from the top of the scroll container) using
  // offsetTop (no layout-forcing getBoundingClientRect on the hot path).
  // Fires navigator.vibrate(8) exactly once per new day boundary crossed.
  const handleDetailScroll = useCallback(() => {
    const sc = scrollRef.current
    if (!sc) return
    const threshold = sc.scrollTop + 120   // 120px trigger line from container top

    let found: string | null = null
    outer: for (const { year: y, month: m } of monthsRef.current) {
      const dim = getDaysInMonth(y, m)
      for (let d = 1; d <= dim; d++) {
        const ds = toDateStr(y, m, d)
        const el = dayRefs.current.get(ds)
        if (!el) continue
        const top = el.offsetTop
        if (top > threshold) break outer          // scrolled past trigger — stop
        if (top + el.offsetHeight > threshold) {  // straddles the trigger line
          found = ds
          break outer
        }
      }
    }

    if (found && found !== lastHapticDay.current) {
      lastHapticDay.current = found
      navigator.vibrate?.(8)
      const [ys, ms] = found.split('-')
      setSideLbl(monthLabel(parseInt(ys), parseInt(ms) - 1))
    }
  }, []) // stable — reads only refs

  // ── Supabase load ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    const gen = ++loadGen.current
    const [{ data: exp }, { data: inc }, { data: subs }, { data: cevs }, { data: profile }] =
      await Promise.all([
        supabase.from('expenses').select('name, cost, date'),
        supabase.from('income').select('name, amount, date'),
        supabase.from('subscriptions').select('name, cost, next_renewal').eq('status', 'Active'),
        supabase.from('cal_events').select('id, title, date, start_time, end_time, location, notes, google_event_id').order('created_at'),
        supabase.from('profiles').select('calendar_prefs').single(),
      ])
    if (gen !== loadGen.current) return
    if (profile?.calendar_prefs) setPrefs(profile.calendar_prefs as CalPrefs)

    const map: Record<string, CalEvent[]> = {}
    const push = (date: string, ev: CalEvent) => { if (!map[date]) map[date] = []; map[date].push(ev) }

    for (const e of exp  ?? []) push(String(e.date), { title: String(e.name), type: 'expense', amount: `−$${Number(e.cost).toFixed(2)}` })
    for (const i of inc  ?? []) push(String(i.date), { title: String(i.name), type: 'income',  amount: `+$${Number(i.amount).toFixed(2)}` })
    for (const s of subs ?? []) if (s.next_renewal) push(String(s.next_renewal), { title: String(s.name), type: 'sub', amount: `$${Number(s.cost).toFixed(2)}` })
    for (const c of cevs ?? []) {
      const st = c.start_time ? String(c.start_time) : ''
      const et = c.end_time   ? String(c.end_time)   : ''
      push(String(c.date), {
        id: String(c.id), title: String(c.title), type: 'custom',
        amount: st ? `${st}${et ? ` – ${et}` : ''}` : '',
        location: c.location ? String(c.location) : undefined,
        notes:    c.notes    ? String(c.notes)    : undefined,
        googleEventId: c.google_event_id ? String(c.google_event_id) : undefined,
      })
    }
    setEventMap(map)
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++ } }, [loadData])

  const { distance: pullDist, refreshing: pullRefreshing, threshold: pullThreshold } = usePullToRefresh(loadData)

  // ── Google Calendar list ──────────────────────────────────────────────────
  useEffect(() => {
    if ((!settingsOpen && !addOpen) || googleCals.length > 0) return
    setCalsLoading(true)
    fetch('/api/calendar?action=calendars')
      .then(r => r.json()).then((d: { items?: GCalendar[] }) => setGoogleCals(d.items ?? []))
      .catch(() => {}).finally(() => setCalsLoading(false))
  }, [settingsOpen, addOpen, googleCals.length])

  // ── Google Calendar events ────────────────────────────────────────────────
  useEffect(() => {
    const calIds = prefs.googleCalendarIds
    if (calIds.length === 0) { setGoogleEvMap({}); return }
    const gen  = ++gEvGen.current
    const f    = months[0], l = months[months.length - 1]
    const tMin = new Date(f.year, f.month, 1).toISOString()
    const tMax = new Date(l.year, l.month + 1, 0, 23, 59, 59).toISOString()
    const clr: Record<string, string> = {}
    for (const c of googleCals) clr[c.id] = c.backgroundColor

    Promise.all(calIds.map(calId =>
      fetch(`/api/calendar?action=events&calendarId=${encodeURIComponent(calId)}&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`)
        .then(r => r.json())
        .then((d: { items?: Array<{ id: string; summary?: string; location?: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string } }> }) => ({ calId, items: d.items ?? [] }))
        .catch(() => ({ calId, items: [] }))
    )).then(results => {
      if (gen !== gEvGen.current) return
      const map: Record<string, CalEvent[]> = {}
      for (const { calId, items } of results) {
        const color = clr[calId] ?? '#4285F4'
        for (const ev of items) {
          const date = ev.start.date ?? ev.start.dateTime?.slice(0, 10)
          if (!date) continue
          const st = ev.start.dateTime ? ev.start.dateTime.slice(11, 16) : null
          const et = ev.end.dateTime   ? ev.end.dateTime.slice(11, 16)   : null
          if (!map[date]) map[date] = []
          map[date].push({ id: ev.id, title: ev.summary ?? '(no title)', type: 'google', amount: st ? `${st}${et ? ` – ${et}` : ''}` : '', location: ev.location, color })
        }
      }
      setGoogleEvMap(map)
    })
    return () => { gEvGen.current++ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.googleCalendarIds, rangeKey, googleCals])

  // ── Merged visible map ────────────────────────────────────────────────────
  const visibleMap = useMemo(() => {
    const m: Record<string, CalEvent[]> = {}
    for (const [date, evs] of Object.entries(eventMap)) {
      const f = evs.filter(e => prefs.visibleTypes.includes(e.type))
      if (f.length) m[date] = f
    }
    if (prefs.visibleTypes.includes('google'))
      for (const [date, evs] of Object.entries(googleEvMap)) { if (!m[date]) m[date] = []; m[date].push(...evs) }
    return m
  }, [eventMap, googleEvMap, prefs.visibleTypes])

  // ── Save prefs ────────────────────────────────────────────────────────────
  async function savePrefs(p: CalPrefs) {
    setPrefs(p)
    await supabase.from('profiles').update({ calendar_prefs: p }).eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
  }

  // ── Custom event handlers ─────────────────────────────────────────────────
  async function handleAddEvent(ev: NewCalEvent) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const gcal = ev.allDay
      ? allDayEvent(ev.title, ev.date, ev.notes || undefined, ev.location || undefined)
      : timedEvent(ev.title, ev.date, ev.startTime, ev.endTime, { description: ev.notes || undefined, location: ev.location || undefined })
    const gid = await createCalEvent(gcal, ev.calendarId)
    await supabase.from('cal_events').insert({
      user_id: user.id, title: ev.title, date: ev.date,
      start_time: ev.allDay ? null : ev.startTime, end_time: ev.allDay ? null : ev.endTime,
      location: ev.location || null, notes: ev.notes || null, google_event_id: gid,
    })
    await loadData()
  }

  async function handleDeleteCustomEvent(ev: CalEvent) {
    if (!ev.id) return
    if (ev.googleEventId) await deleteCalEvent(ev.googleEventId)
    await supabase.from('cal_events').delete().eq('id', ev.id)
    await loadData()
  }

  // ── Grid helpers ──────────────────────────────────────────────────────────
  const gridDays    = getDaysInMonth(gridYear, gridMonth)
  const firstDay    = new Date(gridYear, gridMonth, 1).getDay()
  const gridCells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: gridDays }, (_, i) => i + 1)]
  while (gridCells.length % 7 !== 0) gridCells.push(null)
  const gridMonthLbl = new Date(gridYear, gridMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const gds = (d: number) => `${gridYear}-${String(gridMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

  function goToPrev() { if (gridMonth === 0) { setGridMonth(11); setGridYear(y => y - 1) } else setGridMonth(m => m - 1); setSelected(null) }
  function goToNext() { if (gridMonth === 11) { setGridMonth(0);  setGridYear(y => y + 1) } else setGridMonth(m => m + 1); setSelected(null) }
  function goToToday() { setGridYear(today.getFullYear()); setGridMonth(today.getMonth()); setSelected(todayStr) }

  const selEvents = selected ? (visibleMap[selected] ?? []) : []
  const selLabel  = selected ? new Date(selected + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : null

  // ── Detail mode: scroll to today on mount ─────────────────────────────────
  useEffect(() => {
    if (viewMode !== 'detail') return
    const t = setTimeout(() => {
      const el = dayRefs.current.get(todayStr)
      const sc = scrollRef.current
      if (!el || !sc) return
      const cr = sc.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      sc.scrollTop += er.top - cr.top - 56
    }, 100)
    return () => clearTimeout(t)
  }, [viewMode, todayStr])

  // ── Infinite scroll: append at bottom ────────────────────────────────────
  useEffect(() => {
    if (viewMode !== 'detail') return
    const sc  = scrollRef.current
    const bot = botSentRef.current
    if (!sc || !bot) return

    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || loadingMore.current) return
      loadingMore.current = true
      setMonths(prev => {
        const last = prev[prev.length - 1]
        return [...prev, ...[1, 2, 3, 4].map(i => addMonths(last.year, last.month, i))]
      })
      setTimeout(() => { loadingMore.current = false }, 600)
    }, { root: sc, rootMargin: '0px 0px 400px 0px', threshold: 0 })

    obs.observe(bot)
    return () => obs.disconnect()
  }, [viewMode])

  // ── Infinite scroll: prepend at top (with scroll anchor correction) ───────
  useEffect(() => {
    if (viewMode !== 'detail') return
    const sc  = scrollRef.current
    const top = topSentRef.current
    if (!sc || !top) return

    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || loadingMore.current) return
      loadingMore.current = true
      const prevH   = sc.scrollHeight
      const prevTop = sc.scrollTop
      setMonths(prev => {
        const first = prev[0]
        return [[4, 3, 2, 1].map(i => addMonths(first.year, first.month, -i)), prev].flat()
      })
      // Two rAF: first fires after React re-renders, second after paint
      requestAnimationFrame(() => requestAnimationFrame(() => {
        sc.scrollTop = prevTop + (sc.scrollHeight - prevH)
        loadingMore.current = false
      }))
    }, { root: sc, rootMargin: '400px 0px 0px 0px', threshold: 0 })

    obs.observe(top)
    return () => obs.disconnect()
  }, [viewMode])

  // ═════════════════════════════════════════════════════════════════════════
  // GRID MODE
  // ═════════════════════════════════════════════════════════════════════════
  if (viewMode === 'grid') return (
    <>
    <div className="min-h-screen bg-bg-base tab-enter flex flex-col">
      <PullIndicator distance={pullDist} threshold={pullThreshold} refreshing={pullRefreshing} />

      <div className="px-5 pb-4" style={{ paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 44px) + 12px)' }}>
        <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">Schedule</p>
        <div className="flex items-center justify-between">
          <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Calendar</h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('detail')} className="w-9 h-9 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center select-none">
              <AlignJustify size={15} className="text-ink-muted" />
            </button>
            <button onClick={() => setSettingsOpen(true)} className="w-9 h-9 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center select-none">
              <SlidersHorizontal size={15} className="text-ink-muted" />
            </button>
            <button onClick={() => setAddOpen(true)} className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center select-none">
              <Plus size={18} className="text-white" />
            </button>
            <button onClick={goToPrev} className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none">‹</button>
            <button onClick={goToNext} className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none">›</button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-[18px] font-semibold text-ink">{gridMonthLbl}</p>
          <button onClick={goToToday} className="text-[11px] font-medium text-gold select-none">Today</button>
        </div>
      </div>

      <div className="grid grid-cols-7 px-3 mb-1">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="text-center text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 px-3 gap-y-0.5">
        {gridCells.map((day, i) => {
          if (day === null) return <div key={i} className="h-12" />
          const ds = gds(day), dayEvs = visibleMap[ds] ?? [], isSel = selected === ds, isTod = ds === todayStr
          return (
            <button key={i} onClick={() => setSelected(isSel ? null : ds)} className="flex flex-col items-center py-1 gap-1 h-12 select-none">
              <span className={cn('w-8 h-8 flex items-center justify-center rounded-xl text-[13px] font-medium transition-all',
                isTod ? 'gradient-gold text-white font-bold' : isSel ? 'bg-bg-surface border border-white/10 text-ink' : 'text-ink-muted')}>
                {day}
              </span>
              <div className="flex gap-[3px]">
                {dayEvs.slice(0, 3).map((ev, j) => <span key={j} className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: ev.color ?? DOT_COLOR[ev.type] }} />)}
              </div>
            </button>
          )
        })}
      </div>

      {selLabel && (
        <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden mb-4">
          <div className="px-4 pt-4 pb-3 border-b border-white/[0.04] flex items-center justify-between">
            <p className="text-[18px] font-semibold text-ink">{selLabel}</p>
            <button onClick={() => setAddOpen(true)} className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center select-none"><Plus size={13} className="text-white" /></button>
          </div>
          {selEvents.length === 0
            ? <div className="py-8 text-center text-ink-faint text-[13px]">Nothing on this day.</div>
            : <div className="divide-y divide-white/[0.04]">{selEvents.map((ev, i) => <EventRow key={i} ev={ev} onDelete={handleDeleteCustomEvent} />)}</div>}
        </div>
      )}
      {!selLabel && (
        <div className="mx-4 mt-4 mb-4 bg-bg-surface border border-white/[0.06] rounded-card py-8 text-center text-ink-faint text-[13px]">
          Tap a day to see events.
        </div>
      )}
    </div>

    <AddEventSheet open={addOpen} defaultDate={selected ?? undefined} googleCals={googleCals.filter(c => prefs.googleCalendarIds.includes(c.id))} onClose={() => setAddOpen(false)} onAdd={handleAddEvent} />
    <CalendarSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} prefs={prefs} googleCals={googleCals} calsLoading={calsLoading} onSave={savePrefs} />
    </>
  )

  // ═════════════════════════════════════════════════════════════════════════
  // DETAIL MODE — Timepage infinite scroll
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <>
    {/* Fixed left-edge month label */}
    <div style={{ position: 'fixed', left: 0, top: 'env(safe-area-inset-top, 0px)', bottom: 72, width: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20, pointerEvents: 'none' }}>
      <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: 'rgba(212,175,55,0.55)', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {sideLbl}
      </span>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: '#0a0a0a' }}>

      {/* Compact header */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-end', paddingTop: 'calc(max(env(safe-area-inset-top, 0px), 44px) + 12px)', paddingBottom: 10, paddingLeft: 28, paddingRight: 14, gap: 6, background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#f0f0f8', flex: 1, letterSpacing: '-0.03em', margin: 0 }}>Calendar</h1>
        <button onClick={() => { const el = dayRefs.current.get(todayStr); const sc = scrollRef.current; if (el && sc) { const cr = sc.getBoundingClientRect(); const er = el.getBoundingClientRect(); sc.scrollTo({ top: sc.scrollTop + er.top - cr.top - 56, behavior: 'smooth' }) } }}
          style={{ height: 30, padding: '0 10px', borderRadius: 15, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: '#D4AF37', fontWeight: 600, flexShrink: 0, cursor: 'pointer' }}>
          Today
        </button>
        <button onClick={() => setSettingsOpen(true)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
          <SlidersHorizontal size={13} color="rgba(255,255,255,0.45)" />
        </button>
        <button onClick={() => setViewMode('grid')} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
          <LayoutGrid size={13} color="#D4AF37" />
        </button>
        <button onClick={() => setAddOpen(true)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#F7DF9E,#D4AF37,#A47F23)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
          <Plus size={15} color="white" />
        </button>
      </div>

      {/* Scroll container — position:relative makes it the offsetParent for offsetTop reads */}
      <div ref={scrollRef} onScroll={handleDetailScroll} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
        <div ref={topSentRef} style={{ height: 1 }} />

        {months.map(({ year: y, month: m }) => {
          const dim = getDaysInMonth(y, m)
          return Array.from({ length: dim }, (_, i) => {
            const day    = i + 1
            const ds     = toDateStr(y, m, day)
            const isTod  = ds === todayStr
            const events = visibleMap[ds] ?? []
            const abbr   = new Date(y, m, day).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()

            // Stable alternating stripe: days since Unix epoch mod 2
            const stripe = Math.floor(new Date(y, m, day).getTime() / 86400000) % 2 === 0

            return (
              <div
                key={ds}
                ref={el => { if (el) dayRefs.current.set(ds, el); else dayRefs.current.delete(ds) }}
                data-day={ds}
                style={{ display: 'flex', alignItems: 'stretch', paddingLeft: 20, background: stripe ? '#141414' : '#1a1a1a' }}
              >
                {/* Day label column */}
                <div style={{ width: 44, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 11, paddingBottom: 8 }}>
                  <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 9, letterSpacing: '0.09em', fontWeight: 600, textTransform: 'uppercase', color: isTod ? '#c9a84c' : 'rgba(255,255,255,0.18)', lineHeight: 1.1, userSelect: 'none', whiteSpace: 'nowrap' }}>
                    {abbr}&thinsp;{day}
                  </span>
                </div>

                {/* Thin vertical rule */}
                <div style={{ width: 1, flexShrink: 0, background: isTod ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.035)', marginTop: 8, marginBottom: 8 }} />

                {/* Events */}
                <div style={{ flex: 1, paddingLeft: 12, paddingRight: 16, paddingTop: 9, paddingBottom: 9, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {events.length === 0
                    ? <div style={{ height: 24 }} />
                    : events.map((ev, idx) => {
                        const tl  = getTimeLabel(ev)
                        const amt = ev.type !== 'custom' && ev.type !== 'google' ? ev.amount : null
                        const dot = ev.color ?? DETAIL_DOT[ev.type]
                        return (
                          <button key={idx} onClick={() => { setDetailEvent(ev); navigator.vibrate?.(6) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 0, width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', minHeight: 22, textAlign: 'left' }}>
                            {/* Time */}
                            {tl && (
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-dm-mono,monospace)', letterSpacing: '0.02em', flexShrink: 0, marginRight: 7, whiteSpace: 'nowrap' }}>
                                {tl}
                              </span>
                            )}
                            {/* Dot */}
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: dot, flexShrink: 0, marginRight: 7 }} />
                            {/* Title */}
                            <span style={{ fontSize: 14, fontWeight: 400, color: isTod ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.78)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {ev.title}
                            </span>
                            {/* Amount */}
                            {amt && (
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-dm-mono,monospace)', flexShrink: 0, marginLeft: 8 }}>
                                {amt}
                              </span>
                            )}
                          </button>
                        )
                      })
                  }
                </div>
              </div>
            )
          })
        })}

        <div ref={botSentRef} style={{ height: 1 }} />
        <div style={{ height: 96 }} />
      </div>
    </div>

    <EventDetailSheet event={detailEvent} onClose={() => setDetailEvent(null)} onDelete={handleDeleteCustomEvent} />
    <AddEventSheet open={addOpen} defaultDate={undefined} googleCals={googleCals.filter(c => prefs.googleCalendarIds.includes(c.id))} onClose={() => setAddOpen(false)} onAdd={handleAddEvent} />
    <CalendarSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} prefs={prefs} googleCals={googleCals} calsLoading={calsLoading} onSave={savePrefs} />
    </>
  )
}
