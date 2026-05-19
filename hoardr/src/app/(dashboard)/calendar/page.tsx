'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { Plus, Trash2, SlidersHorizontal, Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, type LucideIcon } from 'lucide-react'
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
  return `${h % 12 || 12}:${String(min).padStart(2, '0')}${h >= 12 ? 'PM' : 'AM'}`
}
// Returns full FROM – TO range for expanded day view
function getTimeRange(ev: CalEvent): string | null {
  if (ev.type !== 'custom' && ev.type !== 'google') return null
  if (!ev.amount) return null
  const parts = ev.amount.split(' – ').map(t => t.trim()).filter(Boolean)
    .map(t => /^\d{2}:\d{2}$/.test(t) ? fmt12(t) : t)
  return parts.length ? parts.join(' – ') : null
}

interface DayWeather { high: number; low: number; code: number; precipProb: number; wind: number }
function getWeatherInfo(code: number): { Icon: LucideIcon; desc: string } {
  if (code === 0)  return { Icon: Sun,            desc: 'Clear' }
  if (code <= 2)   return { Icon: CloudSun,        desc: 'Partly cloudy' }
  if (code === 3)  return { Icon: Cloud,            desc: 'Overcast' }
  if (code <= 48)  return { Icon: CloudFog,         desc: 'Foggy' }
  if (code <= 55)  return { Icon: CloudDrizzle,     desc: 'Drizzle' }
  if (code <= 65)  return { Icon: CloudRain,        desc: 'Rain' }
  if (code <= 77)  return { Icon: CloudSnow,        desc: 'Snow' }
  if (code <= 82)  return { Icon: CloudRain,        desc: 'Showers' }
  return           { Icon: CloudLightning,   desc: 'Thunderstorm' }
}
function monthLabel(y: number, m: number) {
  return new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
}

const SAFE_TOP = 'calc(max(env(safe-area-inset-top, 0px), 44px) + 12px)'

// ── Grid event row ─────────────────────────────────────────────────────────────
function EventRow({ ev, onDelete }: { ev: CalEvent; onDelete: (ev: CalEvent) => void }) {
  // For custom/google events, ev.amount holds raw "HH:MM – HH:MM" — convert to AM/PM
  const displayAmt = ev.amount && (ev.type === 'custom' || ev.type === 'google')
    ? ev.amount.split(' – ').map(t => /^\d{2}:\d{2}$/.test(t.trim()) ? fmt12(t.trim()) : t).join(' – ')
    : ev.amount
  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: ev.color ?? DOT_COLOR[ev.type] }} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-ink">{ev.title}</p>
        {ev.location && <p className="text-[11px] text-ink-muted mt-0.5 truncate">📍 {ev.location}</p>}
        {ev.notes    && <p className="text-[11px] text-ink-faint mt-0.5 line-clamp-2">{ev.notes}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {displayAmt && <span className={cn('text-[11px] font-semibold font-mono px-2 py-0.5 rounded-md', EVENT_COLOR[ev.type])}>{displayAmt}</span>}
        {ev.type === 'custom' && (
          <button onClick={() => onDelete(ev)} className="w-7 h-7 rounded-full bg-bg-overlay flex items-center justify-center" aria-label="Delete event">
            <Trash2 size={12} className="text-ruby" />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Expanded day event card (View 3 — Timepage style, no cards) ──────────────
function DayEventCard({ ev, dot, timeRange, amt, onDelete }: {
  ev: CalEvent; dot: string; timeRange: string | null; amt: string | null
  onDelete: (ev: CalEvent) => void
}) {
  const M = 'var(--font-montserrat)'
  return (
    <div style={{ paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
      {/* Title + dot — centered as a group */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ fontSize: 18, fontWeight: 500, color: 'rgba(255,255,255,0.9)', fontFamily: M, lineHeight: 1.3 }}>{ev.title}</span>
        {ev.type === 'custom' && (
          <button onClick={() => onDelete(ev)}
            style={{ background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer', opacity: 0.4, flexShrink: 0 }}>
            <Trash2 size={13} color="#ef4444" />
          </button>
        )}
      </div>
      {/* Sub-info — centered below */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {timeRange   && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.36)', fontFamily: M }}>{timeRange}</span>}
        {amt         && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.36)', fontFamily: M }}>{amt}</span>}
        {ev.location && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.28)', fontFamily: M }}>{ev.location}</span>}
        {ev.notes    && <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.22)', fontFamily: M, lineHeight: 1.55 }}>{ev.notes}</span>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today    = useMemo(() => new Date(), [])
  const todayStr = useMemo(() => toDateStr(today.getFullYear(), today.getMonth(), today.getDate()), [today])

  // ── View state: 0=Grid 1=List 2=Day ──────────────────────────────────────
  const [viewIndex,   setViewIndex]   = useState<0 | 1 | 2>(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // Grid state
  const [gridYear,  setGridYear]  = useState(today.getFullYear())
  const [gridMonth, setGridMonth] = useState(today.getMonth())
  const [gridSel,   setGridSel]   = useState<string | null>(() => {
    const t = new Date()
    return toDateStr(t.getFullYear(), t.getMonth(), t.getDate())
  })

  // Data
  const [eventMap,    setEventMap]    = useState<Record<string, CalEvent[]>>({})
  const [googleEvMap, setGoogleEvMap] = useState<Record<string, CalEvent[]>>({})
  const [prefs,       setPrefs]       = useState<CalPrefs>(DEFAULT_PREFS)
  const [googleCals,  setGoogleCals]  = useState<GCalendar[]>([])
  const [calsLoading, setCalsLoading] = useState(false)
  const [addOpen,      setAddOpen]      = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addDate,      setAddDate]      = useState<string | undefined>()
  const [weatherMap,   setWeatherMap]   = useState<Record<string, DayWeather>>({})

  // Infinite scroll
  const [months, setMonths] = useState<MonthKey[]>(() =>
    Array.from({ length: 9 }, (_, i) => addMonths(today.getFullYear(), today.getMonth(), i - 4))
  )
  const [sideLbl, setSideLbl] = useState(() => monthLabel(today.getFullYear(), today.getMonth()))

  // iPad/Mac month grid view
  const [isLargeScreen, setIsLargeScreen] = useState(false)
  const [calView, setCalView] = useState<'list' | 'month'>('list')

  const rangeKey = useMemo(() => {
    const f = months[0], l = months[months.length - 1]
    return `${f.year}/${f.month}..${l.year}/${l.month}`
  }, [months])

  const supabase      = useMemo(() => createClient(), [])
  const loadGen       = useRef(0)
  const abortRef      = useRef<AbortController | null>(null)
  const gEvGen        = useRef(0)
  const dayRefs       = useRef(new Map<string, HTMLElement>())
  const lastHapticDay = useRef<string | null>(null)
  const scrollRef     = useRef<HTMLDivElement>(null)
  const topSentRef    = useRef<HTMLDivElement>(null)
  const botSentRef    = useRef<HTMLDivElement>(null)
  const loadingMore   = useRef(false)
  const monthsRef     = useRef(months)

  // Swipe gesture refs
  const v1Swipe        = useRef<{ x: number; y: number } | null>(null)
  const v2Swipe        = useRef<{ x: number; y: number } | null>(null)
  const v3Swipe        = useRef<{ x: number; y: number } | null>(null)
  const rowSwipe       = useRef<{ x: number; y: number; ds: string } | null>(null)
  const scrollToToday  = useRef(false)  // only center today when entering from View 1
  const suppressPrepend = useRef(false)  // block prepend rAF from clobbering scroll-to-today

  useEffect(() => { monthsRef.current = months }, [months])

  // ── Large-screen detection (iPad ≥768px, Mac ≥1024px) ────────────────────
  useEffect(() => {
    const check = () => setIsLargeScreen(window.innerWidth >= 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // ── Persist calView preference ────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('cal-view-mode') as 'list' | 'month' | null
    if (saved) setCalView(saved)
  }, [])

  function switchCalView(v: 'list' | 'month') {
    setCalView(v)
    localStorage.setItem('cal-view-mode', v)
  }

  // ── Scroll-based haptic (replaces IntersectionObserver) ──────────────────
  const handleDetailScroll = useCallback(() => {
    const sc = scrollRef.current
    if (!sc) return
    const threshold = sc.scrollTop + 120
    let found: string | null = null
    outer: for (const { year: y, month: m } of monthsRef.current) {
      const dim = getDaysInMonth(y, m)
      for (let d = 1; d <= dim; d++) {
        const ds = toDateStr(y, m, d)
        const el = dayRefs.current.get(ds)
        if (!el) continue
        const top = el.offsetTop
        if (top > threshold) break outer
        if (top + el.offsetHeight > threshold) { found = ds; break outer }
      }
    }
    if (found && found !== lastHapticDay.current) {
      lastHapticDay.current = found
      navigator.vibrate?.(8)
      const [ys, ms] = found.split('-')
      setSideLbl(monthLabel(parseInt(ys), parseInt(ms) - 1))
    }
  }, [])

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++loadGen.current
    try {
      const [{ data: exp }, { data: inc }, { data: subs }, { data: cevs }, { data: profile }] =
        await Promise.all([
          supabase.from('expenses').select('name, cost, date').abortSignal(controller.signal),
          supabase.from('income').select('name, amount, date').abortSignal(controller.signal),
          supabase.from('subscriptions').select('name, cost, next_renewal').eq('status', 'Active').abortSignal(controller.signal),
          supabase.from('cal_events').select('id, title, date, start_time, end_time, location, notes, google_event_id').order('created_at').abortSignal(controller.signal),
          supabase.from('profiles').select('calendar_prefs').abortSignal(controller.signal).single(),
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
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('loadData error:', err)
    }
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++; abortRef.current?.abort() } }, [loadData])

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,windspeed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=14`)
        .then(r => r.json())
        .then((d: { daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weathercode: number[]; precipitation_probability_max: number[]; windspeed_10m_max: number[] } }) => {
          const map: Record<string, DayWeather> = {}
          d.daily.time.forEach((date, i) => {
            map[date] = {
              high:      Math.round(d.daily.temperature_2m_max[i]),
              low:       Math.round(d.daily.temperature_2m_min[i]),
              code:      d.daily.weathercode[i],
              precipProb: Math.round(d.daily.precipitation_probability_max[i] ?? 0),
              wind:      Math.round(d.daily.windspeed_10m_max[i]),
            }
          })
          setWeatherMap(map)
        })
        .catch(() => {})
    }, () => {})
  }, [])

  useEffect(() => {
    if ((!settingsOpen && !addOpen) || googleCals.length > 0) return
    setCalsLoading(true)
    fetch('/api/calendar?action=calendars')
      .then(r => r.json()).then((d: { items?: GCalendar[] }) => setGoogleCals(d.items ?? []))
      .catch(() => {}).finally(() => setCalsLoading(false))
  }, [settingsOpen, addOpen, googleCals.length])

  useEffect(() => {
    const calIds = prefs.googleCalendarIds
    if (calIds.length === 0) { setGoogleEvMap({}); return }
    const gen = ++gEvGen.current
    const f = months[0], l = months[months.length - 1]
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

  async function savePrefs(p: CalPrefs) {
    setPrefs(p)
    await supabase.from('profiles').update({ calendar_prefs: p }).eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
  }

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
    showToast(`${ev.title} added`, { type: 'add' })
    await loadData()
  }

  function handleDeleteCustomEvent(ev: CalEvent) {
    if (!ev.id) return
    // Optimistic: remove from map so it disappears instantly
    const dayKey = selectedDay
    if (dayKey) {
      setEventMap(prev => ({
        ...prev,
        [dayKey]: (prev[dayKey] ?? []).filter(e => e.id !== ev.id),
      }))
    }
    showToast('Event deleted', {
      type: 'delete',
      undo: {
        onUndo:   () => loadData(),  // DB unchanged — re-fetch restores it
        onCommit: () => {
          if (ev.googleEventId) deleteCalEvent(ev.googleEventId)
          supabase.from('cal_events').delete().eq('id', ev.id!)
        },
      },
    })
  }

  // ── Scroll to today when entering View 2 from View 1 only ───────────────
  useEffect(() => {
    if (viewIndex !== 1 || !scrollToToday.current) return
    scrollToToday.current = false
    // Suppress the prepend observer's rAF correction — it fires when View 2
    // activates at scroll=0 and stores prevTop=0, then its rAF overwrites our
    // scroll-to-today on iOS (slower renders mean the rAF fires after us).
    suppressPrepend.current = true
    // Use manual scrollTop instead of scrollIntoView — the latter is unreliable
    // inside fixed-position containers on iOS WKWebView.
    const t = setTimeout(() => {
      const sc = scrollRef.current
      const el = dayRefs.current.get(todayStr)
      if (sc && el) {
        const cRect = sc.getBoundingClientRect()
        const eRect = el.getBoundingClientRect()
        sc.scrollTop = sc.scrollTop + eRect.top - cRect.top - sc.clientHeight / 2 + eRect.height / 2
      }
      suppressPrepend.current = false
    }, 360)
    return () => { clearTimeout(t); suppressPrepend.current = false }
  }, [viewIndex, todayStr])

  // ── Infinite scroll: append ────────────────────────────────────────────────
  useEffect(() => {
    if (viewIndex !== 1) return
    const sc = scrollRef.current, bot = botSentRef.current
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
  }, [viewIndex])

  // ── Infinite scroll: prepend ───────────────────────────────────────────────
  useEffect(() => {
    if (viewIndex !== 1) return
    const sc = scrollRef.current, top = topSentRef.current
    if (!sc || !top) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || loadingMore.current || suppressPrepend.current) return
      loadingMore.current = true
      const prevH = sc.scrollHeight, prevTop = sc.scrollTop
      setMonths(prev => {
        const first = prev[0]
        return [[4, 3, 2, 1].map(i => addMonths(first.year, first.month, -i)), prev].flat()
      })
      requestAnimationFrame(() => requestAnimationFrame(() => {
        sc.scrollTop = prevTop + (sc.scrollHeight - prevH)
        loadingMore.current = false
      }))
    }, { root: sc, rootMargin: '400px 0px 0px 0px', threshold: 0 })
    obs.observe(top)
    return () => obs.disconnect()
  }, [viewIndex])

  // ── Grid helpers ───────────────────────────────────────────────────────────
  const gridDays  = getDaysInMonth(gridYear, gridMonth)
  const firstDay  = new Date(gridYear, gridMonth, 1).getDay()
  const gridCells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: gridDays }, (_, i) => i + 1)]
  while (gridCells.length % 7 !== 0) gridCells.push(null)
  const gridMonthLbl = new Date(gridYear, gridMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const gds = (d: number) => `${gridYear}-${String(gridMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  function goToPrev() { if (gridMonth === 0) { setGridMonth(11); setGridYear(y => y - 1) } else setGridMonth(m => m - 1); setGridSel(null) }
  function goToNext() { if (gridMonth === 11) { setGridMonth(0); setGridYear(y => y + 1) } else setGridMonth(m => m + 1); setGridSel(null) }
  function goToToday() { setGridYear(today.getFullYear()); setGridMonth(today.getMonth()); setGridSel(todayStr) }
  const gridSelEvents = gridSel ? (visibleMap[gridSel] ?? []) : []
  const gridSelLabel  = gridSel ? new Date(gridSel + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : null

  // ── View 3 (Day Detail) helpers ───────────────────────────────────────────
  const dayDate      = selectedDay ? new Date(selectedDay + 'T12:00:00') : null
  const dayName      = dayDate?.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() ?? ''
  const dayNum       = dayDate?.getDate() ?? ''
  const dayMonthYr   = dayDate?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() ?? ''
  const dayEvents    = selectedDay ? (visibleMap[selectedDay] ?? []) : []

  // ── Swipe gesture handlers ─────────────────────────────────────────────────
  // View 1 → View 2: swipe left anywhere on the grid
  const v1Start = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]; v1Swipe.current = { x: t.clientX, y: t.clientY }
  }, [])
  const v1End = useCallback((e: React.TouchEvent) => {
    const s = v1Swipe.current; v1Swipe.current = null; if (!s) return
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) { scrollToToday.current = true; suppressPrepend.current = true; setViewIndex(1) }
  }, [])
  const v1MouseDown = useCallback((e: React.MouseEvent) => {
    v1Swipe.current = { x: e.clientX, y: e.clientY }
  }, [])
  const v1MouseUp = useCallback((e: React.MouseEvent) => {
    const s = v1Swipe.current; v1Swipe.current = null; if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) { scrollToToday.current = true; suppressPrepend.current = true; setViewIndex(1) }
  }, [])

  // View 2 → View 1: any right swipe (strict diagonal so vertical scroll still works)
  const v2Start = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]; v2Swipe.current = { x: t.clientX, y: t.clientY }
  }, [])
  const v2End = useCallback((e: React.TouchEvent) => {
    const s = v2Swipe.current; v2Swipe.current = null; if (!s) return
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y
    if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setViewIndex(0)
  }, [])
  const v2MouseDown = useCallback((e: React.MouseEvent) => {
    v2Swipe.current = { x: e.clientX, y: e.clientY }
  }, [])
  const v2MouseUp = useCallback((e: React.MouseEvent) => {
    const s = v2Swipe.current; v2Swipe.current = null; if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setViewIndex(0)
  }, [])

  // View 2 row → View 3: swipe left on a day row
  const rowStart = useCallback((e: React.TouchEvent, ds: string) => {
    const t = e.touches[0]; rowSwipe.current = { x: t.clientX, y: t.clientY, ds }
  }, [])
  const rowEnd = useCallback((e: React.TouchEvent) => {
    const s = rowSwipe.current; rowSwipe.current = null; if (!s) return
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setSelectedDay(s.ds); setViewIndex(2)
    }
  }, [])
  const rowMouseDown = useCallback((e: React.MouseEvent, ds: string) => {
    rowSwipe.current = { x: e.clientX, y: e.clientY, ds }
  }, [])
  const rowMouseUp = useCallback((e: React.MouseEvent) => {
    const s = rowSwipe.current; rowSwipe.current = null; if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setSelectedDay(s.ds); setViewIndex(2)
    }
  }, [])

  // View 3 → View 2: any right swipe (no edge restriction — touch-action:pan-y handles browser)
  const v3Start = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]; v3Swipe.current = { x: t.clientX, y: t.clientY }
  }, [])
  const v3End = useCallback((e: React.TouchEvent) => {
    const s = v3Swipe.current; v3Swipe.current = null; if (!s) return
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y
    if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setViewIndex(1)
  }, [])
  const v3MouseDown = useCallback((e: React.MouseEvent) => {
    v3Swipe.current = { x: e.clientX, y: e.clientY }
  }, [])
  const v3MouseUp = useCallback((e: React.MouseEvent) => {
    const s = v3Swipe.current; v3Swipe.current = null; if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setViewIndex(1)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
    {/* Gold month label pinned to left viewport edge — shown only in View 2 */}
    <div style={{ position: 'fixed', left: 6, top: 'env(safe-area-inset-top, 0px)', bottom: 72, width: 20, zIndex: 30, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: viewIndex === 1 ? 1 : 0, transition: 'opacity 0.25s ease' }}>
      <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 800, color: 'rgba(212,175,55,0.65)', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {sideLbl}
      </span>
    </div>

    {/* Root — fixed viewport clip */}
    <div className="tab-enter" style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>

      {/* ── Sliding rail (3 panels × 100vw) ─────────────────────────────── */}
      <div style={{ display: 'flex', width: '300vw', height: '100%', transform: `translateX(-${viewIndex * 100}vw)`, transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)', willChange: 'transform' }}>

        {/* ═══════════════════════════════════════════════════════════════
            VIEW 1 — Monthly Grid
            Swipe left anywhere → View 2
        ═══════════════════════════════════════════════════════════════ */}
        <div style={{ width: '100vw', height: '100%', flex: 'none', overflowY: 'auto', background: '#080810', cursor: 'grab', userSelect: 'none' }}
          onTouchStart={v1Start} onTouchEnd={v1End}
          onMouseDown={v1MouseDown} onMouseUp={v1MouseUp} onMouseLeave={() => { v1Swipe.current = null }}>

          <div style={{ paddingTop: SAFE_TOP }} className="bg-bg-base">
            {/* Header */}
            <div className="px-5 pb-4 pt-0">
              <div className="flex items-center justify-end gap-2 mb-2">
                <button onClick={() => setSettingsOpen(true)} className="w-9 h-9 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center select-none">
                  <SlidersHorizontal size={15} className="text-ink-muted" />
                </button>
                <button onClick={() => setAddOpen(true)} className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center select-none">
                  <Plus size={18} className="text-white" />
                </button>
                <button onClick={goToPrev} className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none">‹</button>
                <button onClick={goToNext} className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none">›</button>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-[18px] font-semibold text-ink">{gridMonthLbl}</p>
                <button onClick={goToToday} className="text-[11px] font-medium text-gold select-none">Today</button>
              </div>
            </div>

            {/* Day-of-week row */}
            <div className="grid grid-cols-7 px-3 mb-1">
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <div key={i} className="text-center text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint py-1">{d}</div>
              ))}
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-7 px-3 gap-y-0.5">
              {gridCells.map((day, i) => {
                if (day === null) return <div key={i} className="h-12" />
                const ds = gds(day), evs = visibleMap[ds] ?? [], isSel = gridSel === ds, isTod = ds === todayStr
                return (
                  <button key={i} onClick={() => setGridSel(isSel ? null : ds)} className="flex flex-col items-center py-1 gap-1 h-12 select-none">
                    <span className={cn('w-8 h-8 flex items-center justify-center rounded-xl text-[13px] font-medium transition-all',
                      isTod ? 'gradient-gold text-white font-bold' : isSel ? 'bg-bg-surface border border-white/10 text-ink' : 'text-ink-muted')}>
                      {day}
                    </span>
                    <div className="flex gap-[3px]">
                      {evs.slice(0, 3).map((ev, j) => <span key={j} className="w-[5px] h-[5px] rounded-full flex-shrink-0" style={{ background: ev.color ?? DOT_COLOR[ev.type] }} />)}
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Selected day panel */}
            {gridSelLabel && (
              <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden mb-4">
                <div className="px-4 pt-4 pb-3 border-b border-white/[0.04] flex items-center justify-between">
                  <p className="text-[18px] font-semibold text-ink">{gridSelLabel}</p>
                  <button onClick={() => setAddOpen(true)} className="w-7 h-7 rounded-full gradient-gold flex items-center justify-center select-none"><Plus size={13} className="text-white" /></button>
                </div>
                {gridSelEvents.length === 0
                  ? <div className="py-8 text-center text-ink-faint text-[13px]">Nothing on this day.</div>
                  : <div className="divide-y divide-white/[0.04]">{gridSelEvents.map((ev, i) => <EventRow key={i} ev={ev} onDelete={handleDeleteCustomEvent} />)}</div>}
              </div>
            )}
            {!gridSelLabel && (
              <div className="mx-4 mt-4 mb-4 bg-bg-surface border border-white/[0.06] rounded-card py-6 text-center text-ink-faint text-[13px]">
                Swipe left for list · Tap a day for events
              </div>
            )}

            {/* Nav bar clearance */}
            <div style={{ height: 88 }} />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            VIEW 2 — Infinite Scroll List
            Right swipe anywhere → View 1
            Row swipe left       → View 3
        ═══════════════════════════════════════════════════════════════ */}
        <div style={{ width: '100vw', height: '100%', flex: 'none', background: '#0a0a0a', display: 'flex', flexDirection: 'column', touchAction: 'pan-y', userSelect: 'none' }}
          onTouchStart={v2Start} onTouchEnd={v2End}
          onMouseDown={v2MouseDown} onMouseUp={v2MouseUp} onMouseLeave={() => { v2Swipe.current = null }}>

          {/* Compact header */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', paddingTop: SAFE_TOP, paddingBottom: 10, paddingLeft: 14, paddingRight: 14, gap: 6, background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {/* List / Month toggle — iPad/Mac only */}
            {isLargeScreen && (
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 2, gap: 2, flexShrink: 0 }}>
                {(['list', 'month'] as const).map(v => (
                  <button key={v} onClick={() => switchCalView(v)} style={{
                    padding: '5px 14px', borderRadius: 18, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-montserrat)', letterSpacing: '0.04em',
                    background: calView === v ? 'linear-gradient(135deg,#F7DF9E,#D4AF37,#A47F23)' : 'transparent',
                    color: calView === v ? '#000' : 'rgba(255,255,255,0.4)',
                    transition: 'background 0.15s, color 0.15s',
                  }}>
                    {v === 'list' ? 'List' : 'Month'}
                  </button>
                ))}
              </div>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => {
                if (isLargeScreen && calView === 'month') { goToToday() } else {
                  const sc = scrollRef.current; const el = dayRefs.current.get(todayStr)
                  if (sc && el) { const cRect = sc.getBoundingClientRect(); const eRect = el.getBoundingClientRect(); sc.scrollTop = sc.scrollTop + eRect.top - cRect.top - sc.clientHeight / 2 + eRect.height / 2 }
                }
              }}
              style={{ height: 30, padding: '0 10px', borderRadius: 15, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', fontSize: 11, color: '#D4AF37', fontWeight: 600, flexShrink: 0, cursor: 'pointer' }}>
              Today
            </button>
            <button onClick={() => setSettingsOpen(true)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
              <SlidersHorizontal size={13} color="rgba(255,255,255,0.45)" />
            </button>
            <button onClick={() => setAddOpen(true)} style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#F7DF9E,#D4AF37,#A47F23)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}>
              <Plus size={15} color="white" />
            </button>
          </div>

          {/* ── Full Month Grid (iPad/Mac only) ─────────────────────────── */}
          {isLargeScreen && calView === 'month' && (() => {
            const BS = 'var(--font-big-shoulders)'
            const M  = 'var(--font-montserrat)'
            const dim = getDaysInMonth(gridYear, gridMonth)
            const firstDow = new Date(gridYear, gridMonth, 1).getDay()
            const prevM = gridMonth === 0 ? 11 : gridMonth - 1
            const prevY = gridMonth === 0 ? gridYear - 1 : gridYear
            const prevDim = getDaysInMonth(prevY, prevM)
            const nextM = gridMonth === 11 ? 0 : gridMonth + 1
            const nextY = gridMonth === 11 ? gridYear + 1 : gridYear
            type Cell = { day: number; month: number; year: number; current: boolean }
            const cells: Cell[] = []
            for (let i = firstDow - 1; i >= 0; i--) cells.push({ day: prevDim - i, month: prevM, year: prevY, current: false })
            for (let d = 1; d <= dim; d++) cells.push({ day: d, month: gridMonth, year: gridYear, current: true })
            while (cells.length < 42) { const d = cells.length - firstDow - dim + 1; cells.push({ day: d, month: nextM, year: nextY, current: false }) }
            const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
            return (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0D0D0D' }}>
                {/* Month title + prev/next */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px 10px', gap: 10, flexShrink: 0 }}>
                  <button onClick={goToPrev} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#C9A84C', fontSize: 18, lineHeight: 1 }}>‹</button>
                  <span style={{ flex: 1, fontSize: 26, fontWeight: 800, color: '#C9A84C', fontFamily: BS, letterSpacing: '-0.01em' }}>
                    {new Date(gridYear, gridMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()}
                  </span>
                  <button onClick={goToNext} style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.07)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#C9A84C', fontSize: 18, lineHeight: 1 }}>›</button>
                </div>
                {/* Day-of-week header */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 8px', flexShrink: 0 }}>
                  {DAYS.map(d => (
                    <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#C9A84C', padding: '4px 0 6px', fontFamily: M }}>
                      {d}
                    </div>
                  ))}
                </div>
                {/* Grid */}
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridTemplateRows: 'repeat(6,1fr)', gap: 1, background: 'rgba(255,255,255,0.04)', padding: '0 8px 8px', overflow: 'hidden' }}>
                  {cells.map((cell, idx) => {
                    const ds      = toDateStr(cell.year, cell.month, cell.day)
                    const isToday = ds === todayStr
                    const events  = cell.current ? (visibleMap[ds] ?? []) : []
                    const rowOdd  = Math.floor(idx / 7) % 2 === 1
                    return (
                      <div
                        key={idx}
                        onClick={() => { if (cell.current) { setSelectedDay(ds); setViewIndex(2); navigator.vibrate?.(6) } else if (idx < 7) { goToPrev() } else { goToNext() } }}
                        style={{ background: rowOdd ? '#151515' : '#111111', display: 'flex', flexDirection: 'column', padding: '5px 5px 4px', cursor: cell.current ? 'pointer' : 'default', overflow: 'hidden', position: 'relative' }}
                      >
                        {/* Day number */}
                        <div style={{ width: 22, height: 22, borderRadius: '50%', background: isToday ? '#C9A84C' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 3, flexShrink: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 500, color: isToday ? '#000' : cell.current ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.18)', fontFamily: M, lineHeight: 1 }}>
                            {cell.day}
                          </span>
                        </div>
                        {/* Event pills */}
                        {events.slice(0, 3).map((ev, i) => (
                          <div key={i} style={{ fontSize: 10, lineHeight: '15px', padding: '1px 5px', borderRadius: 3, marginBottom: 2, background: (ev.color ?? DOT_COLOR[ev.type]) + '28', color: ev.color ?? DOT_COLOR[ev.type], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: M, fontWeight: 500, flexShrink: 0 }}>
                            {ev.title}
                          </div>
                        ))}
                        {events.length > 3 && (
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: M, flexShrink: 0 }}>+{events.length - 3} more</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* ── Infinite Scroll List ─────────────────────────────────────── */}
          {(!isLargeScreen || calView === 'list') && (
          <div ref={scrollRef} onScroll={handleDetailScroll}
            style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
            <div ref={topSentRef} style={{ height: 1 }} />

            {months.map(({ year: y, month: m }) => {
              const dim = getDaysInMonth(y, m)
              return Array.from({ length: dim }, (_, i) => {
                const day    = i + 1
                const ds     = toDateStr(y, m, day)
                const isTod  = ds === todayStr
                const events = visibleMap[ds] ?? []
                const abbr   = new Date(y, m, day).toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
                const stripe = Math.floor(new Date(y, m, day).getTime() / 86400000) % 2 === 0

                return (
                  <div
                    key={ds}
                    ref={el => { if (el) dayRefs.current.set(ds, el); else dayRefs.current.delete(ds) }}
                    data-day={ds}
                    onTouchStart={e => rowStart(e, ds)}
                    onTouchEnd={rowEnd}
                    onMouseDown={e => rowMouseDown(e, ds)}
                    onMouseUp={rowMouseUp}
                    onMouseLeave={() => { rowSwipe.current = null }}
                    style={{ display: 'flex', alignItems: 'stretch', paddingLeft: 20, background: '#111111', cursor: 'grab' }}
                  >
                    {/* Day label — centered vertically, abbr white, number grey */}
                    <div style={{ width: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#111111' }}>
                      <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', lineHeight: 1.2, userSelect: 'none', whiteSpace: 'nowrap' }}>
                        <span style={{ color: isTod ? '#D4AF37' : 'rgba(255,255,255,0.75)', fontWeight: 700 }}>{abbr}</span>
                        <span style={{ color: isTod ? '#c9a84c' : 'rgba(255,255,255,0.25)', fontWeight: 500 }}>{' '}{day}</span>
                      </span>
                    </div>

                    {/* Vertical rule */}
                    <div style={{ width: 1, flexShrink: 0, background: isTod ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.04)', marginTop: 8, marginBottom: 8 }} />

                    {/* Events — min height keeps blank tap area; tap blank area = add event */}
                    <div onClick={e => { if ((e.target as Element).closest('button')) return; setAddDate(ds); setAddOpen(true) }}
                      style={{ flex: 1, paddingLeft: 12, paddingRight: 14, paddingTop: 6, paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 112, background: stripe ? '#171717' : '#1e1e1e', cursor: 'text' }}>
                      {events.map((ev, idx) => {
                        const bar = ev.color ?? DETAIL_DOT[ev.type]
                        const M   = 'var(--font-montserrat)'
                        // Row 2: time range for custom/google, amount for financial types
                        const row2: string | null = (ev.type === 'custom' || ev.type === 'google')
                          ? (ev.amount ? getTimeRange(ev) : 'ALL DAY')
                          : (ev.amount || null)
                        return (
                          <button key={idx} onClick={() => { setSelectedDay(ds); setViewIndex(2); navigator.vibrate?.(6) }}
                            style={{ display: 'flex', alignItems: 'stretch', width: '100%', background: 'none', border: 'none', padding: '10px 0', cursor: 'pointer', textAlign: 'left', gap: 9 }}>
                            {/* Vertical colored bar */}
                            <div style={{ width: 3, borderRadius: 2, background: bar, flexShrink: 0 }} />
                            {/* Text content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: 14, fontWeight: 500, color: isTod ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.82)', fontFamily: M, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.35 }}>
                                {ev.title}
                              </p>
                              {row2 && (
                                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', fontFamily: M, margin: '3px 0 0', lineHeight: 1.3 }}>
                                  {row2}
                                </p>
                              )}
                              {ev.location && (
                                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.26)', fontFamily: M, margin: '2px 0 0', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {ev.location}
                                </p>
                              )}
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })
            })}

            <div ref={botSentRef} style={{ height: 1 }} />
            <div style={{ height: 96 }} />
          </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            VIEW 3 — Daily Summary (Timepage style)
            Edge swipe right → View 2
        ═══════════════════════════════════════════════════════════════ */}
        <div style={{ width: '100vw', height: '100%', flex: 'none', background: '#080810', display: 'flex', flexDirection: 'column', touchAction: 'pan-y', userSelect: 'none' }}
          onTouchStart={v3Start} onTouchEnd={v3End}
          onMouseDown={v3MouseDown} onMouseUp={v3MouseUp} onMouseLeave={() => { v3Swipe.current = null }}>

          {/* ── Centered date header ── */}
          <div style={{ flexShrink: 0, paddingTop: SAFE_TOP, paddingBottom: 28, textAlign: 'center', background: '#080810' }}>
            <p style={{ fontSize: 10, letterSpacing: '0.26em', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(212,175,55,0.65)', margin: '0 0 2px', fontFamily: 'var(--font-montserrat)' }}>
              {dayName}
            </p>
            <p style={{ fontSize: 96, fontWeight: 800, color: 'rgba(255,255,255,0.95)', letterSpacing: '-0.02em', lineHeight: 0.95, margin: '0 0 8px', fontFamily: 'var(--font-big-shoulders)' }}>
              {dayNum}
            </p>
            <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', margin: 0, fontFamily: 'var(--font-montserrat)' }}>
              {dayMonthYr}
            </p>
          </div>

          {/* ── Airy event list ── */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {dayEvents.length === 0 ? (
              <div style={{ paddingTop: 52, textAlign: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 13, fontFamily: 'var(--font-montserrat)', letterSpacing: '0.06em' }}>
                Nothing scheduled
              </div>
            ) : (
              <div style={{ padding: '0 32px' }}>
                {dayEvents.map((ev, idx) => {
                  const timeRange = getTimeRange(ev)
                  const dot = ev.color ?? DETAIL_DOT[ev.type]
                  const amt = ev.type !== 'custom' && ev.type !== 'google' ? ev.amount : null
                  return (
                    <DayEventCard key={idx} ev={ev} dot={dot} timeRange={timeRange} amt={amt} onDelete={handleDeleteCustomEvent} />
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Weather — pinned bottom, day-specific from 14-day forecast ── */}
          {selectedDay && weatherMap[selectedDay] && (() => {
            const w = weatherMap[selectedDay]!
            const { Icon: WeatherIcon, desc } = getWeatherInfo(w.code)
            return (
              <div style={{ flexShrink: 0, textAlign: 'center', paddingTop: 18, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)', borderTop: '1px solid rgba(255,255,255,0.05)', background: '#080810' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><WeatherIcon size={26} strokeWidth={1.25} color="rgba(255,255,255,0.45)" /></div>
                <p style={{ fontSize: 30, fontWeight: 600, color: 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-montserrat)', margin: '0 0 5px', letterSpacing: '-0.01em' }}>
                  {w.high}° / {w.low}°
                </p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-montserrat)', letterSpacing: '0.04em', margin: 0 }}>
                  {desc}{w.precipProb > 0 ? ` · ${w.precipProb}% rain` : ''} · {w.wind}mph wind
                </p>
              </div>
            )
          })()}
        </div>

      </div>{/* end sliding rail */}
    </div>{/* end root */}

    <AddEventSheet open={addOpen} defaultDate={addDate ?? selectedDay ?? gridSel ?? undefined} defaultCalendarId={prefs.defaultCalendarId} googleCals={googleCals.filter(c => prefs.googleCalendarIds.includes(c.id))} onClose={() => { setAddOpen(false); setTimeout(() => setAddDate(undefined), 300) }} onAdd={handleAddEvent} />
    <CalendarSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} prefs={prefs} googleCals={googleCals} calsLoading={calsLoading} onSave={savePrefs} />
    </>
  )
}
