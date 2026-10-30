'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { getWeekStartsMonday } from '@/lib/week-start'
import { cn, nextRenewalDate } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { COLOR_PALETTE } from '@/lib/category-meta'
import { Plus, SlidersHorizontal, Eye, EyeOff, Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudSnow, CloudLightning, CalendarPlus, MapPin, type LucideIcon , ChevronLeft, ChevronRight} from 'lucide-react'
import { GlobalFAB } from '@/components/ui/GlobalFAB'
import { EditEventSheet, type EditableEvent, type EventEdits, type RecurrenceScope } from '@/components/calendar/EditEventSheet'
import { CalendarSettingsSheet, canWriteToCalendar, type CalPrefs, type GCalendar } from '@/components/calendar/CalendarSettingsSheet'
import { CalendarPopover, defaultTimes, type PopoverFormData, type RecurScope } from '@/components/calendar/CalendarPopover'
import { MonthYearPicker } from '@/components/calendar/MonthYearPicker'
import { pageCache } from '@/lib/page-cache'
import { createCalEvent, updateCalEvent, deleteCalEvent, moveCalEvent, getCalEvent, extractRRule, rruleUntilBefore, type GCalEvent, calFetch } from '@/lib/calendar'
import { connectGoogleCalendar } from '@/lib/gcal-connect'
import { useOnScreenReturn, useScreenActive } from '@/lib/tab-nav'
import { sameAsLast } from '@/lib/same-data'
import { Segmented } from '@/components/ui/Form'
import { useToday } from '@/lib/use-today'

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
  recurringEventId?: string // Google master id — present on expanded recurring instances
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
function addDays(ds: string, n: number): string {
  const [y, m, d] = ds.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return toDateStr(dt.getFullYear(), dt.getMonth(), dt.getDate())
}
// Start/end for `ev` moved from `fromDate` to begin on `toDate`, keeping its
// length (multi-day spans, past-midnight timed events). All-day ends are
// exclusive in Google — an end equal to the start is rejected as empty.
function shiftedTimes(ev: CalEvent, fromDate: string, toDate: string): { start: GCalEvent['start']; end: GCalEvent['end']; endDate?: string } {
  const endDay = addDays(ev.endDate ?? fromDate, daysBetween(fromDate, toDate))
  const endDate = endDay !== toDate ? endDay : undefined
  if (!ev.amount?.trim()) return { start: { date: toDate }, end: { date: addDays(endDay, 1) }, endDate }
  const [st, et] = ev.amount.split(' – ').map(t => t.trim())
  return {
    start: { dateTime: `${toDate}T${st || '09:00'}:00`, timeZone: 'America/Los_Angeles' },
    end:   { dateTime: `${endDay}T${et || st || '10:00'}:00`, timeZone: 'America/Los_Angeles' },
    endDate,
  }
}
// Google events within a day: all-day first, then by start time.
// `amount` is "HH:MM – HH:MM" for timed events, '' for all-day.
function byStart(a: CalEvent, b: CalEvent): number {
  const x = a.amount ? a.amount.slice(0, 5) : ''
  const y = b.amount ? b.amount.slice(0, 5) : ''
  return x < y ? -1 : x > y ? 1 : 0
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

type SpanBar  = { startCol: number; endCol: number; ev: CalEvent }
type CellSlot =
  | { kind: 'bar'; bar: SpanBar; lane: number }
  | { kind: 'gap' }
  | { kind: 'ev'; ev: CalEvent; timed: boolean }

// Google-Calendar-style month cell: each week row is one grid of EV_ROW_H
// slots. A multi-day bar owns its lane's slot on every day it covers; a lane
// slot with no bar on this day is filled by the day's next single-day event
// rather than left blank, so a day is never pushed down by bars it isn't part
// of and items line up across the week. Bars always show; single events stop
// at `cap` slots and the rest are reported as overflow.
function layoutCell(lanes: SpanBar[][], col: number, singles: Array<{ ev: CalEvent; timed: boolean }>, cap: number): { slots: CellSlot[]; overflow: number } {
  const covers = (b: SpanBar) => b.startCol <= col && b.endCol >= col
  let lastLane = -1
  lanes.forEach((lane, li) => { if (lane.some(covers)) lastLane = li })
  const slots: CellSlot[] = []
  let si = 0
  for (let li = 0; li <= lastLane; li++) {
    const bar = lanes[li].find(covers)
    if (bar)                                          slots.push({ kind: 'bar', bar, lane: li })
    else if (si < singles.length && slots.length < cap) slots.push({ kind: 'ev', ...singles[si++] })
    else                                              slots.push({ kind: 'gap' })
  }
  while (si < singles.length && slots.length < cap) slots.push({ kind: 'ev', ...singles[si++] })
  return { slots, overflow: singles.length - si }
}

const DESK_VIEWS = ['month', 'list'] as const
const SAFE_TOP = 'calc(max(env(safe-area-inset-top, 0px), 44px) + 12px)'
const GRID_EXPANDED = 280  // px — compact month grid height in split view
const SNAP = 'height 0.3s cubic-bezier(0.4,0,0.2,1)'

// ── Notion month grid sizing constants (single source of truth) ──────────────
const MAX_VIS_EVENTS = 6   // max event rows per cell — governs both height and overflow cutoff
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
        {ev.location && <p className="text-[11px] text-ink-muted mt-0.5 truncate flex items-center gap-1"><MapPin size={11} strokeWidth={1.75} className="flex-shrink-0" />{ev.location}</p>}
        {ev.notes    && <p className="text-[11px] text-ink-faint mt-0.5 line-clamp-2">{ev.notes}</p>}
      </div>
      {displayAmt && <span className="text-[11px] font-semibold font-mono px-2 py-0.5 rounded-md flex-shrink-0 bg-blue-500/20 text-blue-300">{displayAmt}</span>}
    </>
  )
  return isEditable
    ? <button onClick={() => onEdit(ev)} className="flex items-start gap-3 px-4 py-3.5 w-full text-left bg-transparent border-none cursor-pointer hover:bg-ink/[0.02] transition-colors">{inner}</button>
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


export default function CalendarPage() {
  const router   = useRouter()
  // Moves to the new day at midnight / on return — a mount-time Date kept showing yesterday
  const today    = useToday()
  const todayStr = useMemo(() => toDateStr(today.getFullYear(), today.getMonth(), today.getDate()), [today])

  // ── View state: 0=Split/Grid 1=Day ───────────────────────────────────────
  const [viewIndex,         setViewIndex]         = useState<0 | 1>(0)
  const [selectedDay,       setSelectedDay]       = useState<string | null>(null)
  const [gridH,             setGridH]             = useState(GRID_EXPANDED)
  const [isDraggingHandle,  setIsDraggingHandle]  = useState(false)
  const [monthPickerOpen,   setMonthPickerOpen]   = useState(false)

  // Grid state
  const [gridYear,  setGridYear]  = useState(today.getFullYear())
  const [gridMonth, setGridMonth] = useState(today.getMonth())
  const [gridSel,   setGridSel]   = useState<string | null>(() => {
    const t = new Date()
    return toDateStr(t.getFullYear(), t.getMonth(), t.getDate())
  })

  // Data
  // Seeded from the page cache so revisiting the tab paints last-known events
  // immediately; the fetches below replace them.
  const [eventMap,    setEventMap]    = useState<Record<string, CalEvent[]>>(() => pageCache.get('cal-events') ?? {})
  const [googleEvMap, setGoogleEvMap] = useState<Record<string, CalEvent[]>>(() => pageCache.get('cal-google') ?? {})
  const [prefs,       setPrefs]       = useState<CalPrefs>(DEFAULT_PREFS)
  const [googleCals,  setGoogleCals]  = useState<GCalendar[]>([])
  const [calsLoading, setCalsLoading] = useState(false)
  const [calsError,   setCalsError]   = useState(false)
  const [settingsOpen,   setSettingsOpen]   = useState(false)
  const [needsCalConnect,    setNeedsCalConnect]    = useState(false)  // 403 from /api/calendar → prompt to reconnect
  const [calConnectDismissed, setCalConnectDismissed] = useState(false)
  const [userEmail,          setUserEmail]          = useState<string | null>(null)
  const [weatherMap,     setWeatherMap]     = useState<Record<string, DayWeather>>({})
  const [editEvent,      setEditEvent]      = useState<EditableEvent | null>(null)
  const [createEvent,    setCreateEvent]    = useState<EditableEvent | null>(null)
  const [popover,        setPopover]        = useState<{ anchorRect: DOMRect | null; mode: 'create' | 'edit'; data: PopoverFormData } | null>(null)
  const [dataLoaded,     setDataLoaded]     = useState(() => !!pageCache.get('cal-events'))
  const [gRefreshKey,    setGRefreshKey]    = useState(0)
  // Month-grid weeks whose "+N more" was clicked open. Session-only on purpose:
  // a refresh collapses every row back to the normal height.
  const [expandedWeeks,  setExpandedWeeks]  = useState<Set<string>>(() => new Set())

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
  const swatchRef           = useRef<HTMLDivElement>(null)
  const ctxMenuRef          = useRef<HTMLDivElement>(null)
  const colorInputRefs      = useRef(new Map<string, HTMLInputElement>())
  const longPressTimer      = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [swatchOpen,      setSwatchOpen]      = useState<{ id: string; kind: 'type' | 'google'; top: number; left: number } | null>(null)
  const [hoveredPillKey,  setHoveredPillKey]  = useState<string | null>(null)
  const [selectedEvId,    setSelectedEvId]    = useState<string | null>(null)
  const [deleteConfirm,   setDeleteConfirm]   = useState<CalEvent | null>(null)
  const [dragState,    setDragState]    = useState<{ ev: CalEvent; originDate: string } | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [copiedEvent,  setCopiedEvent]  = useState<CalEvent | null>(null)
  const [pasteDate,    setPasteDate]    = useState<string | null>(null)
  const [evCtxMenu,    setEvCtxMenu]    = useState<{ x: number; y: number; ev: CalEvent; date: string } | null>(null)
  const evCtxRef = useRef<HTMLDivElement>(null)
  const [createDrag, setCreateDrag] = useState<{ anchor: string; start: string; end: string } | null>(null)
  const createDragRef = useRef<{ anchor: string; start: string; end: string } | null>(null)
  const [hiddenTypes,       setHiddenTypes]       = useState<Set<EventType>>(new Set())
  const [hiddenGoogleCals,  setHiddenGoogleCals]  = useState<Set<string>>(() => {
    try { const s = localStorage.getItem('cal-hidden-google-cals'); return s ? new Set(JSON.parse(s)) : new Set() } catch { return new Set() }
  })
  const [notionGridLbl, setNotionGridLbl] = useState(() =>
    new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  )
  const [narrowGrid, setNarrowGrid] = useState(false)
  const [hoveredSidebarRow, setHoveredSidebarRow] = useState<string | null>(null)
  const [hoveredSidebarDay, setHoveredSidebarDay] = useState<string | null>(null)
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

  // Covers both mobile list months and Notion grid weeks so Google events load
  // regardless of which view is active or how far the user has scrolled.
  const gEvRangeKey = useMemo(() => {
    const mFirst = months[0], mLast = months[months.length - 1]
    const mMin = new Date(mFirst.year, mFirst.month, 1)
    const mMax = new Date(mLast.year, mLast.month + 1, 0)
    const wks = notionWeeksRef.current.length > 0 ? notionWeeksRef.current : notionWeeks
    const wMin = new Date(wks[0] + 'T00:00:00')
    const wMax = new Date(wks[wks.length - 1] + 'T00:00:00'); wMax.setDate(wMax.getDate() + 6)
    const rangeMin = new Date(Math.min(mMin.getTime(), wMin.getTime()))
    const rangeMax = new Date(Math.max(mMax.getTime(), wMax.getTime()))
    return `${rangeMin.toISOString().slice(0, 7)}..${rangeMax.toISOString().slice(0, 7)}`
  }, [months, notionWeeks])

  const supabase      = useMemo(() => createClient(), [])
  const loadGen       = useRef(0)
  const eventSigRef   = useRef('')
  const prefsSigRef   = useRef('')
  const abortRef      = useRef<AbortController | null>(null)
  const gEvGen        = useRef(0)
  const editRuleGen   = useRef(0)   // guards the async master-RRULE fetch on edit-open
  const [deleteScopeAsk, setDeleteScopeAsk] = useState<{ ev: CalEvent; date: string } | null>(null)
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
const suppressPrepend   = useRef(true)   // true initially — cleared after scroll-to-today so prepend IO doesn't clobber initial position
  const scrolledToToday   = useRef(false)
  const googleRescrollDone = useRef(false) // prevents re-scroll after the first Google events load
  const gridSwipe       = useRef<{ x: number; y: number } | null>(null)
  // Split-view handle: dragged with native listeners (see the effect below)
  const gridWrapRef     = useRef<HTMLDivElement>(null)
  const gridHRef        = useRef(gridH)
  gridHRef.current      = gridH
  const [handleEl, setHandleEl] = useState<HTMLDivElement | null>(null)
  const dragOverRef     = useRef<string | null>(null)
  const monthLblTapRef   = useRef<number>(0)                              // timestamp of last month-label tap (double-tap detect)
  const monthLblTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)  // pending single-tap (open picker) timer

  useEffect(() => { monthsRef.current = months }, [months])
  useEffect(() => { notionWeeksRef.current = notionWeeks }, [notionWeeks])
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
  // Drag the split-view handle to resize the month grid; flick or pass halfway
  // to snap open/closed; tap toggles. Native listeners with touch-action:none
  // so iOS never claims the swipe as a page scroll (it cancelled the drag
  // partway — several tries to move it — and after view transitions refused
  // it outright), and the height is written to the DOM per move: setting React
  // state re-rendered the whole calendar on every pixel.
  useEffect(() => {
    const el = handleEl
    if (!el) return
    let startY = 0, startH = 0, lastY = 0, lastT = 0, v = 0
    let active = false, moved = false
    const clampH = (h: number) => Math.max(0, Math.min(GRID_EXPANDED, h))
    const onStart = (e: TouchEvent) => {
      const y = e.touches[0].clientY
      startY = lastY = y; lastT = e.timeStamp; startH = gridHRef.current
      v = 0; active = true; moved = false
      e.stopPropagation()
    }
    const onMove = (e: TouchEvent) => {
      if (!active) return
      e.preventDefault(); e.stopPropagation()
      const y = e.touches[0].clientY
      if (!moved && Math.abs(y - startY) < 4) return
      if (!moved) { moved = true; setIsDraggingHandle(true) }
      const dt = Math.max(1, e.timeStamp - lastT)
      v = v * 0.6 + ((y - lastY) / dt) * 0.4          // px/ms, smoothed
      lastY = y; lastT = e.timeStamp
      const w = gridWrapRef.current
      if (w) { w.style.transition = 'none'; w.style.height = `${clampH(startH + y - startY)}px` }
    }
    const onEnd = (e: TouchEvent) => {
      if (!active) return
      active = false
      e.stopPropagation()
      let target: number
      if (!moved) {
        e.preventDefault()                            // no synthetic click: this was the tap
        target = gridHRef.current > 0 ? 0 : GRID_EXPANDED
      } else {
        const h = clampH(startH + lastY - startY)
        target = Math.abs(v) > 0.3 ? (v > 0 ? GRID_EXPANDED : 0) : (h > GRID_EXPANDED / 2 ? GRID_EXPANDED : 0)
      }
      const w = gridWrapRef.current
      if (w) { w.style.transition = SNAP; w.style.height = `${target}px` }
      setIsDraggingHandle(false)
      setGridH(target)
    }
    el.addEventListener('touchstart',  onStart, { passive: true })
    el.addEventListener('touchmove',   onMove,  { passive: false })
    el.addEventListener('touchend',    onEnd,   { passive: false })
    el.addEventListener('touchcancel', onEnd,   { passive: false })
    return () => {
      el.removeEventListener('touchstart',  onStart)
      el.removeEventListener('touchmove',   onMove)
      el.removeEventListener('touchend',    onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [handleEl])

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++loadGen.current
    try {
      const [{ data: inc }, { data: subs }, { data: streams }, { data: profile }] =
        await Promise.all([
          supabase.from('income').select('name, amount, date').abortSignal(controller.signal),
          supabase.from('subscriptions').select('name, cost, next_renewal, billing').eq('status', 'Active').abortSignal(controller.signal),
          supabase.from('revenue_streams').select('name, amount, freq, next_pay_date').abortSignal(controller.signal),
          supabase.from('profiles').select('calendar_prefs').abortSignal(controller.signal).single(),
        ])
      if (gen !== loadGen.current) return
      // Same prefs → keep the old object: a fresh googleCalendarIds array re-ran
      // the Google fetch effect, doubling the refetch on every return
      if (profile?.calendar_prefs && !sameAsLast(prefsSigRef, profile.calendar_prefs)) setPrefs(profile.calendar_prefs as CalPrefs)

      // Use browser local date — must match todayStr (which also uses new Date()) so that
      // events advanced to "today" are not immediately classified as isPast
      const _now = new Date()
      const calToday = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
      const map: Record<string, CalEvent[]> = {}
      const push = (date: string, ev: CalEvent) => { if (!map[date]) map[date] = []; map[date].push(ev) }

      // Historical income entries
      for (const i of inc ?? []) push(String(i.date), { title: String(i.name), type: 'income', amount: `+$${Number(i.amount).toFixed(2)}` })

      // Upcoming income from revenue streams — advance stale next_pay_date to today or future
      function advancePayDate(date: string, freq: string): string {
        const [y, m, d] = date.split('-').map(Number)
        const dt = freq === 'Weekly'       ? new Date(y, m - 1, d + 7)  :
                   freq === 'Biweekly'    ? new Date(y, m - 1, d + 14) :
                   freq === 'Semimonthly' ? new Date(y, m - 1, d + 15) :
                                            new Date(y, m, d)            // Monthly
        return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
      }
      for (const r of streams ?? []) {
        if (!r.next_pay_date || !r.freq) continue
        let payDate = String(r.next_pay_date)
        while (payDate < calToday) payDate = advancePayDate(payDate, String(r.freq))
        push(payDate, { title: String(r.name), type: 'income', amount: `+$${Number(r.amount).toFixed(2)}` })
      }

      // Subscriptions — advance stale next_renewal to today or future
      // Guard: skip entirely if billing is missing (can't advance without it)
      for (const s of subs ?? []) {
        if (!s.next_renewal || !s.billing) continue
        let renewDate = String(s.next_renewal)
        while (renewDate < calToday) renewDate = nextRenewalDate(renewDate, s.billing as Parameters<typeof nextRenewalDate>[1])
        push(renewDate, { title: String(s.name), type: 'sub', amount: `$${Number(s.cost).toFixed(2)}` })
      }
      if (!sameAsLast(eventSigRef, map)) {
        setEventMap(map)
        pageCache.set('cal-events', map)
      }
      setDataLoaded(true)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('loadData error:', err)
    }
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++; abortRef.current?.abort() } }, [loadData])
  // Kept alive across tabs — refresh quietly whenever this screen is shown again
  useOnScreenReturn(() => { loadData(); setGRefreshKey(k => k + 1) })

  // Leaving the calendar drops its transient selection state. Its keyboard
  // shortcuts listen on the document, so a selection or copied event left
  // behind would let Backspace / ⌘V act on the calendar from another tab.
  const screenActive = useScreenActive()
  useEffect(() => {
    if (screenActive) return
    setSelectedEvId(null); setPopover(null); setEvCtxMenu(null); setSidebarCtxMenu(null)
    setSwatchOpen(null); setCopiedEvent(null); setPasteDate(null)
    setDeleteConfirm(null); setDeleteScopeAsk(null)
  }, [screenActive])

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
    setCalsError(false)
    calFetch('/api/calendar?action=calendars')
      .then(async r => {
        const d = await r.json() as { items?: GCalendar[]; error?: string }
        if (r.status === 403) { setNeedsCalConnect(true); throw new Error('no_token') }
        if (!r.ok || d.error) throw new Error(d.error ?? 'no_token')
        setNeedsCalConnect(false)
        setGoogleCals(d.items ?? [])
      })
      .catch(() => setCalsError(true))
      .finally(() => setCalsLoading(false))
  }, [settingsOpen, googleCals.length, prefs.googleCalendarIds.length])

  // On mount / manual refresh: probe Calendar access so we can prompt to connect
  // right here on the Calendar tab when the token is missing or expired (403).
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => { if (!cancelled) setUserEmail(data.user?.email ?? null) })
    calFetch('/api/calendar?action=calendars')
      .then(r => { if (!cancelled) setNeedsCalConnect(r.status === 403) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [supabase, gRefreshKey])

  useEffect(() => {
    const calIds = prefs.googleCalendarIds
    if (calIds.length === 0) { setGoogleEvMap({}); return }
    const gen = ++gEvGen.current
    // Parse range from gEvRangeKey (YYYY-MM..YYYY-MM)
    const [minPart, maxPart] = gEvRangeKey.split('..')
    const [minY, minM] = minPart.split('-').map(Number)
    const [maxY, maxM] = maxPart.split('-').map(Number)
    const tMin = new Date(minY, minM - 1, 1).toISOString()
    const tMax = new Date(maxY, maxM, 0, 23, 59, 59).toISOString()
    const clr: Record<string, string> = {}
    for (const c of googleCals) clr[c.id] = c.backgroundColor
    Promise.all(calIds.map(calId =>
      calFetch(`/api/calendar?action=events&calendarId=${encodeURIComponent(calId)}&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`)
        .then(async r => {
          const d = await r.json() as { items?: Array<{ id: string; summary?: string; description?: string; location?: string; start: { date?: string; dateTime?: string }; end: { date?: string; dateTime?: string } }> }
          return { calId, items: d.items ?? [], ok: r.ok, status: r.status }
        })
        .catch(() => ({ calId, items: [], ok: false, status: 0 }))
    )).then(results => {
      if (gen !== gEvGen.current) return
      // A calendar whose fetch failed keeps its last-known events instead of
      // blanking out; 403 (needs reconnect) already has its own banner.
      const failed = new Set(results.filter(r => !r.ok).map(r => r.calId))
      if (results.some(r => !r.ok && r.status !== 403)) showToast('Couldn’t refresh some calendars — showing last loaded events', { type: 'delete' })
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
          } else if (!isAllDay && ev.end.dateTime) {
            // Timed event ending on a different day (e.g. 11:30 PM → 5:00 AM next day)
            const endDay = ev.end.dateTime.slice(0, 10)
            if (endDay !== date) endDate = endDay
          }
          if (!map[date]) map[date] = []
          map[date].push({ id: ev.id, title: ev.summary ?? '(no title)', type: 'google', amount: st ? `${st}${et ? ` – ${et}` : ''}` : '', location: ev.location, notes: ev.description, color, endDate, calendarId: calId, instanceDate: date, recurringEventId: (ev as { recurringEventId?: string }).recurringEventId })
        }
      }
      setGoogleEvMap(prev => {
        if (failed.size) {
          for (const [date, evs] of Object.entries(prev)) {
            const keep = evs.filter(e => e.calendarId && failed.has(e.calendarId))
            if (keep.length) map[date] = [...(map[date] ?? []), ...keep]
          }
        }
        // Merge across calendars by time: all-day first, then by start
        // ("HH:MM" strings sort chronologically; all-day has none).
        for (const date of Object.keys(map)) {
          map[date].sort(byStart)
        }
        // Unchanged (the usual return-to-tab refetch): keep the old map so the
        // grid doesn't re-render
        if (JSON.stringify(map) === JSON.stringify(prev)) return prev
        pageCache.set('cal-google', map)
        return map
      })
    })
    return () => { gEvGen.current++ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.googleCalendarIds, gEvRangeKey, googleCals, gRefreshKey])

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
    // Re-apply colors from live prefs. `color` is baked into the event map at
    // fetch time, and the fetch doesn't re-run when a colour is changed — so
    // without this, recolouring a calendar only updated the Notion grid (which
    // derives its own colour) and left the day list and detail views stale.
    for (const date of Object.keys(m)) {
      m[date] = m[date].map(e => {
        const live = e.type === 'google' && e.calendarId
          ? prefs.googleCalendarColors?.[e.calendarId]
          : prefs.typeColors?.[e.type]
        return live && live !== e.color ? { ...e, color: live } : e
      })
    }
    return m
  }, [eventMap, googleEvMap, prefs.visibleTypes, prefs.googleCalendarColors, prefs.typeColors])

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

  useEffect(() => {
    if (!swatchOpen) return
    const onDown = (e: MouseEvent) => { if (!swatchRef.current?.contains(e.target as Node)) setSwatchOpen(null) }
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') setSwatchOpen(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [swatchOpen])

  // Keyboard delete for selected event in Notion month grid
  useEffect(() => {
    if (!selectedEvId || !isLargeScreen) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        for (const evs of Object.values(googleEvMap)) {
          const found = evs.find(ev => ev.id === selectedEvId)
          // Recurring events go straight to the scope prompt — picking a scope
          // is itself the confirmation, so a plain "are you sure" first would
          // be two dialogs for one action.
          if (found) { found.recurringEventId ? handleDeleteCalEvent(found) : setDeleteConfirm(found); break }
        }
      } else if (e.key === 'Escape') {
        setSelectedEvId(null)
        setPopover(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selectedEvId, isLargeScreen, googleEvMap])

  // Cmd/Ctrl+C to copy selected event, Cmd/Ctrl+V to paste to hovered cell
  useEffect(() => {
    if (!isLargeScreen) return
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return

      // Delete selected event (undoable via toast); Escape deselects.
      if (!popover && selectedEvId && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault()
        let target: CalEvent | undefined
        del: for (const evs of Object.values(googleEvMap)) {
          for (const ev of evs) { if (ev.id === selectedEvId) { target = ev; break del } }
        }
        if (target) { handleDeleteCalEvent(target); setSelectedEvId(null) }
        return
      }
      if (e.key === 'Escape' && selectedEvId) { setSelectedEvId(null); return }

      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === 'c' && selectedEvId) {
        e.preventDefault()
        let found: CalEvent | undefined
        outer: for (const evs of Object.values(googleEvMap)) {
          for (const ev of evs) { if (ev.id === selectedEvId) { found = ev; break outer } }
        }
        if (found) { setCopiedEvent(found); showToast('Event copied — hover a day then ⌘V', { type: 'add' }) }

      } else if (e.key === 'v' && copiedEvent) {
        e.preventDefault()
        const target = pasteDate ?? todayStr
        const { start, end, endDate } = shiftedTimes(copiedEvent, copiedEvent.instanceDate ?? target, target)
        const body: GCalEvent = { summary: copiedEvent.title, location: copiedEvent.location, description: copiedEvent.notes, start, end }
        // Paste into a calendar we can write to, even if the source was read-only
        const calId = writableCals.some(c => c.id === copiedEvent.calendarId) ? copiedEvent.calendarId! : pickCreateCalId()
        // Optimistic, like the popover: show it now, sync in the background
        const tmpId = `tmp-${Date.now()}`
        setGoogleEvMap(prev => ({ ...prev, [target]: [...(prev[target] ?? []), { ...copiedEvent, id: tmpId, instanceDate: target, endDate, calendarId: calId, recurringEventId: undefined }] }))
        showToast('Event pasted', { type: 'add' })
        // createCalEvent toasts the reason on failure; the refetch drops the stand-in
        void createCalEvent(body, calId).then(() => setGRefreshKey(k => k + 1))
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLargeScreen, selectedEvId, copiedEvent, pasteDate, googleEvMap, todayStr, popover])

  // Single delete implementation behind every entry point (day card, context
  // menu, keyboard, edit sheet, popover). Optimistically clears local state,
  // toasts with undo, and only hits Google on commit.
  function runCalDelete(opts: { eventId: string; masterId?: string; calId: string; fromDate: string; scope: RecurScope }) {
    const { eventId, masterId, calId, fromDate, scope } = opts
    const cutSeries = !!masterId && scope === 'following'
    setGoogleEvMap(prev => {
      const m = { ...prev }
      for (const key of Object.keys(m)) {
        // 'following' clears this occurrence and every later one in the series
        m[key] = m[key].filter(e => cutSeries
          ? !(e.recurringEventId === masterId && key >= fromDate)
          : e.id !== eventId)
        if (!m[key].length) delete m[key]
      }
      return m
    })
    showToast(cutSeries ? 'This and following deleted' : 'Event deleted', {
      type: 'delete',
      undo: {
        onUndo:   () => setGRefreshKey(k => k + 1),
        onCommit: () => { void commitCalDelete(eventId, masterId, fromDate, calId, cutSeries) },
      },
    })
  }

  // Entry point for the day card / context menu / keyboard. Recurring events
  // route through the scope prompt first so every surface asks, not just the
  // edit sheet and popover.
  function handleDeleteCalEvent(ev: CalEvent, date?: string) {
    if (!ev.id) return
    const fromDate = date ?? ev.instanceDate ?? todayStr
    if (ev.recurringEventId) { setDeleteScopeAsk({ ev, date: fromDate }); return }
    runCalDelete({ eventId: ev.id, calId: ev.calendarId ?? 'primary', fromDate, scope: 'this' })
  }

  // Delete from the phone edit sheet, honouring the chosen recurrence scope.
  function handleSheetDelete(ev: EditableEvent, scope: RecurrenceScope) {
    if (!ev.id) return
    runCalDelete({
      eventId:  ev.id,
      masterId: ev.recurringEventId,
      calId:    ev.calendarId ?? 'primary',
      fromDate: ev.instanceDate ?? ev.date,
      scope,
    })
  }

  async function handleEventDrop(ev: CalEvent, newDate: string, originDate: string) {
    if (!ev.id || ev.id.startsWith('tmp-') || newDate === originDate) return
    const { start, end, endDate } = shiftedTimes(ev, originDate, newDate)
    // Optimistic: move event to the new date in local state
    setGoogleEvMap(prev => {
      const m = { ...prev }
      if (m[originDate]) {
        m[originDate] = m[originDate].filter(e => e.id !== ev.id)
        if (!m[originDate].length) delete m[originDate]
      }
      const updated: CalEvent = { ...ev, instanceDate: newDate, endDate }
      m[newDate] = [...(m[newDate] ?? []), updated].sort(byStart)
      return m
    })
    showToast('Event moved', { type: 'payment' })
    // PATCH only the times. A PUT with just summary/start/end replaced the whole
    // event and wiped its location, notes and reminders.
    const ok = await updateCalEvent(ev.id, { start, end }, ev.calendarId ?? 'primary', { patch: true })
    // updateCalEvent toasted the reason — put the event back where Google has it
    if (!ok) setGRefreshKey(k => k + 1)
  }

  // ── Right-click context menu (large-screen grid) ──────────────────────────
  useEffect(() => {
    if (!evCtxMenu) return
    const onDown = (e: MouseEvent) => { if (!evCtxRef.current?.contains(e.target as Node)) setEvCtxMenu(null) }
    const onKey  = (e: KeyboardEvent) => { if (e.key === 'Escape') setEvCtxMenu(null) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [evCtxMenu])

  function openEvCtx(e: React.MouseEvent, ev: CalEvent, date: string) {
    if (ev.type !== 'google' || !ev.id) return
    e.preventDefault(); e.stopPropagation()
    setSelectedEvId(ev.id)
    setEvCtxMenu({ x: e.clientX, y: e.clientY, ev, date })
  }

  function duplicateFromEvent(ev: CalEvent, date: string, anchor: DOMRect | null) {
    const parts  = ev.amount?.split(' – ').map(t => t.trim()) ?? []
    const allDay = !ev.amount?.trim()
    setPopover({ anchorRect: anchor, mode: 'create', data: {
      title: `${ev.title} (copy)`, date, endDate: ev.endDate ?? date, allDay,
      startTime: !allDay && parts[0] ? parts[0] : '09:00',
      endTime:   !allDay && parts[1] ? parts[1] : '10:00',
      location: ev.location ?? '', notes: ev.notes ?? '', recurrenceRule: '',
      // Don't inherit the source calendar blindly — duplicating an event that
      // lives on a read-only calendar (a shared one, or an @import ICS feed)
      // would target a calendar we can never write to.
      calendarId: writableCals.some(c => c.id === ev.calendarId) ? ev.calendarId! : pickCreateCalId(),
    } })
  }

  // Calendars we can actually write to. The list is fetched with
  // minAccessRole=reader so subscribed calendars (holidays, shared-with-you)
  // still display their events — but creating into one fails with
  // "You need to have writer access to this calendar."
  const writableCals = useMemo(
    () => googleCals.filter(canWriteToCalendar),
    [googleCals],
  )

  // Pick a create target that's actually writable, preferring the user's
  // default, then primary, then any writable calendar.
  function pickCreateCalId(): string {
    const writable = new Set(writableCals.map(c => c.id))
    if (prefs.defaultCalendarId && writable.has(prefs.defaultCalendarId)) return prefs.defaultCalendarId
    const visibleWritable = writableCals.find(c => prefs.googleCalendarIds.includes(c.id))
    return visibleWritable?.id
      ?? writableCals.find(c => c.primary)?.id
      ?? writableCals[0]?.id
      ?? 'primary'
  }

  // Explain *why* a calendar can't be written to, before we bother Google.
  // Returns null when the target is fine (or when the list hasn't loaded yet,
  // in which case we let the API have the final say).
  function blockedCalendarMsg(calId: string): string | null {
    if (!googleCals.length) return null
    const cal = googleCals.find(c => c.id === calId)
    if (!cal || canWriteToCalendar(cal)) return null
    const why = calId.includes('@import.calendar.google.com')
      ? 'is a subscribed feed — Google keeps those permanently read-only'
      : 'is shared with you as read-only'
    return `Can't add to "${cal.summary}" — it ${why}.`
  }

  // ── Drag-to-create (multi-day) ────────────────────────────────────────────
  function openCreatePopoverRange(start: string, end: string) {
    const calId = pickCreateCalId()
    setPopover({ anchorRect: null, mode: 'create', data: { title: '', date: start, endDate: end, allDay: true, startTime: '09:00', endTime: '10:00', location: '', notes: '', recurrenceRule: '', calendarId: calId } })
  }

  function startCreateDrag(ds: string) {
    const init = { anchor: ds, start: ds, end: ds }
    createDragRef.current = init
    setCreateDrag(init)
    const onUp = () => {
      document.removeEventListener('mouseup', onUp)
      const cd = createDragRef.current
      createDragRef.current = null
      setCreateDrag(null)
      if (cd && cd.start !== cd.end) openCreatePopoverRange(cd.start, cd.end)
    }
    document.addEventListener('mouseup', onUp)
  }

  function handleOpenEdit(ev: CalEvent) {
    if (!ev.id || ev.id.startsWith('tmp-')) return  // optimistic copy, still syncing
    const parts = ev.amount?.split(' – ').map(t => t.trim()) ?? []
    const allDay = !ev.amount?.trim()
    setEditEvent({
      id: ev.id, title: ev.title, allDay,
      date:    ev.instanceDate ?? '',
      endDate: ev.endDate ?? ev.instanceDate ?? '',
      startTime: !allDay && parts[0] ? parts[0] : '09:00',
      endTime:   !allDay && parts[1] ? parts[1] : '10:00',
      location: ev.location ?? '', notes: ev.notes ?? '',
      recurrenceRule: '',
      calendarId: ev.calendarId ?? 'primary',
      googleEventId: ev.id,
      instanceDate: ev.instanceDate,
      recurringEventId: ev.recurringEventId,
    })
    // Expanded instances don't carry the RRULE — only the master does. Fetch it
    // so the Repeat row shows the real rule instead of "Never".
    if (ev.recurringEventId) {
      const gen = ++editRuleGen.current
      getCalEvent(ev.recurringEventId, ev.calendarId ?? 'primary').then(master => {
        if (gen !== editRuleGen.current) return
        const rule = extractRRule(master)
        if (rule) setEditEvent(e => e && e.id === ev.id ? { ...e, recurrenceRule: rule } : e)
      })
    }
  }

  function openCreatePopover(anchorRect: DOMRect | null, date: string) {
    const calId = pickCreateCalId()
    const { startTime, endTime } = defaultTimes()
    setPopover({ anchorRect, mode: 'create', data: { title: '', date, endDate: date, allDay: false, startTime, endTime, location: '', notes: '', recurrenceRule: '', calendarId: calId } })
  }

  function openCreateSheet(date: string) {
    const calId = pickCreateCalId()
    const { startTime, endTime } = defaultTimes()
    setCreateEvent({ title: '', date, endDate: date, allDay: false, startTime, endTime, location: '', notes: '', recurrenceRule: '', calendarId: calId })
  }

  // Saves are optimistic: the sheet closes and the event lands on the grid at
  // once, and Google syncs in the background. The refetch (gRefreshKey) then
  // swaps the local copy for the real event. A failed write reopens the sheet
  // with the user's edits so nothing is lost.
  async function handleCreateEvent(edits: EventEdits, _scope: RecurrenceScope): Promise<boolean> {
    const blocked = blockedCalendarMsg(edits.calendarId ?? 'primary')
    if (blocked) { showToast(blocked, { type: 'delete' }); return false }
    const body = gcalBody(edits)
    if (edits.recurrenceRule) body.recurrence = [`RRULE:${edits.recurrenceRule}`]
    putLocalEvent(localGoogleEvent(`tmp-${Date.now()}`, edits))
    setCreateEvent(null)
    showToast('Event created', { type: 'add' })
    void createCalEvent(body, edits.calendarId).then(id => {
      setGRefreshKey(k => k + 1)
      // createCalEvent already toasted the reason
      if (!id) setCreateEvent(c => c ?? { ...edits })
    })
    return true
  }

  function openEditPopover(anchorRect: DOMRect | null, ev: CalEvent, date: string) {
    if (!ev.id || ev.id.startsWith('tmp-')) return  // optimistic copy, still syncing
    const parts = ev.amount?.split(' – ').map(t => t.trim()) ?? []
    const allDay = !ev.amount?.trim()
    setSelectedEvId(ev.id)
    setPopover({ anchorRect, mode: 'edit', data: { eventId: ev.id, title: ev.title, date, endDate: ev.endDate ?? date, allDay, startTime: !allDay && parts[0] ? parts[0] : '09:00', endTime: !allDay && parts[1] ? parts[1] : '10:00', location: ev.location ?? '', notes: ev.notes ?? '', recurrenceRule: '', calendarId: ev.calendarId ?? 'primary', recurringEventId: ev.recurringEventId } })
    // Expanded instances don't carry the RRULE — only the master does.
    if (ev.recurringEventId) {
      const gen = ++editRuleGen.current
      getCalEvent(ev.recurringEventId, ev.calendarId ?? 'primary').then(master => {
        if (gen !== editRuleGen.current) return
        const rule = extractRRule(master)
        if (rule) setPopover(p => p && p.data.eventId === ev.id ? { ...p, data: { ...p.data, recurrenceRule: rule } } : p)
      })
    }
  }

  // Split a recurring series at `instanceDate`: cap the old master so it stops
  // before that occurrence, then create a fresh series carrying the new fields
  // and rule from that date forward. If the occurrence IS the series start
  // there's nothing to split — patch the master in place, which is "all events".
  // Returns the toast message to show.
  async function applyFollowingEdit(
    masterId: string, instanceDate: string, body: GCalEvent, rule: string,
    fromCal: string, toCal: string,
  ): Promise<string> {
    const master = await getCalEvent(masterId, fromCal)
    if (!master) return 'Could not reach the event series'
    const masterStart  = master.start.date ?? master.start.dateTime?.slice(0, 10) ?? instanceDate
    const masterAllDay = !!master.start.date

    if (masterStart === instanceDate) {
      if (toCal !== fromCal) await moveCalEvent(masterId, fromCal, toCal)
      await updateCalEvent(masterId, { ...body, recurrence: rule ? [`RRULE:${rule}`] : [] }, toCal, { patch: true })
      return 'All events updated'
    }

    const oldRule = extractRRule(master)
    if (oldRule) {
      await updateCalEvent(
        masterId,
        { recurrence: [`RRULE:${rruleUntilBefore(oldRule, instanceDate, masterAllDay)}`] },
        fromCal,
        { patch: true },
      )
    }
    await createCalEvent({ ...body, recurrence: rule ? [`RRULE:${rule}`] : undefined }, toCal)
    return 'This and following events updated'
  }

  // Google all-day end dates are EXCLUSIVE — without the +1 a single-day event
  // has end === start, which Google rejects as an empty range. The body stays
  // recurrence-free: Google rejects a recurrence array on a single expanded
  // instance, so series-level writes attach the rule themselves.
  function gcalBody(f: EventEdits): GCalEvent {
    const gcalEndDate = addDays(f.endDate || f.date, 1)
    return f.allDay
      ? { summary: f.title, description: f.notes || undefined, location: f.location || undefined, start: { date: f.date }, end: { date: gcalEndDate } }
      : { summary: f.title, description: f.notes || undefined, location: f.location || undefined, start: { dateTime: `${f.date}T${f.startTime}:00`, timeZone: 'America/Los_Angeles' }, end: { dateTime: `${f.endDate || f.date}T${f.endTime}:00`, timeZone: 'America/Los_Angeles' } }
  }

  // Local stand-in for a just-saved Google event, shaped like the fetch builds them.
  function localGoogleEvent(id: string, f: EventEdits, recurringEventId?: string): CalEvent {
    const calId   = f.calendarId || 'primary'
    const endDay  = f.endDate || f.date
    return {
      id, title: f.title || '(no title)', type: 'google',
      amount: f.allDay ? '' : `${f.startTime} – ${f.endTime}`,
      location: f.location || undefined, notes: f.notes || undefined,
      color: prefs.googleCalendarColors?.[calId] ?? googleCals.find(c => c.id === calId)?.backgroundColor ?? '#4285F4',
      endDate: endDay !== f.date ? endDay : undefined,
      calendarId: calId, instanceDate: f.date, recurringEventId,
    }
  }

  // Insert `ev` on its date, first dropping any copy with id `replaceId`.
  function putLocalEvent(ev: CalEvent, replaceId?: string) {
    setGoogleEvMap(prev => {
      const m = { ...prev }
      if (replaceId) {
        for (const key of Object.keys(m)) {
          if (!m[key].some(e => e.id === replaceId)) continue
          m[key] = m[key].filter(e => e.id !== replaceId)
          if (!m[key].length) delete m[key]
        }
      }
      const date = ev.instanceDate!
      m[date] = [...(m[date] ?? []), ev].sort(byStart)
      return m
    })
  }

  async function handlePopoverSave(data: PopoverFormData) {
    const snap = popover
    if (!snap) return
    const blocked = blockedCalendarMsg(data.calendarId ?? 'primary')
    if (blocked) { showToast(blocked, { type: 'delete' }); return }

    const body        = gcalBody(data)
    const isCreate    = snap.mode === 'create'
    const isRecurring = !!data.recurringEventId
    const scope       = isRecurring ? (data.recurScope ?? 'this') : 'this'
    const fromCal     = snap.data.calendarId ?? 'primary'
    const toCal       = data.calendarId ?? 'primary'
    const calChanged  = toCal !== fromCal

    // Close and show the result now; Google catches up in the background.
    // 'following' rewrites a whole series, so it waits for the refetch instead.
    setPopover(null)
    setSelectedEvId(null)
    if (isCreate) {
      putLocalEvent(localGoogleEvent(`tmp-${Date.now()}`, data))
      showToast('Event created', { type: 'add' })
    } else if (data.eventId && scope === 'this') {
      putLocalEvent(localGoogleEvent(data.eventId, data, data.recurringEventId), data.eventId)
      showToast(calChanged && isRecurring ? 'Updated · calendar changed for the series' : 'Event updated', { type: 'payment' })
    }

    let ok = true
    try {
      if (isCreate) {
        // createCalEvent toasts the reason on failure
        ok = !!await createCalEvent(
          data.recurrenceRule ? { ...body, recurrence: [`RRULE:${data.recurrenceRule}`] } : body,
          data.calendarId,
        )
      } else if (data.eventId) {
        if (scope === 'following') {
          const msg = await applyFollowingEdit(data.recurringEventId!, snap.data.date, body, data.recurrenceRule, fromCal, toCal)
          showToast(msg, { type: 'payment' })
        } else if (calChanged && isRecurring) {
          // Google can't move a single recurring instance — a calendar change
          // applies to the whole series; the other field edits stay on this instance.
          ok = await moveCalEvent(data.recurringEventId!, fromCal, toCal) && await updateCalEvent(data.eventId, body, toCal)
        } else {
          ok = (!calChanged || await moveCalEvent(data.eventId, fromCal, toCal)) && await updateCalEvent(data.eventId, body, toCal)
        }
      }
    } catch { ok = false; showToast('Failed to save', { type: 'delete' }) }
    setGRefreshKey(k => k + 1)
    // Reopen with the user's edits — unless another popover has opened since
    if (!ok) setPopover(p => p ?? { ...snap, data })
  }

  function handlePopoverDelete(scope?: RecurScope) {
    if (!popover?.data.eventId) return
    const { eventId, recurringEventId, calendarId, date } = popover.data
    setPopover(null)
    setSelectedEvId(null)
    runCalDelete({
      eventId:  eventId!,
      masterId: recurringEventId,
      calId:    calendarId,
      fromDate: date,
      scope:    scope ?? 'this',
    })
  }

  // Deleting "this and following" isn't a delete of the master — that would take
  // out the earlier occurrences too. Cap the series with UNTIL instead, unless
  // the occurrence is the series start, in which case the whole series goes.
  async function commitCalDelete(
    eventId: string, masterId: string | undefined, fromDate: string,
    calId: string, cutSeries: boolean,
  ) {
    if (!cutSeries || !masterId) { await deleteCalEvent(eventId, calId); return }
    const master = await getCalEvent(masterId, calId)
    const masterStart = master?.start.date ?? master?.start.dateTime?.slice(0, 10)
    const oldRule = extractRRule(master)
    if (!master || !oldRule || masterStart === fromDate) { await deleteCalEvent(masterId, calId); return }
    await updateCalEvent(
      masterId,
      { recurrence: [`RRULE:${rruleUntilBefore(oldRule, fromDate, !!master.start.date)}`] },
      calId,
      { patch: true },
    )
  }

  async function handleEditEvent(edits: EventEdits, scope: RecurrenceScope): Promise<boolean> {
    const ev = editEvent
    if (!ev?.id) return false
    // The edit sheet lists every visible calendar (an event may live on a
    // read-only one), so a move to an unwritable target has to be caught here.
    const blockedEdit = blockedCalendarMsg(edits.calendarId ?? 'primary')
    if (blockedEdit) { showToast(blockedEdit, { type: 'delete' }); return false }
    const body    = gcalBody(edits)
    const fromCal = ev.calendarId ?? 'primary'
    const toCal   = edits.calendarId ?? 'primary'
    const evId    = ev.id
    const isFollowing = scope === 'following' && !!ev.recurringEventId

    // Optimistic, like handleCreateEvent: close now, sync in the background,
    // reopen with the edits if Google rejects the write.
    setEditEvent(null)
    if (!isFollowing) {
      putLocalEvent(localGoogleEvent(evId, edits, ev.recurringEventId), evId)
      showToast('Event updated', { type: 'payment' })
    }
    void (async () => {
      let ok = true
      if (isFollowing) {
        const msg = await applyFollowingEdit(
          ev.recurringEventId!, ev.instanceDate ?? ev.date,
          body, edits.recurrenceRule, fromCal, toCal,
        )
        showToast(msg, { type: 'payment' })
      } else {
        // 'this' — patch the single instance. `body` carries no recurrence:
        // Google rejects a recurrence array on an expanded instance.
        // A recurring instance can't be moved on its own; the move applies to the series.
        ok = (toCal === fromCal || await moveCalEvent(ev.recurringEventId ?? evId, fromCal, toCal))
          && await updateCalEvent(evId, body, toCal)
      }
      setGRefreshKey(k => k + 1)
      if (!ok) setEditEvent(e => e ?? { ...ev, ...edits })
    })()
    return true
  }

  // ── Scroll to today after first data load ────────────────────────────────
  useEffect(() => {
    if (!dataLoaded || scrolledToToday.current || (isLargeScreen && calView !== 'list')) return
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
    if (!scrolledToToday.current || googleRescrollDone.current || (isLargeScreen && calView !== 'list')) return
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
    if (isLargeScreen && calView !== 'list') return
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
  }, [isLargeScreen, calView])

  // ── Infinite scroll: prepend ───────────────────────────────────────────────
  useEffect(() => {
    if (isLargeScreen && calView !== 'list') return
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
  }, [isLargeScreen, calView])

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
      // Sample the middle of the visible grid: the top row is usually a week
      // half scrolled away, which made the title lag a month behind
      const scRect = sc.getBoundingClientRect()
      const el = document.elementFromPoint(scRect.left + scRect.width / 2, scRect.top + scRect.height / 2)
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

  // ── Narrow-grid detection — switches to dot-only view when cells < 80px wide ─
  useEffect(() => {
    if (!isLargeScreen || calView !== 'month') { setNarrowGrid(false); return }
    const el = monthGridRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      setNarrowGrid(entries[0].contentRect.width / 7 < 80)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isLargeScreen, calView])

  // Applies per-type and per-calendar color overrides (Notion grid only).
  // Google events: check live prefs.googleCalendarColors first so sidebar color changes
  // take effect instantly without re-fetching the event map.
  const notionColor = (ev: CalEvent) => {
    if (ev.type === 'google' && ev.calendarId)
      return prefs.googleCalendarColors?.[ev.calendarId] ?? ev.color ?? DOT_COLOR.google
    return ev.color ?? prefs.typeColors?.[ev.type] ?? DOT_COLOR[ev.type]
  }

  // Derives a light, hue-tinted text color from a hex background color.
  // Future/present: L=97%, S≤55% — essentially white with a faint hue wash.
  // Past:           L=70%, S≤38% — deliberately dim. The gap to future (27
  //                 points of luminance) is what makes elapsed events read as
  //                 past at a glance, so keep them far apart.
  function lightTextColor(hex: string, isPast = false): string {
    const h = hex.replace('#', '')
    if (h.length !== 6 && h.length !== 3) return isPast ? '#A8A8A8' : '#F7F7F7'
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
    const targetL = isPast ? 70 : 97
    const maxS    = isPast ? 0.38 : 0.55
    const minS    = isPast ? 0    : 0.20   // prevent near-gray text on desaturated backgrounds
    return `hsl(${Math.round(hDeg)}, ${Math.round(Math.max(Math.min(s, maxS), minS) * 100)}%, ${targetL}%)`
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
  const gridSelEvents = gridSel ? (visibleMap[gridSel] ?? []) : []
  const gridSelLabel  = gridSel ? new Date(gridSel + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : null

  // ── Day Detail helpers ────────────────────────────────────────────────────
  const dayDate      = selectedDay ? new Date(selectedDay + 'T12:00:00') : null
  const dayName      = dayDate?.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() ?? ''
  const dayNum       = dayDate?.getDate() ?? ''
  const dayMonthYr   = dayDate?.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase() ?? ''
  const dayEvents    = selectedDay ? (visibleMap[selectedDay] ?? []) : []

  // ── Jump the infinite-scroll list to an arbitrary month/year ──────────────
  // Rebuilds `months` centered on the target (so the day rows exist), then
  // scrolls to the first day of that month (or today, if it's the current month).
  function jumpToMonth(year: number, month: number) {
    const isCurrentMonth = year === today.getFullYear() && month === today.getMonth()
    setGridYear(year)
    setGridMonth(month)
    setGridSel(isCurrentMonth ? todayStr : null)
    setSideLbl(monthLabel(year, month))
    setMonths(Array.from({ length: 6 }, (_, i) => addMonths(year, month, i - 1)))
    // Block the prepend observer while we reposition; re-enable once settled.
    suppressPrepend.current = true
    const target = isCurrentMonth ? todayStr : toDateStr(year, month, 1)
    const tryScroll = (attempt = 0) => {
      const sc = scrollRef.current, el = dayRefs.current.get(target)
      if (sc && el && el.offsetTop > 0) {
        sc.scrollTop = el.offsetTop - 20
        requestAnimationFrame(() => { suppressPrepend.current = false })
      } else if (attempt < 12) {
        setTimeout(() => tryScroll(attempt + 1), 50)
      } else {
        suppressPrepend.current = false
      }
    }
    setTimeout(() => tryScroll(), 60)
  }

  // ── Month label tap: single tap → open picker, double tap → jump to today ──
  function handleMonthLabelTap() {
    const now = Date.now()
    if (now - monthLblTapRef.current < 300) {
      // Double tap — cancel the pending picker-open and jump to today instead
      monthLblTapRef.current = 0
      if (monthLblTimerRef.current) { clearTimeout(monthLblTimerRef.current); monthLblTimerRef.current = null }
      jumpToMonth(today.getFullYear(), today.getMonth())
    } else {
      monthLblTapRef.current = now
      if (monthLblTimerRef.current) clearTimeout(monthLblTimerRef.current)
      monthLblTimerRef.current = setTimeout(() => {
        monthLblTimerRef.current = null
        setMonthPickerOpen(true)
      }, 300)
    }
  }

  // Clear any pending single-tap timer on unmount
  useEffect(() => () => { if (monthLblTimerRef.current) clearTimeout(monthLblTimerRef.current) }, [])

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

  const v3MouseDown = useCallback((e: React.MouseEvent) => {
    v3Swipe.current = { x: e.clientX, y: e.clientY }
  }, [])
  const v3MouseUp = useCallback((e: React.MouseEvent) => {
    const s = v3Swipe.current; v3Swipe.current = null; if (!s) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (dx > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setViewIndex(0)
  }, [])

  // ── Desktop toolbar ────────────────────────────────────────────────────────
  // Month: scroll the grid a month at a time (sidebarYear/Month track the
  // month in view). Agenda: rebuild the list around the target month.
  function scrollGridToDate(ds: string, offset = 8) {
    const el = monthCellRefs.current.get(ds), sc = monthGridRef.current
    if (!el || !sc) return
    sc.scrollTo({ top: sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - offset, behavior: 'smooth' })
  }
  function deskNav(delta: -1 | 0 | 1) {
    if (calView === 'list') {
      if (delta === 0) { jumpToMonth(today.getFullYear(), today.getMonth()); return }
      const t = addMonths(gridYear, gridMonth, delta)
      jumpToMonth(t.year, t.month)
      return
    }
    if (delta === 0) { scrollGridToDate(todayStr, 120); return }
    const t = addMonths(sidebarYear, sidebarMonth, delta)
    scrollGridToDate(toDateStr(t.year, t.month, 1))
  }
  const deskTitle = (() => {
    const lbl = calView === 'month' ? notionGridLbl : gridMonthLbl
    const k = lbl.lastIndexOf(' ')
    return { month: lbl.slice(0, k), year: lbl.slice(k + 1) }
  })()

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
    {/* Root — fixed viewport clip */}
    <div className="tab-enter" style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>

      {/* Connect-Google-Calendar prompt — shown when /api/calendar returns 403
          (token missing or expired). Lets the user re-grant right here without
          leaving for Settings or signing out. */}
      {needsCalConnect && !calConnectDismissed && (
        <div
          style={{ position: 'fixed', top: 'calc(env(safe-area-inset-top, 44px) + 8px)', left: 12, right: 12, zIndex: 50 }}
        >
          <div className="flex items-center gap-3 bg-bg-surface border border-emerald/30 rounded-[14px] px-4 py-3 shadow-lg">
            <CalendarPlus size={18} className="text-emerald flex-shrink-0" strokeWidth={1.75} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-ink leading-tight">Connect Google Calendar</p>
              <p className="text-[11px] text-ink-muted leading-tight mt-0.5">Grant access to sync your events here.</p>
            </div>
            <button
              onClick={() => connectGoogleCalendar(userEmail)}
              className="flex-shrink-0 gradient-gold text-white text-[12px] font-semibold px-3 py-1.5 rounded-[10px] select-none"
            >
              Connect
            </button>
            <button
              onClick={() => setCalConnectDismissed(true)}
              aria-label="Dismiss"
              className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-[18px] text-ink-faint select-none"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Sliding rail (2 panels × 100vw) ──────────────────────────────── */}
      <div style={{ display: 'flex', width: '200vw', height: '100%', transform: `translateX(-${viewIndex * 100}vw)`, transition: 'transform 0.32s cubic-bezier(0.4,0,0.2,1)', willChange: 'transform' }}>

        {/* ═══════════════════════════════════════════════════════════════
            PANEL 0 — Split view (mobile) / Notion grid (iPad+)
        ═══════════════════════════════════════════════════════════════ */}
        {isLargeScreen ? (
          /* ── iPad / Large screen: existing Notion grid layout ── */
          <div
            style={{ width: '100vw', height: '100%', flex: 'none', display: 'flex', flexDirection: 'column', background: 'var(--color-cal-bg)', userSelect: 'none', cursor: 'default' }}>


            {/* ── Desktop shell: sidebar + toolbar, shared by Month and Agenda ── */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

                {/* Sidebar — extends full height to top of screen */}
                <div style={{ width: 247, background: 'var(--color-cal-sidebar)', display: 'flex', flexDirection: 'column', borderRight: '0.5px solid var(--color-cal-grid-line)', flexShrink: 0, overflowY: 'auto' }}>
                  {/* Top spacer — lines the mini month up with the toolbar title */}
                  <div style={{ height: 'calc(env(safe-area-inset-top, 0px) + 20px)', flexShrink: 0 }} />
                  {/* Mini month navigator */}
                  <div style={{ padding: '0 12px 10px', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, padding: '0 4px' }}>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)' }}>
                        {new Date(sidebarYear, sidebarMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                      </span>
                      <button type="button" className="cal-tb-icon cal-tb-icon-sm" aria-label="Previous month" onClick={() => {
                        const nm = sidebarMonth === 0 ? 11 : sidebarMonth - 1
                        const ny = sidebarMonth === 0 ? sidebarYear - 1 : sidebarYear
                        setSidebarMonth(nm); setSidebarYear(ny)
                      }}><ChevronLeft size={15} strokeWidth={2} /></button>
                      <button type="button" className="cal-tb-icon cal-tb-icon-sm" aria-label="Next month" onClick={() => {
                        const nm = sidebarMonth === 11 ? 0 : sidebarMonth + 1
                        const ny = sidebarMonth === 11 ? sidebarYear + 1 : sidebarYear
                        setSidebarMonth(nm); setSidebarYear(ny)
                      }}><ChevronRight size={15} strokeWidth={2} /></button>
                    </div>
                    {/* DOW mini header */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', marginBottom: 2 }}>
                      {(wsMon ? ['M','T','W','T','F','S','S'] : ['S','M','T','W','T','F','S']).map((d, i) => (
                        <div key={i} style={{ textAlign: 'center', fontSize: 10, fontWeight: 500, color: 'rgb(var(--rgb-ink-muted))', fontFamily: 'var(--font-montserrat)', paddingBottom: 2 }}>{d}</div>
                      ))}
                    </div>
                    {/* Mini day grid */}
                    {(() => {
                      const dim      = getDaysInMonth(sidebarYear, sidebarMonth)
                      const firstDow = wsMon ? (new Date(sidebarYear, sidebarMonth, 1).getDay() + 6) % 7 : new Date(sidebarYear, sidebarMonth, 1).getDay()
                      // Prev-month overflow
                      const prevYear  = sidebarMonth === 0 ? sidebarYear - 1 : sidebarYear
                      const prevMonth = sidebarMonth === 0 ? 11 : sidebarMonth - 1
                      const prevDim   = getDaysInMonth(prevYear, prevMonth)
                      // Next-month overflow
                      const nextYear  = sidebarMonth === 11 ? sidebarYear + 1 : sidebarYear
                      const nextMonth = sidebarMonth === 11 ? 0 : sidebarMonth + 1
                      // Build full grid: prev overflow + current + next overflow
                      type Cell = { day: number; year: number; month: number; overflow: boolean }
                      const cells: Cell[] = []
                      for (let i = firstDow - 1; i >= 0; i--)
                        cells.push({ day: prevDim - i, year: prevYear, month: prevMonth, overflow: true })
                      for (let d = 1; d <= dim; d++)
                        cells.push({ day: d, year: sidebarYear, month: sidebarMonth, overflow: false })
                      let nd = 1
                      while (cells.length < 42)
                        cells.push({ day: nd++, year: nextYear, month: nextMonth, overflow: true })
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', gridAutoRows: '28px', gap: '1px 0' }}>
                          {cells.map((cell, i) => {
                            const ds      = toDateStr(cell.year, cell.month, cell.day)
                            const isToday = ds === todayStr
                            const hasEvs  = !cell.overflow && (monthVisibleMap[ds] ?? []).length > 0
                            const hov     = hoveredSidebarDay === ds
                            const hlBg    = isToday ? '#C9A84C' : hov ? (cell.overflow ? 'rgb(var(--rgb-ink) / 0.04)' : 'rgb(var(--rgb-ink) / 0.07)') : 'transparent'
                            return (
                              <button
                                key={i}
                                onMouseEnter={() => setHoveredSidebarDay(ds)}
                                onMouseLeave={() => setHoveredSidebarDay(p => p === ds ? null : p)}
                                onClick={() => {
                                  if (cell.overflow) { setSidebarYear(cell.year); setSidebarMonth(cell.month) }
                                  if (calView === 'list') {
                                    const ael = dayRefs.current.get(ds), asc = scrollRef.current
                                    if (ael && asc) asc.scrollTo({ top: ael.offsetTop - 8, behavior: 'smooth' })
                                    else jumpToMonth(cell.year, cell.month)
                                    return
                                  }
                                  const el = monthCellRefs.current.get(ds)
                                  const sc = monthGridRef.current
                                  if (el && sc) {
                                    const cRect = sc.getBoundingClientRect()
                                    const eRect = el.getBoundingClientRect()
                                    sc.scrollTop = sc.scrollTop + eRect.top - cRect.top - 120
                                  }
                                }}
                                style={{ height: 28, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                              >
                                {/* Fixed 28×28 inner frame — highlight lives here, never affects grid row height */}
                                <div style={{ position: 'relative', width: '100%', height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                  <div style={{ position: 'absolute', width: 24, height: 24, left: '50%', top: '50%', transform: 'translate(-50%,-50%)', borderRadius: '50%', background: hlBg, transition: 'background 0.1s' }} />
                                  <span style={{ position: 'relative', zIndex: 1, fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? '#1a1200' : 'rgb(var(--rgb-ink) / 0.75)', fontFamily: 'var(--font-montserrat)', opacity: cell.overflow ? 0.35 : 1 }}>{cell.day}</span>
                                  {hasEvs && !isToday && <span style={{ position: 'absolute', bottom: 2, left: '50%', transform: 'translateX(-50%)', width: 3, height: 3, borderRadius: '50%', background: '#C9A84C', opacity: 0.5, zIndex: 1 }} />}
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: 'var(--color-cal-grid-line)', flexShrink: 0 }} />

                  {/* Calendar legend toggles */}
                  <div style={{ padding: '14px 8px 8px', flexShrink: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-ink)', marginBottom: 8, fontFamily: 'var(--font-montserrat)', paddingLeft: 6 }}>Calendars</p>
                    <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.02em', color: 'rgb(var(--rgb-ink-muted))', marginBottom: 4, fontFamily: 'var(--font-montserrat)', paddingLeft: 4 }}>Finance</p>
                    {([
                      { type: 'income' as EventType, label: 'Income',        defaultColor: DOT_COLOR.income },
                      { type: 'sub'    as EventType, label: 'Subscriptions', defaultColor: DOT_COLOR.sub    },
                    ]).map(item => {
                      const hidden      = hiddenTypes.has(item.type)
                      const activeColor = prefs.typeColors?.[item.type] ?? item.defaultColor
                      const isCustom    = !!prefs.typeColors?.[item.type]
                      const hovered     = hoveredSidebarRow === item.type
                      return (
                        <div
                          key={item.type}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 6px', borderRadius: 7, background: hovered ? 'rgb(var(--rgb-ink) / 0.05)' : 'transparent', transition: 'background 0.12s' }}
                          onMouseEnter={() => setHoveredSidebarRow(item.type)}
                          onMouseLeave={() => setHoveredSidebarRow(null)}
                          onContextMenu={e => { e.preventDefault(); setSidebarCtxMenu({ id: item.type, kind: 'type', x: e.clientX, y: e.clientY }) }}
                          onTouchStart={e => { const t = e.touches[0]; longPressTimer.current = setTimeout(() => setSidebarCtxMenu({ id: item.type, kind: 'type', x: t.clientX, y: t.clientY }), 500) }}
                          onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                          onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                        >
                          <div style={{ position: 'relative', width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <span style={{ width: 12, height: 12, borderRadius: 4, background: hidden ? 'transparent' : activeColor, border: `1.5px solid ${activeColor}`, display: 'block', transition: 'all 0.15s', opacity: hidden ? 0.4 : 1, flexShrink: 0, pointerEvents: 'none' }} />
                            <input
                              type="color"
                              ref={el => { if (el) colorInputRefs.current.set(item.type, el) }}
                              value={activeColor.match(/^#[0-9a-fA-F]{6}$/) ? activeColor.toLowerCase() : item.defaultColor}
                              onChange={e => savePrefs({ ...prefs, typeColors: { ...(prefs.typeColors ?? {}), [item.type]: e.target.value } })}
                              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', padding: 0, border: 'none' }}
                            />
                          </div>
                          <button onClick={() => setHiddenTypes(prev => { const next = new Set(prev); if (next.has(item.type)) next.delete(item.type); else next.add(item.type); return next })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', padding: 0 }}>
                            <span style={{ fontSize: 13, color: hidden ? 'rgb(var(--rgb-ink) / 0.3)' : 'rgb(var(--rgb-ink) / 0.88)', fontFamily: 'var(--font-montserrat)', fontWeight: 500, transition: 'color 0.15s' }}>{item.label}</span>
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
                            <button onClick={() => { const tc = { ...(prefs.typeColors ?? {}) }; delete tc[item.type]; savePrefs({ ...prefs, typeColors: tc }) }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', opacity: 0.35, flexShrink: 0, lineHeight: 1, fontSize: 9, color: 'var(--color-ink)' }} title="Reset color">
                              ✕
                            </button>
                          ) : null}
                        </div>
                      )
                    })}
                    {/* Per-Google-calendar rows */}
                    {googleCals.filter(c => prefs.googleCalendarIds.includes(c.id)).length > 0 && (
                      <div style={{ marginTop: 8, marginBottom: 4 }}>
                        <div style={{ height: '0.5px', background: 'rgb(var(--rgb-ink) / 0.08)', marginBottom: 6 }} />
                        <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.02em', color: 'rgb(var(--rgb-ink-muted))', margin: 0, fontFamily: 'var(--font-montserrat)', paddingLeft: 4 }}>Google</p>
                      </div>
                    )}
                    {googleCals.filter(c => prefs.googleCalendarIds.includes(c.id)).map(cal => {
                      const hidden      = hiddenGoogleCals.has(cal.id)
                      const activeColor = prefs.googleCalendarColors?.[cal.id] ?? cal.backgroundColor
                      const hovered     = hoveredSidebarRow === cal.id
                      return (
                        <div
                          key={cal.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '5px 6px', borderRadius: 7, background: hovered ? 'rgb(var(--rgb-ink) / 0.05)' : 'transparent', transition: 'background 0.12s' }}
                          onMouseEnter={() => setHoveredSidebarRow(cal.id)}
                          onMouseLeave={() => setHoveredSidebarRow(null)}
                          onContextMenu={e => { e.preventDefault(); setSidebarCtxMenu({ id: cal.id, kind: 'google', x: e.clientX, y: e.clientY }) }}
                          onTouchStart={e => { const t = e.touches[0]; longPressTimer.current = setTimeout(() => setSidebarCtxMenu({ id: cal.id, kind: 'google', x: t.clientX, y: t.clientY }), 500) }}
                          onTouchEnd={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                          onTouchMove={() => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }}
                        >
                          <div style={{ position: 'relative', width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <span style={{ width: 12, height: 12, borderRadius: 4, background: hidden ? 'transparent' : activeColor, border: `1.5px solid ${activeColor}`, display: 'block', transition: 'all 0.15s', opacity: hidden ? 0.4 : 1, flexShrink: 0, pointerEvents: 'none' }} />
                            <input
                              type="color"
                              ref={el => { if (el) colorInputRefs.current.set(cal.id, el); else colorInputRefs.current.delete(cal.id) }}
                              value={activeColor.match(/^#[0-9a-fA-F]{6}$/) ? activeColor.toLowerCase() : '#4285f4'}
                              onChange={e => { const newColors = { ...(prefs.googleCalendarColors ?? {}), [cal.id]: e.target.value }; savePrefs({ ...prefs, googleCalendarColors: newColors }) }}
                              title="Change color"
                              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%', padding: 0, border: 'none' }}
                            />
                          </div>
                          <button onClick={() => setHiddenGoogleCals(prev => { const next = new Set(prev); if (next.has(cal.id)) next.delete(cal.id); else next.add(cal.id); return next })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', flex: 1, textAlign: 'left', padding: 0 }}>
                            <span style={{ fontSize: 13, color: hidden ? 'rgb(var(--rgb-ink) / 0.3)' : 'rgb(var(--rgb-ink) / 0.88)', fontFamily: 'var(--font-montserrat)', fontWeight: 500, transition: 'color 0.15s' }}>{cal.summary}</span>
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
                  <div style={{ padding: '8px 14px 16px', flexShrink: 0 }}>
                    <button onClick={() => setSettingsOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', background: 'transparent', border: '1px solid rgb(var(--rgb-ink) / 0.08)', borderRadius: 8, cursor: 'pointer', padding: '7px 8px' }}>
                      <Plus size={11} color="rgb(var(--rgb-ink) / 0.35)" />
                      <span style={{ fontSize: 11, color: 'rgb(var(--rgb-ink) / 0.35)', fontFamily: 'var(--font-montserrat)', fontWeight: 500 }}>Add Calendar</span>
                    </button>
                  </div>
                </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, background: 'var(--color-cal-bg)' }}>
                {/* ── Toolbar (shared by Month + Agenda) ── paddingRight clears the fixed ProfileDrawer avatar */}
                <div style={{ height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14, padding: '0 64px 0 24px', borderBottom: '0.5px solid var(--color-cal-grid-line)', background: 'var(--color-cal-bg)' }}>
                  <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', whiteSpace: 'nowrap', minWidth: 200, margin: 0 }}>
                    {deskTitle.month} <span style={{ fontWeight: 400, color: 'rgb(var(--rgb-ink-muted))' }}>{deskTitle.year}</span>
                  </h1>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <button type="button" className="cal-tb-icon" onClick={() => deskNav(-1)} aria-label="Previous month" title="Previous month"><ChevronLeft size={18} strokeWidth={2} /></button>
                    <button type="button" className="cal-tb-btn" onClick={() => deskNav(0)}>Today</button>
                    <button type="button" className="cal-tb-icon" onClick={() => deskNav(1)} aria-label="Next month" title="Next month"><ChevronRight size={18} strokeWidth={2} /></button>
                  </div>
                  <div style={{ flex: 1 }} />
                  <div style={{ width: 176 }}>
                    <Segmented options={DESK_VIEWS} labels={{ month: 'Month', list: 'Agenda' }} value={calView} onChange={switchCalView} />
                  </div>
                  <button type="button" className="cal-tb-icon" onClick={() => setSettingsOpen(true)} aria-label="Calendars and filters" title="Calendars and filters"><SlidersHorizontal size={16} strokeWidth={2} /></button>
                  <button type="button" className="cal-tb-primary" onClick={() => openCreatePopover(null, todayStr)}><Plus size={15} strokeWidth={2.5} />New</button>
                </div>

                {calView === 'month' ? (<>
                {/* Weekday header — muted, right-aligned over the date numbers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', borderBottom: '0.5px solid var(--color-cal-grid-line)', flexShrink: 0, background: 'var(--color-cal-bg)' }}>
                  {(wsMon ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']).map(d => (
                    <div key={d} style={{ textAlign: 'right', padding: '8px 10px 6px', fontSize: 12, fontWeight: 500, color: 'rgb(var(--rgb-ink-muted))', fontFamily: 'var(--font-montserrat)' }}>{d}</div>
                  ))}
                </div>
                  {/* Scrollable weeks */}
                  <div ref={monthGridRef} data-touch-scroll style={{ flex: 1, overflowY: 'auto', background: 'var(--color-cal-bg)', position: 'relative' }}>
                    <div ref={monthGridTopSentRef} style={{ height: 1 }} />
                    {notionWeeks.map(weekStart => {
                      const days      = weekDays(weekStart)
                      const weekSpans = multiDayEvents.filter(s => s.startDate <= days[6] && s.endDate >= days[0])
                      const spanLanes = allocateSpanLanes(weekSpans, days)
                      const SPAN_H = 18, SPAN_GAP = EV_ROW_H - SPAN_H
                      const weekExpanded = expandedWeeks.has(weekStart)
                      const toggleWeek = (e: React.MouseEvent) => {
                        e.stopPropagation()
                        setExpandedWeeks(prev => {
                          const next = new Set(prev)
                          if (next.has(weekStart)) next.delete(weekStart); else next.add(weekStart)
                          return next
                        })
                      }
                      return (
                        <div key={weekStart} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0,1fr))', borderBottom: '0.5px solid var(--color-cal-grid-line)' }}>
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
                            const singles      = [...allDayEvs.map(ev => ({ ev, timed: false })), ...timedEvs.map(ev => ({ ev, timed: true }))]
                            const cellLayout   = layoutCell(spanLanes, ci, singles, weekExpanded ? Infinity : MAX_VIS_EVENTS)
                            const overflow     = cellLayout.overflow
                            // Cells that would overflow when collapsed get the "Show less" toggle
                            const wouldOverflow = weekExpanded && layoutCell(spanLanes, ci, singles, MAX_VIS_EVENTS).overflow > 0
                            return (
                              <div
                                key={ds}
                                data-caldate={ds}
                                ref={el => { if (el) monthCellRefs.current.set(ds, el); else monthCellRefs.current.delete(ds) }}
                                // Single click only clears a selection; double-click creates on that day
                                onClick={() => setSelectedEvId(null)}
                                onDoubleClick={e => {
                                  if ((e.target as HTMLElement).closest('[data-cal-event]')) return
                                  openCreatePopover(e.currentTarget.getBoundingClientRect(), ds)
                                }}
                                onDragOver={e => {
                                  if (!dragState) return
                                  e.preventDefault()
                                  if (dragOverRef.current !== ds) { dragOverRef.current = ds; setDragOverDate(ds) }
                                }}
                                onDrop={e => {
                                  e.preventDefault()
                                  if (!dragState) return
                                  const { ev, originDate } = dragState
                                  setDragState(null); setDragOverDate(null); dragOverRef.current = null
                                  handleEventDrop(ev, ds, originDate)
                                }}
                                onMouseDown={e => {
                                  if (e.button !== 0 || dragState) return
                                  if ((e.target as HTMLElement).closest('[data-cal-event]')) return
                                  startCreateDrag(ds)
                                }}
                                onMouseEnter={() => {
                                  setPasteDate(ds)
                                  if (createDragRef.current) {
                                    const cd = createDragRef.current
                                    const next = cd.anchor <= ds ? { ...cd, start: cd.anchor, end: ds } : { ...cd, start: ds, end: cd.anchor }
                                    createDragRef.current = next; setCreateDrag(next)
                                  }
                                }}
                                onMouseLeave={() => setPasteDate(p => p === ds ? null : p)}
                                className="group"
                                style={{ minHeight: CELL_MIN_H, borderRight: ci < 6 ? '0.5px solid var(--color-cal-grid-line)' : 'none', padding: '5px 0 4px', cursor: 'pointer', display: 'flex', flexDirection: 'column', background: isToday ? 'rgba(212,175,55,0.045)' : 'var(--color-cal-cell)', position: 'relative', userSelect: createDrag ? 'none' : undefined }}
                              >
                                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none" style={{ background: 'rgb(var(--rgb-ink) / 0.03)' }} />
                                {dragOverDate === ds && dragState && (
                                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(212,175,55,0.07)', border: '1.5px solid rgba(212,175,55,0.3)', pointerEvents: 'none', zIndex: 5 }} />
                                )}
                                {createDrag && ds >= createDrag.start && ds <= createDrag.end && (
                                  <div style={{ position: 'absolute', inset: 0, background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.35)', pointerEvents: 'none', zIndex: 5 }} />
                                )}
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                                  {/* Date number row */}
                                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: 3, flexShrink: 0, paddingLeft: 6, paddingRight: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto', flexShrink: 0 }}>
                                      {isMonthStart && (
                                        <span style={{ fontSize: 12, fontWeight: 600, color: isPast ? 'rgb(var(--rgb-ink) / 0.3)' : 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', lineHeight: 1 }}>
                                          {new Date(cy, cm - 1, 1).toLocaleDateString('en-US', { month: 'short' })}
                                        </span>
                                      )}
                                      <span style={{
                                        fontSize: 12,
                                        fontWeight: isToday ? 600 : 400,
                                        color: isToday ? '#1a1200' : isPast ? 'rgb(var(--rgb-ink) / 0.3)' : 'var(--color-ink)',
                                        fontFamily: 'var(--font-montserrat)', lineHeight: 1,
                                        ...(isToday ? { background: '#D4AF37', borderRadius: 999, minWidth: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' } : {}),
                                      }}>
                                        {cd}
                                      </span>
                                    </div>
                                  </div>
                                  {narrowGrid ? (
                                    /* Narrow mode: dot-only summary, one dot per event */
                                    allEvs.length > 0 && (
                                      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', padding: '2px 4px' }}>
                                        {allEvs.slice(0, 5).map((ev, i) => (
                                          <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: notionColor(ev), flexShrink: 0, opacity: isPast ? 0.45 : 1 }} />
                                        ))}
                                        {allEvs.length > 5 && <span style={{ fontSize: 7, lineHeight: '5px', color: 'rgb(var(--rgb-ink) / 0.4)', fontFamily: 'var(--font-montserrat)' }}>+{allEvs.length - 5}</span>}
                                      </div>
                                    )
                                  ) : (<>
                                  {/* One slot grid per week row (see layoutCell): multi-day bars hold
                                      their lane, and lane slots a bar doesn't cover on this day take
                                      the day's own events, so nothing is pushed down below an empty
                                      row and items line up across the week. */}
                                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                    {cellLayout.slots.map((slot, si) => {
                                      if (slot.kind === 'gap') return <div key={`g${si}`} style={{ height: EV_ROW_H, flexShrink: 0 }} />
                                      if (slot.kind === 'bar') {
                                        const bar     = slot.bar
                                        const isStart = bar.startCol === ci
                                        const isEnd   = bar.endCol   === ci
                                        const bg = notionColor(bar.ev)
                                        const barSel     = selectedEvId   === bar.ev.id
                                        const barHovered = hoveredPillKey === bar.ev.id
                                        return (
                                          <div key={`b${slot.lane}`}
                                            data-cal-event
                                            onContextMenu={(e) => openEvCtx(e, bar.ev, days[bar.startCol] ?? ds)}
                                            onMouseEnter={() => bar.ev.id && setHoveredPillKey(bar.ev.id)}
                                            onMouseLeave={() => setHoveredPillKey(null)}
                                            onClick={bar.ev.type === 'google' && bar.ev.id ? (e) => { e.stopPropagation(); openEditPopover(e.currentTarget.getBoundingClientRect(), bar.ev, days[bar.startCol] ?? ds) } : undefined}
                                            style={{ height: SPAN_H, marginBottom: SPAN_GAP, marginLeft: isStart ? 4 : 0, marginRight: isEnd ? 4 : 0, borderRadius: isStart && isEnd ? 4 : isStart ? '4px 0 0 4px' : isEnd ? '0 4px 4px 0' : 0, background: isPast ? bg + '8C' : bg, display: 'flex', alignItems: 'center', paddingLeft: isStart ? 5 : 2, overflow: 'hidden', flexShrink: 0, cursor: (bar.ev.type === 'google') && bar.ev.id ? 'pointer' : 'default', position: 'relative', boxShadow: barSel ? 'inset 0 0 0 2px rgba(255,255,255,0.6)' : 'none' }}>
                                            {(barHovered || barSel) && bar.ev.id && <div style={{ position: 'absolute', inset: 0, background: barSel ? 'rgba(255,255,255,0.145)' : 'rgba(255,255,255,0.071)', pointerEvents: 'none' }} />}
                                            {isStart && <span className={isPast ? 'cal-pill-title-past' : 'cal-pill-title'} style={{ fontSize: 10, color: isPast ? lightTextColor(bg, true) : '#fff', fontFamily: 'var(--font-montserrat)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bar.ev.title}</span>}
                                          </div>
                                        )
                                      }
                                      const ev = slot.ev
                                      const isDraggable    = ev.type === 'google' && !!ev.id
                                      const isBeingDragged = !!dragState && !!ev.id && dragState.ev.id === ev.id
                                      const sel = selectedEvId   === ev.id
                                      const hov = hoveredPillKey === ev.id
                                      const common = {
                                        draggable: isDraggable,
                                        onDragStart: isDraggable ? (e: React.DragEvent) => { e.stopPropagation(); setDragState({ ev, originDate: ds }) } : undefined,
                                        onDragEnd: isDraggable ? () => { setDragState(null); setDragOverDate(null); dragOverRef.current = null } : undefined,
                                        onMouseEnter: () => { if (ev.id) setHoveredPillKey(ev.id) },
                                        onMouseLeave: () => setHoveredPillKey(null),
                                        onClick: ev.type === 'google' && ev.id ? (e: React.MouseEvent<HTMLDivElement>) => { e.stopPropagation(); openEditPopover(e.currentTarget.getBoundingClientRect(), ev, ds) } : undefined,
                                        onContextMenu: (e: React.MouseEvent) => openEvCtx(e, ev, ds),
                                        'data-cal-event': true,
                                      }
                                      if (!slot.timed) {
                                        const evColor = notionColor(ev)
                                        return (
                                          <div key={`e${si}`} style={{ padding: '0 4px', flexShrink: 0 }}>
                                            <div {...common}
                                              style={{ background: isPast ? evColor + '8C' : evColor, borderRadius: 4, padding: '0 5px', marginBottom: 2, height: 18, display: 'flex', alignItems: 'center', overflow: 'hidden', minWidth: 0, width: '100%', boxSizing: 'border-box', cursor: isDraggable ? 'grab' : 'default', position: 'relative', boxShadow: sel ? 'inset 0 0 0 2px rgba(255,255,255,0.6)' : 'none', opacity: isBeingDragged ? 0.4 : 1, transition: 'opacity 0.1s' }}
                                            >
                                              {(hov || sel) && ev.id && <div style={{ position: 'absolute', inset: 0, background: sel ? 'rgba(255,255,255,0.145)' : 'rgba(255,255,255,0.071)', pointerEvents: 'none', borderRadius: 4 }} />}
                                              <span style={{ fontSize: 10, color: isPast ? lightTextColor(evColor, true) : '#fff', fontFamily: 'var(--font-montserrat)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</span>
                                            </div>
                                          </div>
                                        )
                                      }
                                      const bar     = notionColor(ev)
                                      const timeStr = ev.amount
                                        ? ev.amount.split(' – ')[0].trim().replace(/^(\d{2}):(\d{2})$/, (_, hh, mm) => { const n = Number(hh); return `${n % 12 || 12}:${mm}${n >= 12 ? 'p' : 'a'}` })
                                        : null
                                      return (
                                        <div key={`e${si}`} style={{ padding: '0 4px', flexShrink: 0 }}>
                                          <div {...common}
                                            style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 2, height: 18, overflow: 'hidden', minWidth: 0, width: '100%', boxSizing: 'border-box', background: 'transparent', borderRadius: 3, cursor: isDraggable ? 'grab' : 'default', position: 'relative', boxShadow: sel ? 'inset 0 0 0 2px rgba(255,255,255,0.6)' : 'none', opacity: isBeingDragged ? 0.4 : 1, transition: 'opacity 0.1s' }}
                                          >
                                            {(hov || sel) && ev.id && <div style={{ position: 'absolute', inset: 0, background: sel ? 'rgba(255,255,255,0.145)' : 'rgba(255,255,255,0.071)', pointerEvents: 'none', borderRadius: 3 }} />}
                                            <div style={{ width: 3, height: '100%', borderRadius: '3px 0 0 3px', background: isPast ? bar + '8C' : bar, flexShrink: 0 }} />
                                            <span style={{ fontSize: 10, color: lightTextColor(bar, isPast), fontFamily: 'var(--font-montserrat)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, paddingLeft: 4, paddingRight: 3 }}>
                                              {timeStr && <span style={{ color: lightTextColor(bar, true), marginRight: 3 }}>{timeStr}</span>}{ev.title}
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                  <div style={{ paddingLeft: 4, paddingRight: 4, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
                                    {(overflow > 0 || wouldOverflow) && (
                                      <button
                                        type="button"
                                        data-cal-event
                                        onClick={toggleWeek}
                                        onDoubleClick={e => e.stopPropagation()}
                                        className="hover:text-ink"
                                        style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer', fontSize: 9, lineHeight: `${OVERFLOW_H}px`, color: 'rgb(var(--rgb-ink) / 0.45)', fontFamily: 'var(--font-montserrat)' }}
                                      >
                                        {overflow > 0 ? `+${overflow} more` : 'Show less'}
                                      </button>
                                    )}
                                    {copiedEvent && pasteDate === ds && (
                                      <div style={{ padding: '0 5px', marginBottom: 2, height: 18, display: 'flex', alignItems: 'center', borderRadius: 4, border: '1.5px dashed rgba(212,175,55,0.45)', flexShrink: 0 }}>
                                        <span style={{ fontSize: 10, color: 'rgba(212,175,55,0.65)', fontFamily: 'var(--font-montserrat)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{copiedEvent.title}</span>
                                      </div>
                                    )}
                                  </div>
                                  </>)}
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
                </>) : (<>
                {/* ── Agenda (desktop list) ── roomy day-grouped list. Every day keeps a
                    zero-height ref'd anchor (even empty ones) so jump-to-month,
                    scroll-to-today and the infinite-scroll sentinels keep working. */}
                <div ref={scrollRef} onScroll={handleDetailScroll} data-touch-scroll style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative', background: 'var(--color-cal-bg)' }}>
                  <div ref={topSentRef} style={{ height: 1 }} />
                  <div style={{ maxWidth: 1080, padding: '8px 48px 0 40px' }}>
                    {months.map(({ year: y, month: m }) => {
                      const dim = getDaysInMonth(y, m)
                      const days = Array.from({ length: dim }, (_, i) => toDateStr(y, m, i + 1))
                      const hasAny = days.some(ds => (visibleMap[ds] ?? []).length > 0 || ds === todayStr)
                      return (
                        <section key={`${y}-${m}`}>
                          {hasAny && (
                            <h2 style={{ margin: 0, padding: '28px 0 6px', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)' }}>
                              {new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long' })}{' '}
                              <span style={{ fontWeight: 400, color: 'rgb(var(--rgb-ink-muted))' }}>{y}</span>
                            </h2>
                          )}
                          {days.map((ds, i) => {
                            const isTod  = ds === todayStr
                            const isPast = ds < todayStr
                            const events = visibleMap[ds] ?? []
                            const setRef = (el: HTMLDivElement | null) => { if (el) dayRefs.current.set(ds, el); else dayRefs.current.delete(ds) }
                            if (events.length === 0 && !isTod) return <div key={ds} ref={setRef} style={{ height: 0 }} />
                            const dt = new Date(y, m, i + 1)
                            return (
                              <div
                                key={ds}
                                ref={setRef}
                                onDoubleClick={e => { if ((e.target as HTMLElement).closest('[data-cal-event]')) return; openCreatePopover(e.currentTarget.getBoundingClientRect(), ds) }}
                                style={{ paddingTop: 18 }}
                              >
                                {/* Day header */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 0 8px', borderBottom: '0.5px solid var(--color-cal-grid-line)', marginBottom: 6 }}>
                                  <span style={{ fontSize: 15, fontWeight: 600, color: isPast ? 'rgb(var(--rgb-ink-muted))' : 'var(--color-ink)', fontFamily: 'var(--font-montserrat)' }}>
                                    {dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                  </span>
                                  {isTod && (
                                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: '#1a1200', background: '#D4AF37', borderRadius: 999, padding: '3px 9px', fontFamily: 'var(--font-montserrat)' }}>TODAY</span>
                                  )}
                                </div>
                                {events.length === 0 && (
                                  <p className="cal-agenda-empty" style={{ margin: 0, padding: '12px 14px', fontSize: 14, color: 'rgb(var(--rgb-ink-faint))', fontFamily: 'var(--font-montserrat)', borderRadius: 10 }}>
                                    Nothing scheduled — double-click to add an event
                                  </p>
                                )}
                                {events.map((ev, idx) => {
                                  const color    = notionColor(ev)
                                  const timed    = ev.type === 'google' && !!ev.amount
                                  const [st, et] = timed ? (getTimeRange(ev) ?? '').split(' – ') : ['', '']
                                  const editable = ev.type === 'google' && !!ev.id && !ev.id.startsWith('tmp-')
                                  const sel      = selectedEvId === ev.id && !!ev.id
                                  return (
                                    <div
                                      key={ev.id ?? idx}
                                      data-cal-event
                                      role={editable ? 'button' : undefined}
                                      tabIndex={editable ? 0 : undefined}
                                      className={editable ? 'cal-agenda-ev' : undefined}
                                      onClick={editable ? e => { e.stopPropagation(); openEditPopover(e.currentTarget.getBoundingClientRect(), ev, ds) } : undefined}
                                      onKeyDown={editable ? e => { if (e.key === 'Enter') openEditPopover(e.currentTarget.getBoundingClientRect(), ev, ds) } : undefined}
                                      onContextMenu={e => openEvCtx(e, ev, ds)}
                                      style={{ display: 'flex', alignItems: 'stretch', gap: 16, padding: '12px 14px', borderRadius: 10, opacity: isPast ? 0.62 : 1, background: sel ? 'rgb(var(--rgb-ink) / 0.06)' : undefined }}
                                    >
                                      <div style={{ width: 92, flexShrink: 0, paddingTop: 1, fontFamily: 'var(--font-montserrat)', fontVariantNumeric: 'tabular-nums' }}>
                                        {timed ? (
                                          <>
                                            <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--color-ink)' }}>{st}</p>
                                            {et && <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'rgb(var(--rgb-ink-muted))' }}>{et}</p>}
                                          </>
                                        ) : (
                                          <p style={{ margin: 0, fontSize: 13.5, color: 'rgb(var(--rgb-ink-muted))' }}>{ev.type === 'google' ? 'All day' : ev.amount}</p>
                                        )}
                                      </div>
                                      <span style={{ width: 4, borderRadius: 2, background: color, flexShrink: 0 }} />
                                      <div style={{ flex: 1, minWidth: 0, paddingTop: 1 }}>
                                        <p style={{ margin: 0, fontSize: 16, fontWeight: 500, lineHeight: 1.35, color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                                        {(ev.location || ev.notes) && (
                                          <p style={{ margin: '3px 0 0', fontSize: 13, color: 'rgb(var(--rgb-ink-muted))', fontFamily: 'var(--font-montserrat)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {ev.location || ev.notes}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </section>
                      )
                    })}
                  </div>
                  <div ref={botSentRef} style={{ height: 1 }} />
                  <div style={{ height: 120 }} />
                </div>
                </>)}
              </div>
            </div>
          </div>
        ) : (
          /* ── Mobile: Fantastical-style split view ── */
          <div style={{ width: '100vw', height: '100%', flex: 'none', display: 'flex', flexDirection: 'column', background: 'var(--color-bg-base)', userSelect: 'none', paddingTop: SAFE_TOP, boxSizing: 'border-box' }}>

            {/* Compact month grid — collapsible */}
            <div ref={gridWrapRef} style={{ height: gridH, overflow: 'hidden', flexShrink: 0, transition: isDraggingHandle ? 'none' : SNAP, background: 'var(--color-bg-surface)' }}>
              <div style={{ height: GRID_EXPANDED, display: 'flex', flexDirection: 'column' }}>
                {/* Month header */}
                <div style={{ display: 'flex', alignItems: 'center', paddingLeft: 16, paddingRight: 56, paddingTop: 12, paddingBottom: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => jumpToMonth(today.getFullYear(), today.getMonth())}
                    style={{ fontSize: 11, fontWeight: 600, color: '#D4AF37', background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px 0 0', fontFamily: 'var(--font-montserrat)', letterSpacing: '0.02em', flexShrink: 0 }}
                  >Today</button>
                  <button
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: 'none', border: 'none', textAlign: 'center', fontSize: 16, fontWeight: 700, color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', userSelect: 'none', cursor: 'pointer', letterSpacing: '-0.01em', touchAction: 'manipulation' }}
                    onClick={() => setMonthPickerOpen(true)}
                  >
                    {gridMonthLbl}
                    <span style={{ fontSize: 10, color: '#C9A84C', opacity: 0.8 }}>▾</span>
                  </button>
                </div>
                {/* DOW labels */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', paddingLeft: 8, paddingRight: 8, paddingTop: 10, paddingBottom: 4, flexShrink: 0 }}>
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

            {/* Drag handle — tap to toggle, drag or flick to resize (native touch: see the effect) */}
            <div
              ref={setHandleEl}
              style={{ position: 'relative', zIndex: 6, height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'row-resize', background: 'var(--color-bg-base)', borderTop: '1px solid rgb(var(--rgb-ink) / 0.05)', touchAction: 'none' }}
              onClick={() => setGridH(g => g > 0 ? 0 : GRID_EXPANDED)}
            >
              {/* Taller invisible hit area, so the thin handle is easy to grab */}
              <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: -12, bottom: -12, touchAction: 'none' }} />
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgb(var(--rgb-ink) / 0.18)' }} />
            </div>

            {/* Infinite scroll list — same design as before */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {/* Gold month label — visible only in full-list mode (gridH === 0); tap = picker, double-tap = today */}
              <div
                style={{ position: 'absolute', left: 4, top: 0, bottom: 0, width: 20, zIndex: 5,
                         display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                         opacity: gridH === 0 ? 1 : 0,
                         pointerEvents: gridH === 0 ? 'auto' : 'none', touchAction: 'manipulation',
                         transition: isDraggingHandle ? 'none' : 'opacity 0.3s cubic-bezier(0.4,0,0.2,1)' }}
                onClick={handleMonthLabelTap}
              >
                <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 800, color: 'rgba(212,175,55,0.65)', userSelect: 'none', whiteSpace: 'nowrap' }}>
                  {sideLbl}
                </span>
              </div>
              <div ref={scrollRef} onScroll={handleDetailScroll} data-touch-scroll
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
                          onClick={() => { navigator.vibrate?.(6); openCreateSheet(ds) }}
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
                                    <p style={{ fontSize: 11, color: 'rgb(var(--rgb-ink) / 0.26)', fontFamily: M, margin: '2px 0 0', lineHeight: 1.3 }}>
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
          <div data-touch-scroll style={{ flex: 1, overflowY: 'auto' }}>
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

    {/* FAB — iPhone only, requires at least one Google calendar enabled */}
    {!isLargeScreen && prefs.googleCalendarIds.length > 0 && (
      <GlobalFAB key={viewIndex} actions={[
        { Icon: CalendarPlus, label: 'New Event', onTap: () => openCreateSheet(viewIndex === 0 ? (gridSel ?? todayStr) : (selectedDay ?? todayStr)) },
      ]} />
    )}

    {/* Edit uses the FULL calendar list, not just writable ones: an event may
        live on a read-only calendar, and filtering it out made the sheet fall
        back to googleCals[0] and display the wrong calendar name and colour. */}
    <EditEventSheet open={!!editEvent} event={editEvent} googleCals={googleCals.filter(c => prefs.googleCalendarIds.includes(c.id))} onClose={() => setEditEvent(null)} onSave={handleEditEvent} onDelete={scope => { if (editEvent) handleSheetDelete(editEvent, scope); setEditEvent(null) }} onDuplicate={edits => { setEditEvent(null); setTimeout(() => setCreateEvent({ title: `${edits.title} (copy)`, date: edits.date, endDate: edits.endDate, allDay: edits.allDay, startTime: edits.startTime, endTime: edits.endTime, location: edits.location, notes: edits.notes, recurrenceRule: edits.recurrenceRule, calendarId: edits.calendarId }), 80) }} />
    <EditEventSheet open={!!createEvent} event={createEvent} googleCals={writableCals.filter(c => prefs.googleCalendarIds.includes(c.id))} onClose={() => setCreateEvent(null)} onSave={handleCreateEvent} onDelete={() => setCreateEvent(null)} />
    <CalendarSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} prefs={prefs} googleCals={googleCals} calsLoading={calsLoading} calsError={calsError} onSave={savePrefs} />

    <MonthYearPicker
      open={monthPickerOpen}
      year={gridYear}
      month={gridMonth}
      onClose={() => setMonthPickerOpen(false)}
      onSelect={jumpToMonth}
    />

    {/* Color swatch picker */}
    {swatchOpen && (() => {
      const { id, kind, top, left } = swatchOpen
      const currentColor = kind === 'type'
        ? prefs.typeColors?.[id] ?? DOT_COLOR[id as EventType]
        : prefs.googleCalendarColors?.[id] ?? googleCals.find(c => c.id === id)?.backgroundColor ?? DOT_COLOR.google
      const popW = 4 * 22 + 3 * 6 + 20  // 4 cols + 3 gaps + padding = 126px
      return (
        <div ref={swatchRef} onMouseDown={e => e.stopPropagation()} style={{
          position: 'fixed',
          top: Math.min(top, window.innerHeight - 180),
          left: Math.max(8, Math.min(left, window.innerWidth - popW - 8)),
          zIndex: 400,
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid rgb(var(--rgb-ink) / 0.12)',
          borderRadius: 10,
          padding: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 22px)',
          gap: 6,
          boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
        }}>
          {COLOR_PALETTE.map(color => {
            const isSel = color.toLowerCase() === currentColor?.toLowerCase()
            return (
              <button
                key={color}
                onClick={() => {
                  if (kind === 'type') savePrefs({ ...prefs, typeColors: { ...(prefs.typeColors ?? {}), [id]: color } })
                  else savePrefs({ ...prefs, googleCalendarColors: { ...(prefs.googleCalendarColors ?? {}), [id]: color } })
                  setSwatchOpen(null)
                }}
                style={{
                  width: 22, height: 22, borderRadius: 4, background: color, padding: 0,
                  border: isSel ? '2px solid rgb(var(--rgb-ink) / 0.9)' : '2px solid transparent',
                  cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxSizing: 'border-box',
                }}
              >
                {isSel && <span style={{ color: 'white', fontSize: 12, fontWeight: 700, lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>✓</span>}
              </button>
            )
          })}
        </div>
      )
    })()}

    {/* Sidebar context menu */}
    {evCtxMenu && (() => {
      const { x, y, ev, date } = evCtxMenu
      const items: Array<{ label: string; action: () => void; danger?: boolean }> = [
        { label: 'Edit',      action: () => openEditPopover(new DOMRect(x, y, 0, 0), ev, date) },
        { label: 'Duplicate', action: () => duplicateFromEvent(ev, date, new DOMRect(x, y, 0, 0)) },
        { label: 'Copy',      action: () => { setCopiedEvent(ev); showToast('Event copied — hover a day then ⌘V', { type: 'add' }) } },
        { label: 'Delete',    action: () => handleDeleteCalEvent(ev, date), danger: true },
      ]
      const menuW = 168, menuH = items.length * 34 + 8
      return (
        <div ref={evCtxRef} style={{ position: 'fixed', top: Math.min(y, window.innerHeight - menuH - 8), left: Math.min(x, window.innerWidth - menuW - 8), width: menuW, background: 'var(--glass-strong)', backdropFilter: 'blur(32px) saturate(190%)', WebkitBackdropFilter: 'blur(32px) saturate(190%)', border: '0.5px solid var(--glass-edge)', borderRadius: 10, zIndex: 300, boxShadow: 'var(--glass-shadow), inset 0 0.5px 0 var(--glass-hi)', overflow: 'hidden', fontFamily: 'var(--font-montserrat)', padding: '4px 0' }}>
          {items.map(item => (
            <button key={item.label} onClick={() => { item.action(); setEvCtxMenu(null) }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgb(var(--rgb-ink) / 0.06)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
              style={{ display: 'block', width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: item.danger ? '#ef4444' : 'var(--color-ink)', fontFamily: 'var(--font-montserrat)' }}>
              {item.label}
            </button>
          ))}
        </div>
      )
    })()}

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
        ...(kind === 'type' && prefs.typeColors?.[id] ? [{
          label: 'Reset Color',
          action: () => { const tc = { ...(prefs.typeColors ?? {}) }; delete tc[id as EventType]; savePrefs({ ...prefs, typeColors: tc }); setSidebarCtxMenu(null) },
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
          background: 'var(--color-bg-elevated)',
          border: '0.5px solid rgb(var(--rgb-ink) / 0.1)',
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
        // Create offers only writable calendars; edit shows the full list so an
        // event on a read-only calendar still displays its real one. A move to
        // an unwritable target is caught by blockedCalendarMsg on save.
        googleCals={(popover.mode === 'create' ? writableCals : googleCals).filter(c => prefs.googleCalendarIds.includes(c.id))}
        googleCalendarColors={prefs.googleCalendarColors}
        onClose={() => { setPopover(null); setSelectedEvId(null) }}
        onSave={handlePopoverSave}
        onDelete={popover.mode === 'edit' ? handlePopoverDelete : undefined}
        onDuplicate={data => setPopover(p => p ? { ...p, mode: 'create', data: { ...data, eventId: undefined, title: `${data.title} (copy)` } } : p)}
      />
    )}

    {/* Recurring delete scope prompt — shared by the day card, context menu and
        keyboard delete, so every surface asks rather than silently assuming. */}
    {deleteScopeAsk && (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        onClick={() => setDeleteScopeAsk(null)}
      >
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--color-bg-elevated)', borderRadius: 16, padding: '22px 22px 18px', maxWidth: 340, width: '100%', boxShadow: '0 8px 40px rgba(0,0,0,0.7)', border: '0.5px solid rgb(var(--rgb-ink) / 0.1)', fontFamily: 'var(--font-montserrat)' }}>
          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 6px' }}>Delete Recurring Event</p>
          <p style={{ fontSize: 13.5, color: 'rgb(var(--rgb-ink) / 0.5)', margin: '0 0 16px', lineHeight: 1.45 }}>
            &ldquo;{deleteScopeAsk.ev.title}&rdquo; repeats. What should be deleted?
          </p>
          {([
            ['this',      'This event',         'Only this occurrence',                  false],
            ['following', 'This and following', 'This occurrence and every one after it', true ],
          ] as const).map(([val, label, hint, danger]) => (
            <button
              key={val}
              onClick={() => {
                const { ev, date } = deleteScopeAsk
                setDeleteScopeAsk(null)
                setSelectedEvId(null)
                runCalDelete({ eventId: ev.id!, masterId: ev.recurringEventId, calId: ev.calendarId ?? 'primary', fromDate: date, scope: val })
              }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 7, borderRadius: 10, border: '0.5px solid rgb(var(--rgb-ink) / 0.1)', background: 'rgb(var(--rgb-ink) / 0.04)', cursor: 'pointer', fontFamily: 'var(--font-montserrat)' }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: danger ? '#ef4444' : 'var(--color-ink)' }}>{label}</div>
              <div style={{ fontSize: 11.5, color: 'rgb(var(--rgb-ink) / 0.45)', marginTop: 2 }}>{hint}</div>
            </button>
          ))}
          <button
            onClick={() => setDeleteScopeAsk(null)}
            style={{ width: '100%', padding: '9px', marginTop: 2, borderRadius: 10, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13.5, color: 'rgb(var(--rgb-ink) / 0.5)', fontFamily: 'var(--font-montserrat)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    )}

    {/* Delete confirm dialog */}
    {deleteConfirm && (
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        onClick={() => setDeleteConfirm(null)}
      >
        <div onClick={e => e.stopPropagation()} style={{ background: 'var(--color-bg-elevated)', borderRadius: 16, padding: '24px 24px 20px', maxWidth: 340, width: 'calc(100vw - 40px)', boxShadow: '0 8px 40px rgba(0,0,0,0.7)', border: '0.5px solid rgb(var(--rgb-ink) / 0.1)', fontFamily: 'var(--font-montserrat)' }}>
          <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--color-ink)', margin: '0 0 8px' }}>Delete Event</p>
          <p style={{ fontSize: 14, color: 'rgb(var(--rgb-ink) / 0.5)', margin: '0 0 20px', lineHeight: 1.45 }}>
            &ldquo;{deleteConfirm.title}&rdquo; will be permanently deleted.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={() => setDeleteConfirm(null)}
              style={{ padding: '8px 16px', borderRadius: 8, background: 'rgb(var(--rgb-ink) / 0.06)', border: '0.5px solid rgb(var(--rgb-ink) / 0.1)', color: 'var(--color-ink)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-montserrat)' }}
            >
              Cancel
            </button>
            <button
              onClick={() => { handleDeleteCalEvent(deleteConfirm); setDeleteConfirm(null); setSelectedEvId(null) }}
              style={{ padding: '8px 18px', borderRadius: 8, background: '#ef4444', border: 'none', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-montserrat)' }}
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
