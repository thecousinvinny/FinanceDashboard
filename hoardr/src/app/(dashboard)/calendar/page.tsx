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
  endDate?:       string  // inclusive end date for multi-day all-day events (Google Calendar only)
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
function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to + 'T00:00:00').getTime() - new Date(from + 'T00:00:00').getTime()) / 86400000)
}
function addWeeks(weekStart: string, n: number): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const date = new Date(y, m - 1, d + n * 7)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
function weekDays(weekStart: string): string[] {
  const [y, m, d] = weekStart.split('-').map(Number)
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(y, m - 1, d + i)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  })
}
// Greedy lane allocator for multi-day spanning bars in a single week row
function allocateSpanLanes(
  spans: Array<{ startDate: string; endDate: string; ev: CalEvent }>,
  weekDates: string[]
): Array<Array<{ startCol: number; endCol: number; ev: CalEvent }>> {
  if (!spans.length) return []
  const lanes: Array<Array<{ startCol: number; endCol: number; ev: CalEvent }>> = []
  const sorted = [...spans].sort((a, b) => daysBetween(b.startDate, b.endDate) - daysBetween(a.startDate, a.endDate))
  for (const span of sorted) {
    const startCol = Math.max(0, daysBetween(weekDates[0], span.startDate))
    const endCol   = Math.min(6, daysBetween(weekDates[0], span.endDate))
    if (startCol > 6 || endCol < 0) continue
    let placed = false
    for (const lane of lanes) {
      if (!lane.some(b => b.startCol <= endCol && b.endCol >= startCol)) {
        lane.push({ startCol, endCol, ev: span.ev }); placed = true; break
      }
    }
    if (!placed) lanes.push([{ startCol, endCol, ev: span.ev }])
  }
  return lanes
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
  const monthGridRef        = useRef<HTMLDivElement>(null)
  const monthGridLoadingRef = useRef(false)
  const monthCellRefs       = useRef(new Map<string, HTMLElement>())
  const monthGridTopSentRef = useRef<HTMLDivElement>(null)
  const monthGridBotSentRef = useRef<HTMLDivElement>(null)
  const [hiddenTypes, setHiddenTypes] = useState<Set<EventType>>(new Set())
  const [sidebarYear, setSidebarYear] = useState(today.getFullYear())
  const [sidebarMonth, setSidebarMonth] = useState(today.getMonth())
  const [notionWeeks, setNotionWeeks] = useState<string[]>(() => {
    const t = new Date()
    const sun = new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay())
    const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const sunStr = fmt(sun)
    return Array.from({ length: 48 }, (_, i) => addWeeks(sunStr, i - 24))
  })
  const notionWeeksRef = useRef<string[]>([])

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
  useEffect(() => { notionWeeksRef.current = notionWeeks }, [notionWeeks])

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
          const isAllDay = !!ev.start.date && !ev.start.dateTime
          const st = isAllDay ? null : (ev.start.dateTime ? ev.start.dateTime.slice(11, 16) : null)
          const et = isAllDay ? null : (ev.end.dateTime   ? ev.end.dateTime.slice(11, 16)   : null)
          // Google uses exclusive end dates for all-day events; subtract 1 day for inclusive end
          let endDate: string | undefined
          if (isAllDay && ev.end.date) {
            const d = new Date(ev.end.date + 'T00:00:00'); d.setDate(d.getDate() - 1)
            const incl = d.toISOString().slice(0, 10)
            if (incl !== date) endDate = incl
          }
          if (!map[date]) map[date] = []
          map[date].push({ id: ev.id, title: ev.summary ?? '(no title)', type: 'google', amount: st ? `${st}${et ? ` – ${et}` : ''}` : '', location: ev.location, color, endDate })
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

  const monthVisibleMap = useMemo(() => {
    if (hiddenTypes.size === 0) return visibleMap
    const m: Record<string, CalEvent[]> = {}
    for (const [date, evs] of Object.entries(visibleMap)) {
      const f = evs.filter(e => !hiddenTypes.has(e.type))
      if (f.length) m[date] = f
    }
    return m
  }, [visibleMap, hiddenTypes])

  // Multi-day events for the spanning-bar overlay in the Notion month grid
  const multiDayEvents = useMemo(() => {
    const result: Array<{ startDate: string; endDate: string; ev: CalEvent }> = []
    if (!prefs.visibleTypes.includes('google') || hiddenTypes.has('google')) return result
    for (const [date, evs] of Object.entries(googleEvMap)) {
      for (const ev of evs) {
        if (ev.endDate && ev.endDate > date) result.push({ startDate: date, endDate: ev.endDate, ev })
      }
    }
    return result
  }, [googleEvMap, prefs.visibleTypes, hiddenTypes])

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

  // Scroll month grid to today when entering month mode
  useEffect(() => {
    if (!isLargeScreen || calView !== 'month') return
    const t = setTimeout(() => {
      const sc = monthGridRef.current
      const el = monthCellRefs.current.get(todayStr)
      if (sc && el) {
        const cRect = sc.getBoundingClientRect()
        const eRect = el.getBoundingClientRect()
        sc.scrollTop = sc.scrollTop + eRect.top - cRect.top - 120
      }
    }, 150)
    return () => clearTimeout(t)
  }, [isLargeScreen, calView, todayStr])

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

  // ── Month grid infinite scroll: append ────────────────────────────────────
  useEffect(() => {
    if (!isLargeScreen || calView !== 'month') return
    const sc = monthGridRef.current, bot = monthGridBotSentRef.current
    if (!sc || !bot) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || monthGridLoadingRef.current) return
      monthGridLoadingRef.current = true
      setNotionWeeks(prev => {
        const last = prev[prev.length - 1]
        return [...prev, ...[1,2,3,4,5,6,7,8].map(i => addWeeks(last, i))]
      })
      setTimeout(() => { monthGridLoadingRef.current = false }, 600)
    }, { root: sc, rootMargin: '0px 0px 400px 0px', threshold: 0 })
    obs.observe(bot)
    return () => obs.disconnect()
  }, [isLargeScreen, calView])

  // ── Month grid infinite scroll: prepend ───────────────────────────────────
  useEffect(() => {
    if (!isLargeScreen || calView !== 'month') return
    const sc = monthGridRef.current, top = monthGridTopSentRef.current
    if (!sc || !top) return
    const obs = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting || monthGridLoadingRef.current) return
      monthGridLoadingRef.current = true
      const prevH = sc.scrollHeight, prevTop = sc.scrollTop
      setNotionWeeks(prev => {
        const first = prev[0]
        return [[8,7,6,5,4,3,2,1].map(i => addWeeks(first, -i)), prev].flat()
      })
      requestAnimationFrame(() => requestAnimationFrame(() => {
        sc.scrollTop = prevTop + (sc.scrollHeight - prevH)
        monthGridLoadingRef.current = false
      }))
    }, { root: sc, rootMargin: '400px 0px 0px 0px', threshold: 0 })
    obs.observe(top)
    return () => obs.disconnect()
  }, [isLargeScreen, calView])

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
        <div
          style={isLargeScreen && calView === 'month'
            ? { width: '100vw', height: '100%', flex: 'none', display: 'flex', flexDirection: 'column', background: '#080810', userSelect: 'none', cursor: 'default' }
            : { width: '100vw', height: '100%', flex: 'none', overflowY: 'auto', background: '#080810', cursor: 'grab', userSelect: 'none' }}
          onTouchStart={v1Start} onTouchEnd={v1End}
          onMouseDown={isLargeScreen && calView === 'month' ? undefined : v1MouseDown}
          onMouseUp={isLargeScreen && calView === 'month' ? undefined : v1MouseUp}
          onMouseLeave={isLargeScreen && calView === 'month' ? undefined : () => { v1Swipe.current = null }}>

          {/* ── Top bar (always visible) ──────────────────────────────────── */}
          <div style={{ paddingTop: isLargeScreen && calView === 'month' ? 8 : SAFE_TOP, flexShrink: 0 }}>
            <div className="px-5 pb-3 pt-0">
              <div className="flex items-center gap-2">
                {/* List / Month toggle — iPad/Mac only */}
                {isLargeScreen && (
                  <div style={{ display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 2, gap: 2 }}>
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
                <button onClick={() => setSettingsOpen(true)} className="w-9 h-9 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center select-none">
                  <SlidersHorizontal size={15} className="text-ink-muted" />
                </button>
                <button onClick={() => setAddOpen(true)} className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center select-none">
                  <Plus size={18} className="text-white" />
                </button>
                {!(isLargeScreen && calView === 'month') && <>
                  <button onClick={goToPrev} className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none">‹</button>
                  <button onClick={goToNext} className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none">›</button>
                </>}
              </div>
              {!(isLargeScreen && calView === 'month') && (
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[18px] font-semibold text-ink">{gridMonthLbl}</p>
                  <button onClick={goToToday} className="text-[11px] font-medium text-gold select-none">Today</button>
                </div>
              )}
            </div>
          </div>

          {/* ── Notion-Style Month Grid (iPad/Mac month mode) ─────────────── */}
          {isLargeScreen && calView === 'month' && (
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

              {/* ── Sidebar (180px) ───────────────────────────────────────── */}
              <div style={{ width: 180, background: '#1a1a1a', display: 'flex', flexDirection: 'column', borderRight: '1px solid #2a2a2a', flexShrink: 0 }}>

                {/* Mini month navigator */}
                <div style={{ padding: '14px 10px 10px', flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8, gap: 2 }}>
                    <button onClick={() => { if (sidebarMonth === 0) { setSidebarMonth(11); setSidebarYear(y => y - 1) } else setSidebarMonth(m => m - 1) }}
                      style={{ width: 22, height: 22, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#C9A84C', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>‹</button>
                    <span style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#C9A84C', fontFamily: 'var(--font-montserrat)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                      {new Date(sidebarYear, sidebarMonth, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }).toUpperCase()}
                    </span>
                    <button onClick={() => { if (sidebarMonth === 11) { setSidebarMonth(0); setSidebarYear(y => y + 1) } else setSidebarMonth(m => m + 1) }}
                      style={{ width: 22, height: 22, borderRadius: '50%', background: 'transparent', border: 'none', cursor: 'pointer', color: '#C9A84C', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>›</button>
                  </div>
                  {/* DOW mini header */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 2 }}>
                    {['S','M','T','W','T','F','S'].map((d, i) => (
                      <div key={i} style={{ textAlign: 'center', fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-montserrat)', paddingBottom: 2 }}>{d}</div>
                    ))}
                  </div>
                  {/* Mini day grid */}
                  {(() => {
                    const dim      = getDaysInMonth(sidebarYear, sidebarMonth)
                    const firstDow = new Date(sidebarYear, sidebarMonth, 1).getDay()
                    const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: dim }, (_, i) => i + 1)]
                    while (cells.length % 7 !== 0) cells.push(null)
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '1px 0' }}>
                        {cells.map((day, i) => {
                          if (day === null) return <div key={i} style={{ height: 20 }} />
                          const ds      = toDateStr(sidebarYear, sidebarMonth, day)
                          const isToday = ds === todayStr
                          const hasEvs  = (monthVisibleMap[ds] ?? []).length > 0
                          return (
                            <button key={i} onClick={() => {
                              const el = monthCellRefs.current.get(ds)
                              const sc = monthGridRef.current
                              if (el && sc) {
                                const cRect = sc.getBoundingClientRect()
                                const eRect = el.getBoundingClientRect()
                                sc.scrollTop = sc.scrollTop + eRect.top - cRect.top - 120
                              }
                            }} style={{ height: 20, borderRadius: '50%', background: isToday ? '#C9A84C' : 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, position: 'relative' }}>
                              <span style={{ fontSize: 9, fontWeight: isToday ? 700 : 400, color: isToday ? '#000' : 'rgba(255,255,255,0.55)', fontFamily: 'var(--font-montserrat)' }}>{day}</span>
                              {hasEvs && !isToday && <span style={{ position: 'absolute', bottom: 1, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: '#C9A84C', opacity: 0.5 }} />}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })()}
                  {/* Today button */}
                  <button onClick={() => {
                    setSidebarYear(today.getFullYear()); setSidebarMonth(today.getMonth())
                    const el = monthCellRefs.current.get(todayStr)
                    const sc = monthGridRef.current
                    if (el && sc) {
                      const cRect = sc.getBoundingClientRect()
                      const eRect = el.getBoundingClientRect()
                      sc.scrollTop = sc.scrollTop + eRect.top - cRect.top - 120
                    }
                  }} style={{ marginTop: 8, width: '100%', height: 26, borderRadius: 13, background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.2)', cursor: 'pointer', fontSize: 10, fontWeight: 600, color: '#D4AF37', fontFamily: 'var(--font-montserrat)', letterSpacing: '0.04em' }}>
                    Today
                  </button>
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: '#2a2a2a', flexShrink: 0 }} />

                {/* Calendar legend toggles */}
                <div style={{ padding: '12px 10px 8px', flexShrink: 0 }}>
                  <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 8, fontFamily: 'var(--font-montserrat)' }}>CALENDARS</p>
                  {([
                    { type: 'expense' as EventType, label: 'Expenses',      color: DOT_COLOR.expense },
                    { type: 'income'  as EventType, label: 'Income',        color: DOT_COLOR.income  },
                    { type: 'sub'     as EventType, label: 'Subscriptions', color: DOT_COLOR.sub     },
                    { type: 'custom'  as EventType, label: 'Events',        color: DOT_COLOR.custom  },
                    { type: 'google'  as EventType, label: 'Google',        color: DOT_COLOR.google  },
                  ].map(item => {
                    const hidden = hiddenTypes.has(item.type)
                    return (
                      <button key={item.type} onClick={() => setHiddenTypes(prev => {
                        const next = new Set(prev); if (next.has(item.type)) next.delete(item.type); else next.add(item.type); return next
                      })} style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', textAlign: 'left' }}>
                        <span style={{ width: 9, height: 9, borderRadius: '50%', background: hidden ? 'transparent' : item.color, border: `1.5px solid ${item.color}`, flexShrink: 0, opacity: hidden ? 0.4 : 1, transition: 'all 0.15s' }} />
                        <span style={{ fontSize: 11, color: hidden ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.7)', fontFamily: 'var(--font-montserrat)', fontWeight: 500, transition: 'color 0.15s' }}>
                          {item.label}
                        </span>
                      </button>
                    )
                  }))}
                </div>

                <div style={{ flex: 1 }} />

                {/* Add Calendar */}
                <div style={{ padding: '8px 10px 16px', flexShrink: 0 }}>
                  <button onClick={() => setSettingsOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, cursor: 'pointer', padding: '7px 8px' }}>
                    <Plus size={11} color="rgba(255,255,255,0.35)" />
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-montserrat)', fontWeight: 500 }}>Add Calendar</span>
                  </button>
                </div>
              </div>

              {/* ── Main Notion grid ──────────────────────────────────────── */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: '#0d0d0d' }}>
                {/* Sticky DOW header */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: '#0d0d0d', borderBottom: '1px solid #2a2a2a', flexShrink: 0 }}>
                  {['SUN','MON','TUE','WED','THU','FRI','SAT'].map(d => (
                    <div key={d} style={{ textAlign: 'center', padding: '4px 0 3px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#C9A84C', fontFamily: 'var(--font-montserrat)' }}>{d}</div>
                  ))}
                </div>
                {/* Scrollable months */}
                <div ref={monthGridRef} style={{ flex: 1, overflowY: 'auto', background: '#0d0d0d', position: 'relative' }}>
                  <div ref={monthGridTopSentRef} style={{ height: 1 }} />
                  {notionWeeks.map(weekStart => {
                    const days      = weekDays(weekStart)
                    const weekSpans = multiDayEvents.filter(s => s.startDate <= days[6] && s.endDate >= days[0])
                    const spanLanes = allocateSpanLanes(weekSpans, days)
                    const SPAN_H = 18, SPAN_GAP = 2, DATE_H = 32
                    const spanAreaH = spanLanes.length * (SPAN_H + SPAN_GAP)
                    return (
                      <div key={weekStart} style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid #2a2a2a' }}>
                        {days.map((ds, ci) => {
                          const parts       = ds.split('-').map(Number)
                          const [cy, cm, cd] = parts
                          const isToday      = ds === todayStr
                          const isMonthStart = cd === 1
                          const allEvs       = monthVisibleMap[ds] ?? []
                          const singleEvs    = allEvs.filter(ev => !ev.endDate)
                          const allDayEvs    = singleEvs.filter(ev => (ev.type === 'custom' || ev.type === 'google') && !ev.amount)
                          const timedEvs     = singleEvs.filter(ev => !((ev.type === 'custom' || ev.type === 'google') && !ev.amount))
                          const shownAllDay  = Math.min(allDayEvs.length, 2)
                          const shownTimed   = Math.min(timedEvs.length, Math.max(0, 4 - shownAllDay))
                          const overflow     = singleEvs.length - shownAllDay - shownTimed
                          return (
                            <div
                              key={ds}
                              ref={el => { if (el) monthCellRefs.current.set(ds, el); else monthCellRefs.current.delete(ds) }}
                              onClick={() => { setAddDate(ds); setAddOpen(true); navigator.vibrate?.(6) }}
                              style={{ minHeight: 140, borderRight: ci < 6 ? '1px solid #2a2a2a' : 'none', padding: '5px 4px 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', background: '#0d0d0d' }}
                            >
                              {/* Date number row — month abbr inline for 1st of month */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, flexShrink: 0 }}>
                                {isMonthStart && (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: '#C9A84C', fontFamily: 'var(--font-montserrat)', letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1 }}>
                                    {new Date(cy, cm - 1, 1).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                                  </span>
                                )}
                                <div style={{ width: 22, height: 22, borderRadius: '50%', background: isToday ? '#C9A84C' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? '#000' : 'rgba(255,255,255,0.6)', fontFamily: 'var(--font-montserrat)', lineHeight: 1 }}>
                                    {cd}
                                  </span>
                                </div>
                              </div>
                              {/* Reserved height for spanning bar overlay */}
                              {spanAreaH > 0 && <div style={{ height: spanAreaH + 4, flexShrink: 0 }} />}
                              {/* All-day single-day events */}
                              {allDayEvs.slice(0, shownAllDay).map((ev, ei) => (
                                <div key={ei} style={{ background: (ev.color ?? DOT_COLOR[ev.type]) + 'DD', borderRadius: 4, padding: '0 5px', marginBottom: 2, height: 18, display: 'flex', alignItems: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                  <span style={{ fontSize: 10, color: '#fff', fontFamily: 'var(--font-montserrat)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                                </div>
                              ))}
                              {/* Timed / financial events */}
                              {timedEvs.slice(0, shownTimed).map((ev, ei) => {
                                const bar     = ev.color ?? DOT_COLOR[ev.type]
                                const timeStr = (ev.type === 'custom' || ev.type === 'google') && ev.amount
                                  ? ev.amount.split(' – ')[0].trim().replace(/^(\d{2}):(\d{2})$/, (_, hh, mm) => { const n = Number(hh); return `${n % 12 || 12}:${mm}${n >= 12 ? 'p' : 'a'}` })
                                  : null
                                return (
                                  <div key={ei} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2, height: 18, overflow: 'hidden', flexShrink: 0 }}>
                                    <div style={{ width: 3, height: '100%', borderRadius: 2, background: bar, flexShrink: 0 }} />
                                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.72)', fontFamily: 'var(--font-montserrat)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                      {timeStr && <span style={{ color: 'rgba(255,255,255,0.38)', marginRight: 3 }}>{timeStr}</span>}{ev.title}
                                    </span>
                                  </div>
                                )
                              })}
                              {overflow > 0 && (
                                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', fontFamily: 'var(--font-montserrat)', flexShrink: 0 }}>+{overflow} more</span>
                              )}
                            </div>
                          )
                        })}
                        {/* Multi-day spanning bars — absolute overlay */}
                        {spanLanes.map((lane, laneIdx) =>
                          lane.map((bar, i) => {
                            const barColor = bar.ev.color ?? DOT_COLOR[bar.ev.type]
                            return (
                              <div
                                key={`${laneIdx}-${i}`}
                                style={{
                                  position: 'absolute',
                                  top: DATE_H + laneIdx * (SPAN_H + SPAN_GAP),
                                  left:  `calc(${(bar.startCol / 7) * 100}% + 4px)`,
                                  right: `calc(${((6 - bar.endCol) / 7) * 100}% + 4px)`,
                                  height: SPAN_H,
                                  background: barColor + 'DD',
                                  borderRadius: 4,
                                  display: 'flex',
                                  alignItems: 'center',
                                  paddingLeft: 7,
                                  overflow: 'hidden',
                                  zIndex: 1,
                                  pointerEvents: 'none',
                                }}
                              >
                                <span style={{ fontSize: 10, color: '#fff', fontFamily: 'var(--font-montserrat)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                                  {bar.ev.title}
                                </span>
                              </div>
                            )
                          })
                        )}
                      </div>
                    )
                  })}
                  <div ref={monthGridBotSentRef} style={{ height: 1 }} />
                  <div style={{ height: 88 }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Compact list-mode content (phone + list mode) ─────────────── */}
          {!(isLargeScreen && calView === 'month') && (
          <div className="bg-bg-base">
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
          )}
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
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: SAFE_TOP, paddingBottom: 10, paddingLeft: 14, paddingRight: 14, gap: 6, background: '#0a0a0a', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <button onClick={() => { const sc = scrollRef.current; const el = dayRefs.current.get(todayStr); if (sc && el) { const cRect = sc.getBoundingClientRect(); const eRect = el.getBoundingClientRect(); sc.scrollTop = sc.scrollTop + eRect.top - cRect.top - sc.clientHeight / 2 + eRect.height / 2 } }}
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

          {/* ── Infinite Scroll List ─────────────────────────────────────── */}
          {(
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
