'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getWeekStartsMonday } from '@/lib/week-start'
import { cn } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { Plus, SlidersHorizontal, Eye, EyeOff, Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, type LucideIcon } from 'lucide-react'
import { EditEventSheet, type EditableEvent, type EventEdits, type RecurrenceScope } from '@/components/calendar/EditEventSheet'
import { CalendarSettingsSheet, type CalPrefs, type GCalendar } from '@/components/calendar/CalendarSettingsSheet'
import { CalendarPopover, defaultTimes, type PopoverFormData } from '@/components/calendar/CalendarPopover'
import { createCalEvent, updateCalEvent, deleteCalEvent, type GCalEvent } from '@/lib/calendar'

type EventType = 'income' | 'sub' | 'google'

interface CalEvent {
  id?:             string
  title:           string
  type:            EventType
  amount:          string
  location?:       string
  notes?:          string
  googleEventId?:  string  // Google Calendar event ID — for custom events: the paired GCal event
  calendarId?:     string  // which Google Calendar this event lives in (needed for update/delete)
  color?:          string
  endDate?:        string  // inclusive end date for multi-day all-day events (Google Calendar only)
  recurrenceRule?: string  // RRULE string (no "RRULE:" prefix); set on recurring custom events
  instanceDate?:   string  // actual date of this occurrence (equals the map key for expanded instances)
}

interface MonthKey { year: number; month: number }

// ── Color palettes ────────────────────────────────────────────────────────────
const DOT_COLOR: Record<EventType, string> = {
  income: '#4ADE80', sub: '#F36369', google: '#4285F4',
}
const DETAIL_DOT: Record<EventType, string> = {
  income: '#22c55e', sub: '#f97316', google: '#4285F4',
}
const DEFAULT_PREFS: CalPrefs = { visibleTypes: ['sub', 'income'], googleCalendarIds: [] }

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
  if (ev.type !== 'google') return null
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
const GRID_EXPANDED = 280  // px — compact month grid height in split view

// ── Notion month grid sizing constants (single source of truth) ──────────────
const MAX_VIS_EVENTS = 4   // max event rows per cell — governs both height and overflow cutoff
const EV_ROW_H  = 20       // event pill height (18) + marginBottom (2)
const DATE_ROW_H = 20      // date number row height including its marginBottom
const CELL_PAD_V = 9       // paddingTop (5) + paddingBottom (4) on each cell
const OVERFLOW_H = 14      // "+N more" text row height
const CELL_MIN_H = CELL_PAD_V + DATE_ROW_H + MAX_VIS_EVENTS * EV_ROW_H + OVERFLOW_H  // 123

// ── Grid event row ─────────────────────────────────────────────────────────────
function EventRow({ ev, onEdit }: { ev: CalEvent; onEdit: (ev: CalEvent) => void }) {
  const displayAmt = ev.amount && ev.type === 'google'
    ? ev.amount.split(' – ').map(t => /^\d{2}:\d{2}$/.test(t.trim()) ? fmt12(t.trim()) : t).join(' – ')
    : ev.amount
  const isEditable = ev.type === 'google' && !!ev.id
  const inner = (
    <>
      <span className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: ev.color ?? DOT_COLOR[ev.type] }} />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-ink">{ev.title}</p>
        {ev.location && <p className="text-[11px] text-ink-muted mt-0.5 truncate">📍 {ev.location}</p>}
        {ev.notes    && <p className="text-[11px] text-ink-faint mt-0.5 line-clamp-2">{ev.notes}</p>}
      </div>
      {displayAmt && <span className="text-[11px] font-semibold font-mono px-2 py-0.5 rounded-md flex-shrink-0 bg-blue-500/20 text-blue-300">{displayAmt}</span>}
    </>
  )
  return isEditable
    ? <button onClick={() => onEdit(ev)} className="flex items-start gap-3 px-4 py-3.5 w-full text-left bg-transparent border-none cursor-pointer hover:bg-white/[0.02] transition-colors">{inner}</button>
    : <div className="flex items-start gap-3 px-4 py-3.5">{inner}</div>
}

// ── Expanded day event card (Timepage style) ──────────────────────────────────
function DayEventCard({ ev, dot, timeRange, amt, onDelete, onEdit }: {
  ev: CalEvent; dot: string; timeRange: string | null; amt: string | null
  onDelete: (ev: CalEvent) => void
  onEdit:   (ev: CalEvent) => void
}) {
  const M = 'var(--font-montserrat)'
  const isEditable = ev.type === 'google' && !!ev.id
  const inner = (
    <>
      {/* Title + dot — centered as a group */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, marginBottom: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
        <span style={{ fontSize: 18, fontWeight: 500, color: 'var(--color-ink)', fontFamily: M, lineHeight: 1.3 }}>{ev.title}</span>
      </div>
      {/* Sub-info — centered below */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {timeRange   && <span style={{ fontSize: 13, color: 'rgb(var(--rgb-ink) / 0.36)', fontFamily: M }}>{timeRange}</span>}
        {amt         && <span style={{ fontSize: 13, color: 'rgb(var(--rgb-ink) / 0.36)', fontFamily: M }}>{amt}</span>}
        {ev.location && <span style={{ fontSize: 13, color: 'rgb(var(--rgb-ink) / 0.28)', fontFamily: M }}>{ev.location}</span>}
        {ev.notes    && <span style={{ fontSize: 12, color: 'rgb(var(--rgb-ink) / 0.22)', fontFamily: M, lineHeight: 1.55 }}>{ev.notes}</span>}
      </div>
    </>
  )
  const sharedStyle = { paddingTop: 24, paddingBottom: 24, borderBottom: '1px solid rgb(var(--rgb-ink) / 0.05)', textAlign: 'center' as const, width: '100%' }
  return isEditable
    ? <button onClick={() => onEdit(ev)} style={{ ...sharedStyle, background: 'none', border: 'none', cursor: 'pointer', display: 'block' }}>{inner}</button>
    : <div style={sharedStyle}>{inner}</div>
}

// ─────────────────────────────────────────────────────────────────────────────

const TABS     = ['/home', '/money', '/in', '/calendar', '/studio', '/settings']
const CAL_IDX  = TABS.indexOf('/calendar')
const EDGE_PX  = 35

export default function CalendarPage() {
  const router   = useRouter()
  const today    = useMemo(() => new Date(), [])
  const todayStr = useMemo(() => toDateStr(today.getFullYear(), today.getMonth(), today.getDate()), [today])

  // ── View state: 0=Split/Grid 1=Day ───────────────────────────────────────
  const [viewIndex,         setViewIndex]         = useState<0 | 1>(0)
  const [selectedDay,       setSelectedDay]       = useState<string | null>(null)
  const [gridH,             setGridH]             = useState(GRID_EXPANDED)
  const [isDraggingHandle,  setIsDraggingHandle]  = useState(false)

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
  const [settingsOpen,   setSettingsOpen]   = useState(false)
  const [weatherMap,     setWeatherMap]     = useState<Record<string, DayWeather>>({})
  const [editEvent,      setEditEvent]      = useState<EditableEvent | null>(null)
  const [popover,        setPopover]        = useState<{ anchorRect: DOMRect | null; mode: 'create' | 'edit'; data: PopoverFormData } | null>(null)
  const [popoverSaving,  setPopoverSaving]  = useState(false)
  const [dataLoaded,     setDataLoaded]     = useState(false)
  const [gRefreshKey,    setGRefreshKey]    = useState(0)

  // Infinite scroll
  const [months, setMonths] = useState<MonthKey[]>(() =>
    Array.from({ length: 6 }, (_, i) => addMonths(today.getFullYear(), today.getMonth(), i - 1))
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
  const colorInputRefs      = useRef(new Map<string, HTMLInputElement>())
  const ctxMenuRef          = useRef<HTMLDivElement>(null)
  const longPressTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hiddenTypes,       setHiddenTypes]       = useState<Set<EventType>>(new Set())
  const [hiddenGoogleCals,  setHiddenGoogleCals]  = useState<Set<string>>(() => {
    try { const s = localStorage.getItem('cal-hidden-google-cals'); return s ? new Set(JSON.parse(s)) : new Set() } catch { return new Set() }
  })
  const [typeColors,   setTypeColors]   = useState<Partial<Record<EventType, string>>>(() => {
    try { const s = localStorage.getItem('cal-type-colors'); return s ? JSON.parse(s) : {} } catch { return {} }
  })
  const [notionGridLbl, setNotionGridLbl] = useState(() =>
    new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  )
  const [hoveredSidebarRow, setHoveredSidebarRow] = useState<string | null>(null)
  const [sidebarCtxMenu, setSidebarCtxMenu] = useState<{ id: string; kind: 'type' | 'google'; x: number; y: number } | null>(null)
  const [sidebarYear, setSidebarYear] = useState(today.getFullYear())
  const [sidebarMonth, setSidebarMonth] = useState(today.getMonth())
  const [wsMon] = useState(() => getWeekStartsMonday())

  const [notionWeeks, setNotionWeeks] = useState<string[]>(() => {
    const t      = new Date()
    const wm     = getWeekStartsMonday()
    const offset = wm ? (t.getDay() + 6) % 7 : t.getDay()
    const anchor = new Date(t.getFullYear(), t.getMonth(), t.getDate() - offset)
    const fmt    = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return Array.from({ length: 48 }, (_, i) => addWeeks(fmt(anchor), i - 24))
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
  const v3Swipe        = useRef<{ x: number; y: number } | null>(null)
  const rowSwipe       = useRef<{ x: number; y: number; ds: string } | null>(null)
  const p0Swipe        = useRef<{ x: number; y: number } | null>(null)
  const suppressPrepend   = useRef(true)   // true initially — cleared after scroll-to-today so prepend IO doesn't clobber initial position
  const scrolledToToday   = useRef(false)
  const googleRescrollDone = useRef(false) // prevents re-scroll after the first Google events load
  const monthLblTapRef  = useRef<number>(0)
  const gridSwipe       = useRef<{ x: number; y: number } | null>(null)
  const handleDragRef   = useRef<{ startY: number; startH: number } | null>(null)

  useEffect(() => { monthsRef.current = months }, [months])
  useEffect(() => { notionWeeksRef.current = notionWeeks }, [notionWeeks])
  useEffect(() => { localStorage.setItem('cal-type-colors', JSON.stringify(typeColors)) }, [typeColors])
  useEffect(() => { localStorage.setItem('cal-hidden-google-cals', JSON.stringify([...hiddenGoogleCals])) }, [hiddenGoogleCals])

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

  // ── Scroll-based haptic + sideLbl update ─────────────────────────────────
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
      const y = parseInt(ys), m = parseInt(ms) - 1
      setSideLbl(monthLabel(y, m))
      setGridYear(y)
      setGridMonth(m)
      setGridSel(found)
    }
  }, [])

  // ── Data loading ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++loadGen.current
    try {
      const [{ data: inc }, { data: subs }, { data: profile }] =
        await Promise.all([
          supabase.from('income').select('name, amount, date').abortSignal(controller.signal),
          supabase.from('subscriptions').select('name, cost, next_renewal').eq('status', 'Active').abortSignal(controller.signal),
          supabase.from('profiles').select('calendar_prefs').abortSignal(controller.signal).single(),
        ])
      if (gen !== loadGen.current) return
      if (profile?.calendar_prefs) setPrefs(profile.calendar_prefs as CalPrefs)

      const map: Record<string, CalEvent[]> = {}
      const push = (date: string, ev: CalEvent) => { if (!map[date]) map[date] = []; map[date].push(ev) }
      for (const i of inc  ?? []) push(String(i.date), { title: String(i.name), type: 'income', amount: `+$${Number(i.amount).toFixed(2)}` })
      for (const s of subs ?? []) if (s.next_renewal) push(String(s.next_renewal), { title: String(s.name), type: 'sub', amount: `$${Number(s.cost).toFixed(2)}` })
      setEventMap(map)
      setDataLoaded(true)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('loadData error:', err)
    }
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++; abortRef.current?.abort() } }, [loadData])

  useEffect(() => {
    if (!('geolocation' in navigator)) return

    const LOC_KEY = 'cal-weather-loc'
    const LOC_TTL = 24 * 60 * 60 * 1000 // re-fetch position once per day

    function fetchWeather(lat: number, lon: number) {
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,windspeed_10m_max&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=14`)
        .then(r => r.json())
        .then((d: { daily: { time: string[]; temperature_2m_max: number[]; temperature_2m_min: number[]; weathercode: number[]; precipitation_probability_max: number[]; windspeed_10m_max: number[] } }) => {
          const map: Record<string, DayWeather> = {}
          d.daily.time.forEach((date, i) => {
            map[date] = {
              high:       Math.round(d.daily.temperature_2m_max[i]),
              low:        Math.round(d.daily.temperature_2m_min[i]),
              code:       d.daily.weathercode[i],
              precipProb: Math.round(d.daily.precipitation_probability_max[i] ?? 0),
              wind:       Math.round(d.daily.windspeed_10m_max[i]),
            }
          })
          setWeatherMap(map)
        })
        .catch(() => {})
    }

    // Use cached coordinates if still fresh — avoids prompting for permission on every tab visit
    try {
      const raw = localStorage.getItem(LOC_KEY)
      if (raw) {
        const { lat, lon, ts } = JSON.parse(raw) as { lat: number; lon: number; ts: number }
        if (Date.now() - ts < LOC_TTL) { fetchWeather(lat, lon); return }
      }
    } catch {}

    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: lat, longitude: lon } = pos.coords
      try { localStorage.setItem(LOC_KEY, JSON.stringify({ lat, lon, ts: Date.now() })) } catch {}
      fetchWeather(lat, lon)
    }, () => {})
  }, [])

  useEffect(() => {
    if (googleCals.length > 0) return
    if (!settingsOpen && prefs.googleCalendarIds.length === 0) return
    setCalsLoading(true)
    fetch('/api/calendar?action=calendars')
      .then(r => r.json()).then((d: { items?: GCalendar[] }) => setGoogleCals(d.items ?? []))
      .catch(() => {}).finally(() => setCalsLoading(false))
  }, [settingsOpen, googleCals.length, prefs.googleCalendarIds.length])

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
        const color = prefs.googleCalendarColors?.[calId] ?? clr[calId] ?? '#4285F4'
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
          map[date].push({ id: ev.id, title: ev.summary ?? '(no title)', type: 'google', amount: st ? `${st}${et ? ` – ${et}` : ''}` : '', location: ev.location, color, endDate, calendarId: calId, instanceDate: date })
        }
      }
      setGoogleEvMap(map)
    })
    return () => { gEvGen.current++ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.googleCalendarIds, rangeKey, googleCals, gRefreshKey])

  const visibleMap = useMemo(() => {
    const m: Record<string, CalEvent[]> = {}
    const customGoogleIds = new Set<string>()
    for (const evs of Object.values(eventMap)) {
      for (const e of evs) { if (e.googleEventId) customGoogleIds.add(e.googleEventId) }
    }
    for (const [date, evs] of Object.entries(eventMap)) {
      const f = evs.filter(e => e.type !== 'google' && prefs.visibleTypes.includes(e.type))
      if (f.length) m[date] = f
    }
    // Always include Google events — already filtered by googleCalendarIds at fetch time
    for (const [date, evs] of Object.entries(googleEvMap)) {
      const deduped = evs.filter(e => !e.id || !customGoogleIds.has(e.id))
      if (deduped.length) { if (!m[date]) m[date] = []; m[date].push(...deduped) }
    }
    return m
  }, [eventMap, googleEvMap, prefs.visibleTypes])

  const monthVisibleMap = useMemo(() => {
    if (hiddenTypes.size === 0 && hiddenGoogleCals.size === 0) return visibleMap
    const m: Record<string, CalEvent[]> = {}
    for (const [date, evs] of Object.entries(visibleMap)) {
      const f = evs.filter(e => {
        if (hiddenTypes.has(e.type)) return false
        if (e.type === 'google' && e.calendarId && hiddenGoogleCals.has(e.calendarId)) return false
        return true
      })
      if (f.length) m[date] = f
    }
    return m
  }, [visibleMap, hiddenTypes, hiddenGoogleCals])

  // Multi-day events for the spanning-bar overlay in the Notion month grid
  const multiDayEvents = useMemo(() => {
    const result: Array<{ startDate: string; endDate: string; ev: CalEvent }> = []
    for (const [date, evs] of Object.entries(googleEvMap)) {
      for (const ev of evs) {
        if (ev.endDate && ev.endDate > date) {
          if (ev.calendarId && hiddenGoogleCals.has(ev.calendarId)) continue
          result.push({ startDate: date, endDate: ev.endDate, ev })
        }
      }
    }
    return result
  }, [googleEvMap, hiddenGoogleCals])

  async function savePrefs(p: CalPrefs) {
    setPrefs(p)
    await supabase.from('profiles').update({ calendar_prefs: p }).eq('id', (await supabase.auth.getUser()).data.user?.id ?? '')
  }

  useEffect(() => {
    if (!sidebarCtxMenu) return
    const onDown = (e: MouseEvent) => { if (!ctxMenuRef.current?.contains(e.target as Node)) setSidebarCtxMenu(null) }
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarCtxMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [sidebarCtxMenu])

  function handleDeleteCalEvent(ev: CalEvent) {
    if (!ev.id) return
    setGoogleEvMap(prev => {
      const m = { ...prev }
      for (const key of Object.keys(m)) {
        m[key] = m[key].filter(e => e.id !== ev.id)
        if (!m[key].length) delete m[key]
      }
      return m
    })
    showToast('Event deleted', {
      type: 'delete',
      undo: {
        onUndo:   () => setGRefreshKey(k => k + 1),
        onCommit: () => deleteCalEvent(ev.id!, ev.calendarId ?? 'primary'),
      },
    })
  }

  function handleOpenEdit(ev: CalEvent) {
    if (!ev.id) return
    const parts = ev.amount?.split(' – ').map(t => t.trim()) ?? []
    const allDay = !ev.amount?.trim()
    setEditEvent({
      id: ev.id, title: ev.title, allDay,
      date: ev.instanceDate ?? '',
      startTime: !allDay && parts[0] ? parts[0] : '09:00',
      endTime:   !allDay && parts[1] ? parts[1] : '10:00',
      location: ev.location ?? '', notes: ev.notes ?? '',
      recurrenceRule: '',
      calendarId: ev.calendarId ?? 'primary',
      googleEventId: ev.id,
      instanceDate: ev.instanceDate,
    })
  }

  function openCreatePopover(anchorRect: DOMRect | null, date: string) {
    const calId = prefs.defaultCalendarId
      ?? googleCals.find(c => prefs.googleCalendarIds.includes(c.id))?.id
      ?? prefs.googleCalendarIds[0]
      ?? 'primary'
    const { startTime, endTime } = defaultTimes()
    setPopover({ anchorRect, mode: 'create', data: { title: '', date, endDate: date, allDay: false, startTime, endTime, location: '', notes: '', recurrenceRule: '', calendarId: calId } })
  }

  function openEditPopover(anchorRect: DOMRect | null, ev: CalEvent, date: string) {
    if (!ev.id) return
    const parts = ev.amount?.split(' – ').map(t => t.trim()) ?? []
    const allDay = !ev.amount?.trim()
    setPopover({ anchorRect, mode: 'edit', data: { eventId: ev.id, title: ev.title, date, endDate: date, allDay, startTime: !allDay && parts[0] ? parts[0] : '09:00', endTime: !allDay && parts[1] ? parts[1] : '10:00', location: ev.location ?? '', notes: ev.notes ?? '', recurrenceRule: '', calendarId: ev.calendarId ?? 'primary' } })
  }

  async function handlePopoverSave(data: PopoverFormData) {
    setPopoverSaving(true)
    try {
      const body: GCalEvent = data.allDay
        ? { summary: data.title, description: data.notes || undefined, location: data.location || undefined, start: { date: data.date }, end: { date: data.endDate || data.date } }
        : { summary: data.title, description: data.notes || undefined, location: data.location || undefined, start: { dateTime: `${data.date}T${data.startTime}:00`, timeZone: 'America/Los_Angeles' }, end: { dateTime: `${data.endDate || data.date}T${data.endTime}:00`, timeZone: 'America/Los_Angeles' } }
      if (data.recurrenceRule) body.recurrence = [`RRULE:${data.recurrenceRule}`]
      if (popover?.mode === 'create') {
        await createCalEvent(body, data.calendarId)
        showToast('Event created', { type: 'add' })
      } else if (data.eventId) {
        await updateCalEvent(data.eventId, body, data.calendarId)
        showToast('Event updated', { type: 'payment' })
      }
      setPopover(null)
      setGRefreshKey(k => k + 1)
    } catch { showToast('Failed to save', { type: 'delete' }) }
    finally { setPopoverSaving(false) }
  }

  function handlePopoverDelete() {
    if (!popover?.data.eventId) return
    const eid = popover.data.eventId, calId = popover.data.calendarId
    setPopover(null)
    setGoogleEvMap(prev => {
      const m = { ...prev }
      for (const key of Object.keys(m)) { m[key] = m[key].filter(e => e.id !== eid); if (!m[key].length) delete m[key] }
      return m
    })
    showToast('Event deleted', { type: 'delete', undo: { onUndo: () => setGRefreshKey(k => k + 1), onCommit: () => deleteCalEvent(eid, calId) } })
  }

  async function handleEditEvent(edits: EventEdits, _scope: RecurrenceScope) {
    const ev = editEvent
    if (!ev?.id) return
    const body: GCalEvent = edits.allDay
      ? { summary: edits.title, description: edits.notes || undefined, location: edits.location || undefined, start: { date: edits.date }, end: { date: edits.date } }
      : { summary: edits.title, description: edits.notes || undefined, location: edits.location || undefined, start: { dateTime: `${edits.date}T${edits.startTime}:00`, timeZone: 'America/Los_Angeles' }, end: { dateTime: `${edits.date}T${edits.endTime}:00`, timeZone: 'America/Los_Angeles' } }
    await updateCalEvent(ev.id, body, ev.calendarId ?? 'primary')
    showToast('Event updated', { type: 'payment' })
    setEditEvent(null)
    setGRefreshKey(k => k + 1)
  }

  // ── Scroll to today after first data load ────────────────────────────────
  useEffect(() => {
    if (!dataLoaded || scrolledToToday.current || isLargeScreen) return
    let t1: ReturnType<typeof setTimeout>
    let t2: ReturnType<typeof setTimeout>
    const doScroll = () => {
      const sc = scrollRef.current
      const el = dayRefs.current.get(todayStr)
      // Guard: offsetTop === 0 means layout isn't complete yet — don't mark done
      if (sc && el && el.offsetTop > 0) {
        sc.scrollTop = el.offsetTop - 20
        scrolledToToday.current = true
        suppressPrepend.current = false
        return true
      }
      return false
    }
    // 300ms initial wait; retry 400ms later if iOS layout isn't done yet
    t1 = setTimeout(() => { if (!doScroll()) t2 = setTimeout(doScroll, 400) }, 300)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [dataLoaded, isLargeScreen, todayStr])

  // After Google Calendar events load they can make days taller, shifting the viewport backward.
  // Re-scroll to today once after the first Google events load, before the user has interacted.
  useEffect(() => {
    if (!scrolledToToday.current || googleRescrollDone.current || isLargeScreen) return
    googleRescrollDone.current = true
    requestAnimationFrame(() => {
      const sc = scrollRef.current
      const el = dayRefs.current.get(todayStr)
      if (sc && el && el.offsetTop > 0) sc.scrollTop = el.offsetTop - 20
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleEvMap, isLargeScreen, todayStr])

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
    if (isLargeScreen) return
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
  }, [isLargeScreen])

  // ── Infinite scroll: prepend ───────────────────────────────────────────────
  useEffect(() => {
    if (isLargeScreen) return
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
  }, [isLargeScreen])

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

  // ── Month grid scroll → update notionGridLbl ──────────────────────────────
  useEffect(() => {
    if (!isLargeScreen || calView !== 'month') return
    const sc = monthGridRef.current
    if (!sc) return
    const handleScroll = () => {
      const scRect = sc.getBoundingClientRect()
      const el = document.elementFromPoint(scRect.left + scRect.width / 4, scRect.top + 5)
      let node: Element | null = el
      while (node && node !== sc) {
        const ds = node.getAttribute('data-caldate')
        if (ds) {
          const parts = ds.split('-').map(Number)
          setNotionGridLbl(new Date(parts[0], parts[1] - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }))
          setSidebarYear(parts[0])
          setSidebarMonth(parts[1] - 1)
          return
        }
        node = node.parentElement
      }
    }
    sc.addEventListener('scroll', handleScroll, { passive: true })
    handleScroll()
    return () => sc.removeEventListener('scroll', handleScroll)
  }, [isLargeScreen, calView])

  // Applies per-type and per-calendar color overrides (Notion grid only).
  // Google events: check live prefs.googleCalendarColors first so sidebar color changes
  // take effect instantly without re-fetching the event map.
  const notionColor = (ev: CalEvent) => {
    if (ev.type === 'google' && ev.calendarId)
      return prefs.googleCalendarColors?.[ev.calendarId] ?? ev.color ?? DOT_COLOR.google
    return ev.color ?? typeColors[ev.type] ?? DOT_COLOR[ev.type]
  }

  // Derives a light, hue-tinted text color from a hex background color (same hue, sat ≤45%, L=87%)
  function lightTextColor(hex: string): string {
    const h = hex.replace('#', '')
    if (h.length !== 6 && h.length !== 3) return '#DDD'
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
    const r = parseInt(full.slice(0, 2), 16) / 255
    const g = parseInt(full.slice(2, 4), 16) / 255
    const b = parseInt(full.slice(4, 6), 16) / 255
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
    const l   = (max + min) / 2
    const s   = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
    let hDeg  = 0
    if (d !== 0) {
      if (max === r)      hDeg = ((g - b) / d % 6) * 60
      else if (max === g) hDeg = ((b - r) / d + 2) * 60
      else                hDeg = ((r - g) / d + 4) * 60
      if (hDeg < 0) hDeg += 360
    }
    return `hsl(${Math.round(hDeg)}, ${Math.round(Math.min(s, 0.70) * 100)}%, 92%)`
  }

  // ── Grid helpers ───────────────────────────────────────────────────────────
  const gridDays  = getDaysInMonth(gridYear, gridMonth)
  const firstDay  = wsMon ? (new Date(gridYear, gridMonth, 1).getDay() + 6) % 7 : new Date(gridYear, gridMonth, 1).getDay()
  const gridCells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: gridDays }, (_, i) => i + 1)]
  while (gridCells.length % 7 !== 0) gridCells.push(null)
  const gridMonthLbl = new Date(gridYear, gridMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const gds = (d: number) => `${gridYear}-${String(gridMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  function goToPrev() {
    const newMonth = gridMonth === 0 ? 11 : gridMonth - 1
    const newYear  = gridMonth === 0 ? gridYear - 1 : gridYear
    if (gridMonth === 0) { setGridMonth(11); setGridYear(y => y - 1) } else setGridMonth(m => m - 1)
    setGridSel(null)
    if (!isLargeScreen) {
      const firstDay = `${newYear}-${String(newMonth + 1).padStart(2, '0')}-01`
      requestAnimationFrame(() => {
        const sc = scrollRef.current, el = dayRefs.current.get(firstDay)
        if (sc && el) sc.scrollTop = el.offsetTop - 20
      })
    }
  }
  function goToNext() {
    const newMonth = gridMonth === 11 ? 0 : gridMonth + 1
    const newYear  = gridMonth === 11 ? gridYear + 1 : gridYear
    if (gridMonth === 11) { setGridMonth(0); setGridYear(y => y + 1) } else setGridMonth(m => m + 1)
    setGridSel(null)
    if (!isLargeScreen) {
      const firstDay = `${newYear}-${String(newMonth + 1).padStart(2, '0')}-01`
      requestAnimationFrame(() => {
        const sc = scrollRef.current, el = dayRefs.current.get(firstDay)
        if (sc && el) sc.scrollTop = el.offsetTop - 20
      })
    }
  }
  function goToToday() { setGridYear(today.getFullYear()); setGridMonth(today.getMonth()); setGridSel(todayStr) }
  const gridSelEvents = gridSel ? (visibleMap[gridSel] ?? []) : []
  const gridSelLabel  = gridSel ? new Date(gridSel + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : null

  // ── Day Detail helpers ────────────────────────────────────────────────────
  const dayDate      = selectedDay ? new Date(selectedDay + 'T12:00:00') : null
  const dayName      = dayDate?.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() ?? ''
  const dayNum       = dayDate?.getDate() ?? ''
  const dayMonthYr   = dayDate?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() ?? ''
  const dayEvents    = selectedDay ? (visibleMap[selectedDay] ?? []) : []

  // ── Scroll list to today ──────────────────────────────────────────────────
  function scrollListToToday() {
    const sc = scrollRef.current, el = dayRefs.current.get(todayStr)
    if (sc && el) {
      const cR = sc.getBoundingClientRect(), eR = el.getBoundingClientRect()
      sc.scrollTop = sc.scrollTop + eR.top - cR.top - sc.clientHeight / 2 + eR.height / 2
    }
  }

  // ── Swipe gesture handlers ─────────────────────────────────────────────────
  // List row → Day detail: swipe left on a day row
  const rowStart = useCallback((e: React.TouchEvent, ds: string) => {
    const t = e.touches[0]; rowSwipe.current = { x: t.clientX, y: t.clientY, ds }
  }, [])
  const rowEnd = useCallback((e: React.TouchEvent) => {
    const s = rowSwipe.current; rowSwipe.current = null; if (!s) return
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setSelectedDay(s.ds); setViewIndex(1)
    }
  }, [])
  const rowMouseDown = useCallback((e: React.MouseEvent, ds: string) => {
    rowSwipe.current = { x: e.clientX, y: e.clientY, ds }
  }, [])
  const rowMouseUp = useCallback((e: React.MouseEvent) => {
    const s = rowSwipe.current; rowSwipe.current = null; if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (dx < -60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      setSelectedDay(s.ds); setViewIndex(1)
    }
  }, [])

  // Day detail → split view: any right swipe
  const v3Start = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]; v3Swipe.current = { x: t.clientX, y: t.clientY }
  }, [])
  const v3End = useCallback((e: React.TouchEvent) => {
    const s = v3Swipe.current; v3Swipe.current = null; if (!s) return
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y
    if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setViewIndex(0)
  }, [])

  // Panel 0 (split view) → adjacent tab: edge-zone swipe
  const p0Start = useCallback((e: React.TouchEvent) => {
    if (document.body.style.position === 'fixed') return
    const t = e.touches[0], w = window.innerWidth
    if (t.clientX <= EDGE_PX || t.clientX >= w - EDGE_PX) {
      p0Swipe.current = { x: t.clientX, y: t.clientY }
    }
  }, [])
  const p0End = useCallback((e: React.TouchEvent) => {
    const s = p0Swipe.current; p0Swipe.current = null; if (!s) return
    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) / 1.5) return
    if (dx > 0 && CAL_IDX > 0)               router.push(TABS[CAL_IDX - 1]) // right → Plans
    if (dx < 0 && CAL_IDX < TABS.length - 1) router.push(TABS[CAL_IDX + 1]) // left  → Studio
  }, [router])
  const v3MouseDown = useCallback((e: React.MouseEvent) => {
    v3Swipe.current = { x: e.clientX, y: e.clientY }
  }, [])
  const v3MouseUp = useCallback((e: React.MouseEvent) => {
    const s = v3Swipe.current; v3Swipe.current = null; if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setViewIndex(0)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
    {/* Root — fixed viewport clip */}
    <div className="tab-enter" style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>

      {/* ── Sliding rail (2 panels × 100vw) ──────────────────────────────── */}
      <div style={{ display: 'flex', width: '200vw', height: '100%', transform: `translateX(-${viewIndex * 100}vw)`, transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)', willChange: 'transform' }}>

        {/* ═══════════════════════════════════════════════════════════════
            PANEL 0 — Split view (mobile) / Notion grid (iPad+)
        ═══════════════════════════════════════════════════════════════ */}
        {isLargeScreen ? (
          /* ── iPad / Large screen: existing Notion grid layout ── */
          <div
            style={{ width: '100vw', height: '100%', flex: 'none', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-base)', userSelect: 'none', cursor: 'default' }}>

            {/* Top bar */}
            <div style={{ paddingTop: calView === 'month' ? 8 : SAFE_TOP, flexShrink: 0 }}>
              <div className="px-5 pb-3 pt-0">
                <div className="flex items-center gap-2">
                  {/* List / Month toggle */}
                  <div style={{ display: 'flex', background: 'rgb(var(--rgb-ink) / 0.06)', borderRadius: 20, padding: 2, gap: 2 }}>
                    {(['list', 'month'] as const).map(v => (
                      <button key={v} onClick={() => switchCalView(v)} style={{
                        padding: '5px 14px', borderRadius: 18, border: 'none', cursor: 'pointer',
                        fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-montserrat)', letterSpacing: '0.04em',
                        background: calView === v ? 'linear-gradient(135deg,#F7DF9E,#D4AF37,#A47F23)' : 'transparent',
                        color: calView === v ? '#000' : 'rgb(var(--rgb-ink) / 0.4)',
                        transition: 'background 0.15s, color 0.15s',
                      }}>
                        {v === 'list' ? 'List' : 'Month'}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1 }} />
                  {calView === 'month' && (
                    <button onClick={() => {
                      setSidebarYear(today.getFullYear()); setSidebarMonth(today.getMonth())
                      const el = monthCellRefs.current.get(todayStr)
                      const sc = monthGridRef.current
                      if (el && sc) {
                        const cRect = sc.getBoundingClientRect()
                        const eRect = el.getBoundingClientRect()
                        sc.scrollTop = sc.scrollTop + eRect.top - cRect.top - 120
                      }
                    }} className="text-[11px] font-medium text-gold select-none">Today</button>
                  )}
                  <button onClick={() => setSettingsOpen(true)} className="w-9 h-9 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center select-none">
                    <SlidersHorizontal size={15} className="text-ink-muted" />
                  </button>
                  {calView !== 'month' && <>
                    <button onClick={goToPrev} className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none">‹</button>
                    <button onClick={goToNext} className="w-8 h-8 rounded-full bg-bg-surface border border-white/[0.06] flex items-center justify-center text-ink-muted text-[14px] select-none">›</button>
                  </>}
                </div>
                {calView !== 'month' && (
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[18px] font-semibold text-ink">{gridMonthLbl}</p>
                    <button onClick={goToToday} className="text-[11px] font-medium text-gold select-none">Today</button>
                  </div>
                )}
              </div>
            </div>

            {/* Notion-Style Month Grid */}
            {calView === 'month' && (
              <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

                {/* Sidebar (180px) */}
                <div style={{ width: 180, background: 'var(--color-bg-surface)', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-grid-border)', flexShrink: 0 }}>
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
                      {(wsMon ? ['M','T','W','T','F','S','S'] : ['S','M','T','W','T','F','S']).map((d, i) => (
                        <div key={i} style={{ textAlign: 'center', fontSize: 8, fontWeight: 600, color: 'rgb(var(--rgb-ink) / 0.25)', fontFamily: 'var(--font-montserrat)', paddingBottom: 2 }}>{d}</div>
                      ))}
                    </div>
                    {/* Mini day grid */}
                    {(() => {
                      const dim      = getDaysInMonth(sidebarYear, sidebarMonth)
                      const firstDow = wsMon ? (new Date(sidebarYear, sidebarMonth, 1).getDay() + 6) % 7 : new Date(sidebarYear, sidebarMonth, 1).getDay()
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
                                <span style={{ fontSize: 9, fontWeight: isToday ? 700 : 400, color: isToday ? '#000' : 'rgb(var(--rgb-ink) / 0.55)', fontFamily: 'var(--font-montserrat)' }}>{day}</span>
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
                  <div style={{ height: 1, background: 'var(--color-grid-border)', flexShrink: 0 }} />

                  {/* Calendar legend toggles */}
                  <div style={{ padding: '12px 10px 8px', flexShrink: 0 }}>
                    <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgb(var(--rgb-ink) / 0.25)', marginBottom: 8, fontFamily: 'var(--font-montserrat)' }}>Calendars</p>
                    <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgb(var(--rgb-ink) / 0.18)', marginBottom: 4, fontFamily: 'var(--font-montserrat)', paddingLeft: 4 }}>Finance</p>
                    {/* Income & Subscriptions */}
                    {([
                      { type: 'income' as EventType, label: 'Income',        color: DOT_COLOR.income },
                      { type: 'sub'    as EventType, label: 'Subscriptions', color: DOT_COLOR.sub    },
                    ].map(item => {
                      const hidden      = hiddenTypes.has(item.type)
                      const activeColor = typeColors[item.type] ?? item.color
                      const isCustom    = !!typeColors[item.type]
                      const hovered     = hoveredSidebarRow === item.type
                      return (
                        <div
                          key={item.type}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '3px 4px', borderRadius: 6, background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent', transition: 'background 0.12s' }}
                          onMouseEnter={() => setHoveredSidebarRow(item.type)}
                          onMouseLeave={() => setHoveredSidebarRow(null)}
                          onContextMenu={e => { e.preventDefault(); setSidebarCtxMenu({ id: item.type, kind: 'type', x: e.clientX, y: e.clientY }) }}
                          onTouchStart={e => { const t = e.touches[0]; longPressTimer.current = setTimeout(() => setSidebarCtxMenu({ id: item.type, kind: 'type', x: t.clientX, y: t.clientY }), 500) }}
                          onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                          onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                        >
                          <label style={{ position: 'relative', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', width: 16, height: 16, justifyContent: 'center' }} title="Change color">
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: hidden ? 'transparent' : activeColor, border: `1.5px solid ${activeColor}`, display: 'block', transition: 'all 0.15s', opacity: hidden ? 0.4 : 1, flexShrink: 0 }} />
                            <input type="color" value={activeColor}
                              ref={el => { if (el) colorInputRefs.current.set(item.type, el); else colorInputRefs.current.delete(item.type) }}
                              onChange={e => setTypeColors(p => ({ ...p, [item.type]: e.target.value }))}
                              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }} />
                          </label>
                          <button onClick={() => setHiddenTypes(prev => { const next = new Set(prev); if (next.has(item.type)) next.delete(item.type); else next.add(item.type); return next })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', padding: 0 }}>
                            <span style={{ fontSize: 11, color: hidden ? 'rgb(var(--rgb-ink) / 0.25)' : 'rgb(var(--rgb-ink) / 0.7)', fontFamily: 'var(--font-montserrat)', fontWeight: 500, transition: 'color 0.15s' }}>{item.label}</span>
                          </button>
                          {hovered ? (
                            <button
                              onClick={e => { e.stopPropagation(); setHiddenTypes(prev => { const next = new Set(prev); if (next.has(item.type)) next.delete(item.type); else next.add(item.type); return next }) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0, display: 'flex', alignItems: 'center', color: 'rgb(var(--rgb-ink) / 0.4)' }}
                              title={hidden ? 'Show' : 'Hide'}
                            >
                              {hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                          ) : isCustom ? (
                            <button onClick={() => setTypeColors(p => { const n = { ...p }; delete n[item.type]; return n })}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', opacity: 0.35, flexShrink: 0, lineHeight: 1, fontSize: 9, color: 'var(--color-ink)' }} title="Reset color">
                              ✕
                            </button>
                          ) : null}
                        </div>
                      )
                    }))}
                    {/* Per-Google-calendar rows */}
                    {googleCals.filter(c => prefs.googleCalendarIds.includes(c.id)).length > 0 && (
                      <div style={{ marginTop: 8, marginBottom: 4 }}>
                        <div style={{ height: '0.5px', background: 'rgb(var(--rgb-ink) / 0.08)', marginBottom: 6 }} />
                        <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgb(var(--rgb-ink) / 0.18)', margin: 0, fontFamily: 'var(--font-montserrat)', paddingLeft: 4 }}>Google</p>
                      </div>
                    )}
                    {googleCals.filter(c => prefs.googleCalendarIds.includes(c.id)).map(cal => {
                      const hidden      = hiddenGoogleCals.has(cal.id)
                      const activeColor = prefs.googleCalendarColors?.[cal.id] ?? cal.backgroundColor
                      const hovered     = hoveredSidebarRow === cal.id
                      return (
                        <div
                          key={cal.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '3px 4px', borderRadius: 6, background: hovered ? 'rgba(255,255,255,0.03)' : 'transparent', transition: 'background 0.12s' }}
                          onMouseEnter={() => setHoveredSidebarRow(cal.id)}
                          onMouseLeave={() => setHoveredSidebarRow(null)}
                          onContextMenu={e => { e.preventDefault(); setSidebarCtxMenu({ id: cal.id, kind: 'google', x: e.clientX, y: e.clientY }) }}
                          onTouchStart={e => { const t = e.touches[0]; longPressTimer.current = setTimeout(() => setSidebarCtxMenu({ id: cal.id, kind: 'google', x: t.clientX, y: t.clientY }), 500) }}
                          onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                          onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                        >
                          <label style={{ position: 'relative', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', width: 16, height: 16, justifyContent: 'center' }} title="Change color">
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: hidden ? 'transparent' : activeColor, border: `1.5px solid ${activeColor}`, display: 'block', transition: 'all 0.15s', opacity: hidden ? 0.4 : 1, flexShrink: 0 }} />
                            <input type="color" value={activeColor}
                              ref={el => { if (el) colorInputRefs.current.set(cal.id, el); else colorInputRefs.current.delete(cal.id) }}
                              onChange={e => { const c = e.target.value; savePrefs({ ...prefs, googleCalendarColors: { ...(prefs.googleCalendarColors ?? {}), [cal.id]: c } }) }}
                              style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', padding: 0, border: 'none' }} />
                          </label>
                          <button onClick={() => setHiddenGoogleCals(prev => { const next = new Set(prev); if (next.has(cal.id)) next.delete(cal.id); else next.add(cal.id); return next })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', padding: 0 }}>
                            <span style={{ fontSize: 11, color: hidden ? 'rgb(var(--rgb-ink) / 0.25)' : 'rgb(var(--rgb-ink) / 0.7)', fontFamily: 'var(--font-montserrat)', fontWeight: 500, transition: 'color 0.15s' }}>{cal.summary}</span>
                          </button>
                          {hovered && (
                            <button
                              onClick={e => { e.stopPropagation(); setHiddenGoogleCals(prev => { const next = new Set(prev); if (next.has(cal.id)) next.delete(cal.id); else next.add(cal.id); return next }) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0, display: 'flex', alignItems: 'center', color: 'rgb(var(--rgb-ink) / 0.4)' }}
                              title={hidden ? 'Show' : 'Hide'}
                            >
                              {hidden ? <EyeOff size={11} /> : <Eye size={11} />}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  <div style={{ flex: 1 }} />

                  {/* Add Calendar */}
                  <div style={{ padding: '8px 10px 16px', flexShrink: 0 }}>
                    <button onClick={() => setSettingsOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: '1px solid rgb(var(--rgb-ink) / 0.08)', borderRadius: 8, cursor: 'pointer', padding: '7px 8px' }}>
                      <Plus size={11} color="rgb(var(--rgb-ink) / 0.35)" />
                      <span style={{ fontSize: 11, color: 'rgb(var(--rgb-ink) / 0.35)', fontFamily: 'var(--font-montserrat)', fontWeight: 500 }}>Add Calendar</span>
                    </button>
                  </div>
                </div>

                {/* Main Notion grid */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: 'var(--color-bg-base)' }}>
                  {/* Sticky DOW header */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', background: 'var(--color-bg-base)', borderBottom: '1px solid var(--color-grid-border)', flexShrink: 0 }}>
                    {(wsMon ? ['MON','TUE','WED','THU','FRI','SAT','SUN'] : ['SUN','MON','TUE','WED','THU','FRI','SAT']).map(d => (
                      <div key={d} style={{ textAlign: 'center', padding: '4px 0 3px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#C9A84C', fontFamily: 'var(--font-montserrat)' }}>{d}</div>
                    ))}
                  </div>
                  {/* Scrollable weeks */}
                  <div ref={monthGridRef} style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-base)', position: 'relative' }}>
                    <div ref={monthGridTopSentRef} style={{ height: 1 }} />
                    {notionWeeks.map(weekStart => {
                      const days      = weekDays(weekStart)
                      const weekSpans = multiDayEvents.filter(s => s.startDate <= days[6] && s.endDate >= days[0])
                      const spanLanes = allocateSpanLanes(weekSpans, days)
                      const SPAN_H = 18, SPAN_GAP = EV_ROW_H - SPAN_H
                      const maxLanes  = spanLanes.length
                      const singleSlots = Math.max(0, MAX_VIS_EVENTS - maxLanes)
                      return (
                        <div key={weekStart} style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--color-grid-border)' }}>
                          {days.map((ds, ci) => {
                            const parts        = ds.split('-').map(Number)
                            const [cy, cm, cd] = parts
                            const isToday      = ds === todayStr
                            const isMonthStart = cd === 1
                            const isPast       = ds < todayStr
                            const allEvs       = monthVisibleMap[ds] ?? []
                            const singleEvs    = allEvs.filter(ev => !ev.endDate)
                            const allDayEvs    = singleEvs.filter(ev => ev.type !== 'google' || !ev.amount)
                            const timedEvs     = singleEvs.filter(ev => ev.type === 'google' && !!ev.amount)
                            const shownAllDay  = Math.min(allDayEvs.length, singleSlots)
                            const shownTimed   = Math.min(timedEvs.length, singleSlots - shownAllDay)
                            const overflow     = singleEvs.length - shownAllDay - shownTimed
                            return (
                              <div
                                key={ds}
                                data-caldate={ds}
                                ref={el => { if (el) monthCellRefs.current.set(ds, el); else monthCellRefs.current.delete(ds) }}
                                onDoubleClick={e => { navigator.vibrate?.(6); if (calView === 'month') openCreatePopover(e.currentTarget.getBoundingClientRect(), ds) }}
                                className="group"
                                style={{ minHeight: CELL_MIN_H, borderRight: ci < 6 ? '1px solid var(--color-grid-border)' : 'none', padding: '5px 0 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', background: isToday ? 'rgba(201,168,76,0.05)' : 'var(--color-bg-base)', position: 'relative' }}
                              >
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none" style={{ background: 'rgb(var(--rgb-ink) / 0.03)' }} />
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', opacity: isPast ? 0.45 : 1, transition: 'opacity 0.15s' }}>
                                  {/* Date number row */}
                                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3, flexShrink: 0, paddingLeft: 4, paddingRight: 4 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto', flexShrink: 0 }}>
                                      {isMonthStart && (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#C9A84C', fontFamily: 'var(--font-montserrat)', letterSpacing: '0.03em', textTransform: 'uppercase', lineHeight: 1 }}>
                                          {new Date(cy, cm - 1, 1).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
                                        </span>
                                      )}
                                      <span style={{ fontSize: isToday ? 20 : 12, fontWeight: isToday ? 700 : 400, color: isToday ? '#C9A84C' : 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', lineHeight: 1 }}>
                                        {cd}
                                      </span>
                                    </div>
                                  </div>
                                  {/* Multi-day span lanes */}
                                  {maxLanes > 0 && (
                                    <div style={{ flexShrink: 0, marginBottom: 3 }}>
                                      {spanLanes.map((lane, li) => {
                                        const bar = lane.find(b => b.startCol === ci || (b.startCol < ci && b.endCol >= ci))
                                        if (!bar) return <div key={li} style={{ height: SPAN_H + SPAN_GAP }} />
                                        const isStart = bar.startCol === ci
                                        const isEnd   = bar.endCol   === ci
                                        const bg = notionColor(bar.ev)
                                        return (
                                          <div key={li} onClick={bar.ev.type === 'google' && bar.ev.id ? (e) => { e.stopPropagation(); openEditPopover(e.currentTarget.getBoundingClientRect(), bar.ev, days[bar.startCol] ?? ds) } : undefined}
                                            style={{ height: SPAN_H, marginBottom: SPAN_GAP, marginLeft: isStart ? 2 : 0, marginRight: isEnd ? 2 : 0, borderRadius: isStart ? '4px 0 0 4px' : isEnd ? '0 4px 4px 0' : 0, background: bg + 'CC', display: 'flex', alignItems: 'center', paddingLeft: isStart ? 4 : 2, overflow: 'hidden', cursor: (bar.ev.type === 'google') && bar.ev.id ? 'pointer' : 'default' }}>
                                            {isStart && <span style={{ fontSize: 9, color: lightTextColor(bg), fontFamily: 'var(--font-montserrat)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bar.ev.title}</span>}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  )}
                                  {/* Single-day events */}
                                  <div style={{ paddingLeft: 4, paddingRight: 4, display: 'flex', flexDirection: 'column' }}>
                                    {allDayEvs.slice(0, shownAllDay).map((ev, ei) => {
                                      const evColor = notionColor(ev)
                                      return (
                                        <div
                                          key={ei}
                                          onClick={ev.type === 'google' && ev.id ? (e) => { e.stopPropagation(); openEditPopover(e.currentTarget.getBoundingClientRect(), ev, ds) } : undefined}
                                          style={{ background: evColor + 'DD', borderRadius: 4, padding: '0 5px', marginBottom: 2, height: 18, display: 'flex', alignItems: 'center', overflow: 'hidden', flexShrink: 0, opacity: 0.85, cursor: (ev.type === 'google') && ev.id ? 'pointer' : 'default' }}
                                        >
                                          <span style={{ fontSize: 10, color: lightTextColor(evColor), fontFamily: 'var(--font-montserrat)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                                        </div>
                                      )
                                    })}
                                    {/* Timed / financial events */}
                                    {timedEvs.slice(0, shownTimed).map((ev, ei) => {
                                      const bar     = notionColor(ev)
                                      const timeStr = (ev.type === 'google') && ev.amount
                                        ? ev.amount.split(' – ')[0].trim().replace(/^(\d{2}):(\d{2})$/, (_, hh, mm) => { const n = Number(hh); return `${n % 12 || 12}:${mm}${n >= 12 ? 'p' : 'a'}` })
                                        : null
                                      return (
                                        <div
                                          key={ei}
                                          onClick={ev.type === 'google' && ev.id ? (e) => { e.stopPropagation(); openEditPopover(e.currentTarget.getBoundingClientRect(), ev, ds) } : undefined}
                                          style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 2, height: 18, overflow: 'hidden', flexShrink: 0, background: 'transparent', borderRadius: 3, opacity: 0.9, cursor: (ev.type === 'google') && ev.id ? 'pointer' : 'default' }}
                                        >
                                          <div style={{ width: 3, height: '100%', borderRadius: '3px 0 0 3px', background: bar, flexShrink: 0 }} />
                                          <span style={{ fontSize: 10, color: lightTextColor(bar), fontFamily: 'var(--font-montserrat)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, paddingLeft: 4, paddingRight: 3 }}>
                                            {timeStr && <span style={{ color: lightTextColor(bar), opacity: 0.6, marginRight: 3 }}>{timeStr}</span>}{ev.title}
                                          </span>
                                        </div>
                                      )
                                    })}
                                    {overflow > 0 && (
                                      <div style={{ fontSize: 9, color: 'rgb(var(--rgb-ink) / 0.35)', fontFamily: 'var(--font-montserrat)', paddingLeft: 2 }}>+{overflow} more</div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                    <div ref={monthGridBotSentRef} style={{ height: 1 }} />
                    <div style={{ height: 88 }} />
                  </div>
                </div>
              </div>
            )}

            {/* List mode (calView === 'list') */}
            {calView === 'list' && (
            <div className="bg-bg-base overflow-y-auto flex-1">
              {/* Day-of-week row */}
              <div className="grid grid-cols-7 px-3 mb-1">
                {(wsMon ? ['M','T','W','T','F','S','S'] : ['S','M','T','W','T','F','S']).map((d, i) => (
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
                  </div>
                  {gridSelEvents.length === 0
                    ? <div className="py-8 text-center text-ink-faint text-[13px]">Nothing on this day.</div>
                    : <div className="divide-y divide-white/[0.04]">{gridSelEvents.map((ev, i) => <EventRow key={i} ev={ev} onEdit={handleOpenEdit} />)}</div>}
                </div>
              )}
              {!gridSelLabel && (
                <div className="mx-4 mt-4 mb-4 bg-bg-surface border border-white/[0.06] rounded-card py-6 text-center text-ink-faint text-[13px]">
                  Tap a day to see events
                </div>
              )}
              <div style={{ height: 88 }} />
            </div>
            )}
          </div>
        ) : (
          /* ── Mobile: Fantastical-style split view ── */
          <div onTouchStart={p0Start} onTouchEnd={p0End} style={{ width: '100vw', height: '100%', flex: 'none', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-base)', userSelect: 'none', paddingTop: SAFE_TOP, boxSizing: 'border-box' }}>

            {/* Compact month grid — collapsible */}
            <div style={{ height: gridH, overflow: 'hidden', flexShrink: 0, transition: isDraggingHandle ? 'none' : 'height 0.3s cubic-bezier(0.4,0,0.2,1)', background: 'var(--color-bg-surface)' }}>
              <div style={{ height: GRID_EXPANDED, display: 'flex', flexDirection: 'column' }}>
                {/* Month header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 16, paddingRight: 12, paddingTop: 12, paddingBottom: 6, flexShrink: 0 }}>
                  <span
                    style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', userSelect: 'none', cursor: 'pointer', letterSpacing: '-0.01em' }}
                    onDoubleClick={scrollListToToday}
                    onTouchEnd={(e) => {
                      e.preventDefault()
                      const now = Date.now()
                      if (now - monthLblTapRef.current < 350) { monthLblTapRef.current = 0; scrollListToToday() }
                      else { monthLblTapRef.current = now }
                    }}
                  >
                    {gridMonthLbl}
                  </span>
                </div>
                {/* DOW labels */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', paddingLeft: 8, paddingRight: 8, paddingBottom: 4, flexShrink: 0 }}>
                  {(wsMon ? ['M','T','W','T','F','S','S'] : ['S','M','T','W','T','F','S']).map((d, i) => (
                    <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.55)', letterSpacing: '0.05em', fontFamily: 'var(--font-montserrat)' }}>{d}</div>
                  ))}
                </div>
                {/* Grid cells — swipe left/right to change month */}
                <div
                  style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: '1fr', paddingLeft: 6, paddingRight: 6, paddingBottom: 4 }}
                  onTouchStart={(e) => { gridSwipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }}
                  onTouchEnd={(e) => {
                    const s = gridSwipe.current; gridSwipe.current = null; if (!s) return
                    const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y
                    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) goToNext(); else goToPrev() }
                  }}
                  onMouseDown={(e) => { gridSwipe.current = { x: e.clientX, y: e.clientY } }}
                  onMouseUp={(e) => {
                    const s = gridSwipe.current; gridSwipe.current = null; if (!s) return
                    const dx = e.clientX - s.x, dy = e.clientY - s.y
                    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) { if (dx < 0) goToNext(); else goToPrev() }
                  }}
                  onMouseLeave={() => { gridSwipe.current = null }}
                >
                  {gridCells.map((day, i) => {
                    if (day === null) return <div key={i} />
                    const ds = gds(day)
                    const isToday = ds === todayStr
                    const isSel   = ds === gridSel
                    const dots    = (visibleMap[ds] ?? []).slice(0, 3).map(ev => ev.color ?? DOT_COLOR[ev.type])
                    return (
                      <button key={i}
                        onClick={() => {
                          setGridSel(ds)
                          const sc = scrollRef.current, el = dayRefs.current.get(ds)
                          if (sc && el) { const cR = sc.getBoundingClientRect(), eR = el.getBoundingClientRect(); sc.scrollTop = sc.scrollTop + eR.top - cR.top - 16 }
                        }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', outline: 'none', gap: 2, minWidth: 0 }}
                      >
                        <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? '#D4AF37' : isSel ? 'rgba(212,175,55,0.15)' : 'transparent', flexShrink: 0 }}>
                          <span style={{ fontSize: 12, fontWeight: isToday ? 700 : isSel ? 600 : 400, color: isToday ? '#000' : isSel ? '#D4AF37' : 'rgb(var(--rgb-ink) / 0.72)', fontFamily: 'var(--font-montserrat)', lineHeight: 1 }}>{day}</span>
                        </div>
                        {dots.length > 0 && (
                          <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                            {dots.map((c, di) => <span key={di} style={{ width: 3, height: 3, borderRadius: '50%', background: c, flexShrink: 0 }} />)}
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Drag handle — tap to toggle, drag to resize */}
            <div
              style={{ height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'row-resize', background: 'var(--color-bg-base)', borderTop: '1px solid rgb(var(--rgb-ink) / 0.05)' }}
              onClick={() => { if (!handleDragRef.current) setGridH(g => g > 0 ? 0 : GRID_EXPANDED) }}
              onTouchStart={(e) => { e.stopPropagation(); handleDragRef.current = { startY: e.touches[0].clientY, startH: gridH }; setIsDraggingHandle(true) }}
              onTouchMove={(e) => { if (!handleDragRef.current) return; e.stopPropagation(); const dy = e.touches[0].clientY - handleDragRef.current.startY; setGridH(Math.max(0, Math.min(GRID_EXPANDED, handleDragRef.current.startH + dy))) }}
              onTouchEnd={(e) => { e.stopPropagation(); setIsDraggingHandle(false); handleDragRef.current = null; setGridH(g => g > GRID_EXPANDED / 2 ? GRID_EXPANDED : 0) }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgb(var(--rgb-ink) / 0.18)' }} />
            </div>

            {/* Infinite scroll list — same design as before */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {/* Gold month label — visible only in full-list mode (gridH === 0) */}
              <div
                style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 20, zIndex: 5,
                         display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                         opacity: gridH === 0 ? 1 : 0,
                         pointerEvents: gridH === 0 ? 'auto' : 'none',
                         transition: isDraggingHandle ? 'none' : 'opacity 0.3s cubic-bezier(0.4,0,0.2,1)' }}
                onDoubleClick={scrollListToToday}
                onTouchEnd={(e) => {
                  e.preventDefault()
                  const now = Date.now()
                  if (now - monthLblTapRef.current < 350) { monthLblTapRef.current = 0; scrollListToToday() }
                  else { monthLblTapRef.current = now }
                }}
              >
                <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 800, color: 'rgba(212,175,55,0.65)', userSelect: 'none', whiteSpace: 'nowrap' }}>
                  {sideLbl}
                </span>
              </div>
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
                        style={{ display: 'flex', alignItems: 'stretch', paddingLeft: gridH === 0 ? 20 : 6, background: 'var(--color-bg-surface)', cursor: 'grab',
                                 transition: isDraggingHandle ? 'none' : 'padding-left 0.3s cubic-bezier(0.4,0,0.2,1)' }}
                      >
                        {/* Day label — width matches one grid column when split is open, original 44px in full-list mode */}
                        <div style={{ width: gridH === 0 ? 44 : 'calc((100vw - 12px) / 7)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-surface)',
                                      transition: isDraggingHandle ? 'none' : 'width 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
                          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 9, letterSpacing: '0.09em', textTransform: 'uppercase', lineHeight: 1.2, userSelect: 'none', whiteSpace: 'nowrap' }}>
                            <span style={{ color: isTod ? '#D4AF37' : 'rgb(var(--rgb-ink) / 0.75)', fontWeight: 700 }}>{abbr}</span>
                            <span style={{ color: isTod ? '#c9a84c' : 'rgb(var(--rgb-ink) / 0.25)', fontWeight: 500 }}>{' '}{day}</span>
                          </span>
                        </div>
                        {/* Vertical rule */}
                        <div style={{ width: 1, flexShrink: 0, background: isTod ? 'rgba(201,168,76,0.35)' : 'rgb(var(--rgb-ink) / 0.04)', marginTop: 8, marginBottom: 8 }} />
                        {/* Events */}
                        <div
                          onClick={() => { navigator.vibrate?.(6); openCreatePopover(null, ds) }}
                          style={{ flex: 1, paddingLeft: 12, paddingRight: 14, paddingTop: 6, paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 2, minHeight: 112, background: stripe ? 'var(--color-bg-surface)' : 'var(--color-bg-elevated)', cursor: 'text' }}>
                          {events.map((ev, idx) => {
                            const bar  = ev.color ?? DETAIL_DOT[ev.type]
                            const M    = 'var(--font-montserrat)'
                            const row2: string | null = ev.type === 'google'
                              ? (ev.amount ? getTimeRange(ev) : 'ALL DAY')
                              : (ev.amount || null)
                            return (
                              <button key={idx} onClick={e => { e.stopPropagation(); navigator.vibrate?.(6); if (ev.id) { handleOpenEdit(ev) } else { setSelectedDay(ds); setViewIndex(1) } }}
                                style={{ display: 'flex', alignItems: 'stretch', width: '100%', background: 'none', border: 'none', padding: '10px 0', cursor: 'pointer', textAlign: 'left', gap: 9 }}>
                                <div style={{ width: 3, borderRadius: 2, background: bar, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 14, fontWeight: 500, color: isTod ? 'rgb(var(--rgb-ink) / 0.95)' : 'rgb(var(--rgb-ink) / 0.82)', fontFamily: M, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.35 }}>
                                    {ev.title}
                                  </p>
                                  {row2 && (
                                    <p style={{ fontSize: 11, color: 'rgb(var(--rgb-ink) / 0.32)', fontFamily: M, margin: '3px 0 0', lineHeight: 1.3 }}>
                                      {row2}
                                    </p>
                                  )}
                                  {ev.location && (
                                    <p style={{ fontSize: 11, color: 'rgb(var(--rgb-ink) / 0.26)', fontFamily: M, margin: '2px 0 0', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            PANEL 1 — Daily Summary (Timepage style)
            Right swipe → Panel 0
        ═══════════════════════════════════════════════════════════════ */}
        <div style={{ width: '100vw', height: '100%', flex: 'none', background: 'var(--color-bg-base)', display: 'flex', flexDirection: 'column', touchAction: 'pan-y', userSelect: 'none' }}
          onTouchStart={v3Start} onTouchEnd={v3End}
          onMouseDown={v3MouseDown} onMouseUp={v3MouseUp} onMouseLeave={() => { v3Swipe.current = null }}>

          {/* Centered date header */}
          <div style={{ flexShrink: 0, paddingTop: SAFE_TOP, paddingBottom: 28, textAlign: 'center', background: 'var(--color-bg-base)' }}>
            <p style={{ fontSize: 10, letterSpacing: '0.26em', fontWeight: 700, textTransform: 'uppercase', color: 'rgba(212,175,55,0.65)', margin: '0 0 2px', fontFamily: 'var(--font-montserrat)' }}>
              {dayName}
            </p>
            <p style={{ fontSize: 96, fontWeight: 800, color: 'rgb(var(--rgb-ink) / 0.95)', letterSpacing: '-0.02em', lineHeight: 0.95, margin: '0 0 8px', fontFamily: 'var(--font-big-shoulders)' }}>
              {dayNum}
            </p>
            <p style={{ fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgb(var(--rgb-ink) / 0.3)', margin: 0, fontFamily: 'var(--font-montserrat)' }}>
              {dayMonthYr}
            </p>
          </div>

          {/* Airy event list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {(() => {
              // Prefer custom events over google duplicates (same event shows twice if dedup misfired)
              const customGids = new Set<string>()
              const eventsToShow = dayEvents.filter(e => e.type !== 'google' || !e.id || !customGids.has(e.id))
              return eventsToShow.length === 0 ? (
              <div style={{ paddingTop: 52, textAlign: 'center', color: 'rgb(var(--rgb-ink) / 0.15)', fontSize: 13, fontFamily: 'var(--font-montserrat)', letterSpacing: '0.06em' }}>
                Nothing scheduled
              </div>
            ) : (
              <div style={{ padding: '0 32px' }}>
                {eventsToShow.map((ev, idx) => {
                  const timeRange = getTimeRange(ev)
                  const dot = ev.color ?? DETAIL_DOT[ev.type]
                  const amt = ev.type !== 'google' ? ev.amount : null
                  return (
                    <DayEventCard key={idx} ev={ev} dot={dot} timeRange={timeRange} amt={amt} onDelete={handleDeleteCalEvent} onEdit={handleOpenEdit} />
                  )
                })}
              </div>
            )
            })()}
            <div style={{ height: 96 }} />
          </div>

          {/* Weather — pinned bottom */}
          {selectedDay && weatherMap[selectedDay] && (() => {
            const w = weatherMap[selectedDay]!
            const { Icon: WeatherIcon, desc } = getWeatherInfo(w.code)
            return (
              <div style={{ flexShrink: 0, textAlign: 'center', paddingTop: 18, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)', borderTop: '1px solid rgb(var(--rgb-ink) / 0.05)', background: 'var(--color-bg-base)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><WeatherIcon size={26} strokeWidth={1.25} color="rgb(var(--rgb-ink) / 0.45)" /></div>
                <p style={{ fontSize: 30, fontWeight: 600, color: 'rgb(var(--rgb-ink) / 0.6)', fontFamily: 'var(--font-montserrat)', margin: '0 0 5px', letterSpacing: '-0.01em' }}>
                  {w.high}° / {w.low}°
                </p>
                <p style={{ fontSize: 11, color: 'rgb(var(--rgb-ink) / 0.28)', fontFamily: 'var(--font-montserrat)', letterSpacing: '0.04em', margin: 0 }}>
                  {desc}{w.precipProb > 0 ? ` · ${w.precipProb}% rain` : ''} · {w.wind}mph wind
                </p>
              </div>
            )
          })()}
        </div>

      </div>{/* end sliding rail */}
    </div>{/* end root */}

    {/* FAB — iPhone day view: create event */}
    {!isLargeScreen && viewIndex === 1 && prefs.googleCalendarIds.length > 0 && (
      <button
        onClick={() => openCreatePopover(null, selectedDay ?? todayStr)}
        className="fixed gradient-gold rounded-full flex items-center justify-center text-white font-light select-none"
        style={{ right: 16, bottom: 80, width: 56, height: 56, fontSize: 28, zIndex: 40, boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.25)' }}
        aria-label="Add event"
      >+</button>
    )}

    <EditEventSheet open={!!editEvent} event={editEvent} googleCals={googleCals.filter(c => prefs.googleCalendarIds.includes(c.id))} onClose={() => setEditEvent(null)} onSave={handleEditEvent} onDelete={_scope => { if (editEvent) { const ev: CalEvent = { id: editEvent.id, title: editEvent.title, type: 'google', amount: '', calendarId: editEvent.calendarId }; handleDeleteCalEvent(ev) } setEditEvent(null) }} />
    <CalendarSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} prefs={prefs} googleCals={googleCals} calsLoading={calsLoading} onSave={savePrefs} />

    {/* Sidebar context menu */}
    {sidebarCtxMenu && (() => {
      const { id, kind, x, y } = sidebarCtxMenu
      const isHidden = kind === 'type' ? hiddenTypes.has(id as EventType) : hiddenGoogleCals.has(id)
      type MenuItem = { label: string; action: () => void; danger?: boolean }
      const items: MenuItem[] = [
        {
          label: isHidden ? 'Show' : 'Hide',
          action: () => {
            if (kind === 'type') setHiddenTypes(prev => { const next = new Set(prev); if (next.has(id as EventType)) next.delete(id as EventType); else next.add(id as EventType); return next })
            else setHiddenGoogleCals(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
            setSidebarCtxMenu(null)
          },
        },
        {
          label: 'Change Color',
          action: () => { colorInputRefs.current.get(id)?.click(); setSidebarCtxMenu(null) },
        },
        ...(kind === 'type' && typeColors[id as EventType] ? [{
          label: 'Reset Color',
          action: () => { setTypeColors(p => { const n = { ...p }; delete n[id as EventType]; return n }); setSidebarCtxMenu(null) },
        }] : []),
        ...(kind === 'google' ? [{
          label: 'Remove Calendar',
          danger: true,
          action: () => {
            savePrefs({ ...prefs, googleCalendarIds: prefs.googleCalendarIds.filter(c => c !== id) })
            setSidebarCtxMenu(null)
          },
        }] : []),
      ]
      const menuW = 168
      const menuH = items.length * 32 + 8
      return (
        <div ref={ctxMenuRef} style={{
          position: 'fixed',
          top:  Math.min(y, window.innerHeight - menuH - 8),
          left: Math.min(x, window.innerWidth  - menuW - 8),
          width: menuW,
          background: '#21242A',
          border: '0.5px solid rgba(255,255,255,0.1)',
          borderRadius: 10,
          zIndex: 300,
          boxShadow: '0 4px 24px rgba(0,0,0,0.55)',
          overflow: 'hidden',
          fontFamily: 'var(--font-montserrat)',
          padding: '4px 0',
        }}>
          {items.map(item => (
            <button key={item.label} onClick={item.action} style={{
              display: 'block', width: '100%', padding: '7px 14px',
              background: 'none', border: 'none', cursor: 'pointer',
              textAlign: 'left', fontSize: 13,
              color: item.danger ? '#ef4444' : 'var(--color-ink)',
              fontFamily: 'var(--font-montserrat)',
            }}>
              {item.label}
            </button>
          ))}
        </div>
      )
    })()}

    {popover && (
      <CalendarPopover
        anchorRect={popover.anchorRect}
        mode={popover.mode}
        initial={popover.data}
        googleCals={googleCals.filter(c => prefs.googleCalendarIds.includes(c.id))}
        googleCalendarColors={prefs.googleCalendarColors}
        onClose={() => setPopover(null)}
        onSave={handlePopoverSave}
        onDelete={popover.mode === 'edit' ? handlePopoverDelete : undefined}
        saving={popoverSaving}
      />
    )}
    </>
  )
}
