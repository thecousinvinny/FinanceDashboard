'use client'

import { useState, useEffect, useRef } from 'react'
import { X, MapPin, AlignLeft, RefreshCw, Clock, ChevronDown, Calendar } from 'lucide-react'
import type { GCalendar } from './CalendarSettingsSheet'
import { DateRangePicker } from './DateRangePicker'

export interface PopoverFormData {
  eventId?:       string
  title:          string
  date:           string      // YYYY-MM-DD
  endDate:        string
  allDay:         boolean
  startTime:      string      // HH:MM
  endTime:        string      // HH:MM
  location:       string
  notes:          string
  recurrenceRule: string
  calendarId:     string
}

interface Props {
  anchorRect: DOMRect | null   // null → centered modal (iPhone)
  mode:       'create' | 'edit'
  initial:    PopoverFormData
  googleCals: GCalendar[]
  googleCalendarColors?: Record<string, string>
  onClose:   () => void
  onSave:    (data: PopoverFormData) => void
  onDelete?: () => void
  saving?:   boolean
}

const W      = 320
const MAX_H  = 500
const ARROW  = 9
const GAP    = 8

type Side = 'right' | 'left' | 'bottom'

function calcPlacement(rect: DOMRect): { side: Side; top: number; left: number; arrowAt: number } {
  const vw = window.innerWidth, vh = window.innerHeight
  let side: Side = 'right', top = 0, left = 0, arrowAt = 0

  if (vw - rect.right - GAP >= W + ARROW) {
    side = 'right'
    left = rect.right + GAP + ARROW
    top  = Math.max(8, Math.min(vh - MAX_H - 8, rect.top + rect.height / 2 - MAX_H / 2))
    arrowAt = (rect.top + rect.height / 2) - top
  } else if (rect.left - GAP >= W + ARROW) {
    side = 'left'
    left = rect.left - GAP - ARROW - W
    top  = Math.max(8, Math.min(vh - MAX_H - 8, rect.top + rect.height / 2 - MAX_H / 2))
    arrowAt = (rect.top + rect.height / 2) - top
  } else {
    side = 'bottom'
    top  = Math.min(vh - MAX_H - 8, rect.bottom + GAP + ARROW)
    left = Math.max(8, Math.min(vw - W - 8, rect.left + rect.width / 2 - W / 2))
    arrowAt = (rect.left + rect.width / 2) - left
  }

  top     = Math.max(8, top)
  left    = Math.max(8, Math.min(vw - W - 8, left))
  arrowAt = Math.max(20, Math.min(MAX_H - 20, arrowAt))
  return { side, top, left, arrowAt }
}

const BG    = '#21242A'
const DIV   = '#2E3240'
const MUTED = '#6B7280'
const GOLD  = '#C9A84C'

const REPEAT_OPTIONS = [
  { label: 'No repeat',   value: '' },
  { label: 'Every day',   value: 'FREQ=DAILY' },
  { label: 'Every week',  value: 'FREQ=WEEKLY' },
  { label: 'Every month', value: 'FREQ=MONTHLY' },
  { label: 'Every year',  value: 'FREQ=YEARLY' },
]

function repeatLabel(rule: string): string {
  if (!rule) return 'Repeat'
  return REPEAT_OPTIONS.find(o => o.value === rule)?.label ?? rule
}

interface LocSuggestion {
  placeId:           string
  mainText:          string
  secText:           string
  description:       string
  matchedSubstrings: Array<{ offset: number; length: number }>
}

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function fmtDateLabel(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtDateUnder(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).replace(',', '')
}

function calcDuration(date: string, startTime: string, endDate: string, endTime: string): string {
  const start    = new Date(`${date}T${startTime}:00`)
  const end      = new Date(`${endDate}T${endTime}:00`)
  const totalMin = Math.round((end.getTime() - start.getTime()) / 60000)
  if (totalMin <= 0) return ''
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function defaultTimes(): { startTime: string; endTime: string } {
  const now       = new Date()
  const totalMins = now.getHours() * 60 + now.getMinutes()
  const rounded   = Math.round(totalMins / 30) * 30
  const sm        = rounded % (24 * 60)
  const sh        = Math.floor(sm / 60)
  const smin      = sm % 60
  const eh        = (sh + 1) % 24
  return {
    startTime: `${String(sh).padStart(2, '0')}:${String(smin).padStart(2, '0')}`,
    endTime:   `${String(eh).padStart(2, '0')}:${String(smin).padStart(2, '0')}`,
  }
}

const TIMES  = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`
)
const ITEM_H = 36

type DropRect = { top: number; left: number; width: number }

export function CalendarPopover({
  anchorRect, mode, initial, googleCals, googleCalendarColors,
  onClose, onSave, onDelete, saving,
}: Props) {
  const [form, setForm]               = useState<PopoverFormData>(initial)
  const [repeatOpen, setRepeatOpen]   = useState(false)
  const [startOpen, setStartOpen]     = useState(false)
  const [endOpen, setEndOpen]         = useState(false)
  const [startDropRect, setStartDropRect] = useState<DropRect | null>(null)
  const [endDropRect,   setEndDropRect]   = useState<DropRect | null>(null)
  const [calDropOpen, setCalDropOpen] = useState(false)
  const [calDropRect, setCalDropRect] = useState<DropRect | null>(null)
  const [visible, setVisible]         = useState(false)
  const [dateRangeOpen, setDateRangeOpen] = useState(false)
  const [dateAnchor, setDateAnchor]       = useState<DOMRect | null>(null)
  const [locValue,       setLocValue]       = useState(initial.location)
  const [locSuggestions, setLocSuggestions] = useState<LocSuggestion[]>([])
  const [locOpen,        setLocOpen]        = useState(false)
  const [recentLoc,      setRecentLoc]      = useState('')
  const [locDropRect,    setLocDropRect]    = useState<DropRect | null>(null)

  const titleRef     = useRef<HTMLInputElement>(null)
  const popRef       = useRef<HTMLDivElement>(null)
  const dateRowRef   = useRef<HTMLDivElement>(null)
  const startBtnRef  = useRef<HTMLButtonElement>(null)
  const endBtnRef    = useRef<HTMLButtonElement>(null)
  const startDropRef = useRef<HTMLDivElement>(null)
  const endDropRef   = useRef<HTMLDivElement>(null)
  const calBtnRef    = useRef<HTMLButtonElement>(null)
  const calDropRef   = useRef<HTMLDivElement>(null)
  const locDropRef      = useRef<HTMLDivElement>(null)
  const locRowRef       = useRef<HTMLDivElement>(null)
  const locTextareaRef  = useRef<HTMLTextAreaElement>(null)
  const locSvcRef       = useRef<unknown>(null)
  const locTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isModal   = anchorRect === null
  const placement = anchorRect ? calcPlacement(anchorRect) : null
  const origin    = placement
    ? placement.side === 'right' ? 'left center'
    : placement.side === 'left'  ? 'right center'
    : 'top center'
    : 'center'

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    setTimeout(() => titleRef.current?.focus(), 80)
  }, [])

  // Google Places AutocompleteService — raw predictions, no pac-container appended to body
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) return
    const saved = localStorage.getItem('cal-recent-location')
    if (saved) setRecentLoc(saved)

    function init() {
      const g = (window as unknown as Record<string, unknown>).google as {
        maps?: { places?: { AutocompleteService: new () => unknown } }
      } | undefined
      if (!g?.maps?.places) return
      locSvcRef.current = new g.maps.places.AutocompleteService()
    }

    const g = (window as unknown as Record<string, unknown>).google as { maps?: { places?: unknown } } | undefined
    if (g?.maps?.places) {
      init()
    } else {
      const existing = document.getElementById('gmaps-script')
      if (!existing) {
        const s = document.createElement('script')
        s.id    = 'gmaps-script'
        s.src   = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
        s.async = true
        s.onload = init
        document.head.appendChild(s)
      } else {
        existing.addEventListener('load', init, { once: true })
      }
    }
    return () => { locSvcRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Main popover outside-click — ignore clicks inside any child dropdown
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        !calDropRef.current?.contains(e.target as Node) &&
        !startDropRef.current?.contains(e.target as Node) &&
        !endDropRef.current?.contains(e.target as Node) &&
        !locDropRef.current?.contains(e.target as Node) &&
        !(e.target as Element)?.closest?.('[data-daterange-picker]')
      ) onClose()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 60)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown) }
  }, [onClose])

  // Individual dropdown outside-clicks
  useEffect(() => {
    if (!startOpen) return
    const onDown = (e: MouseEvent) => {
      if (!startDropRef.current?.contains(e.target as Node) && !startBtnRef.current?.contains(e.target as Node))
        setStartOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [startOpen])

  useEffect(() => {
    if (!endOpen) return
    const onDown = (e: MouseEvent) => {
      if (!endDropRef.current?.contains(e.target as Node) && !endBtnRef.current?.contains(e.target as Node))
        setEndOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [endOpen])

  useEffect(() => {
    if (!calDropOpen) return
    const onDown = (e: MouseEvent) => {
      if (!calDropRef.current?.contains(e.target as Node) && !calBtnRef.current?.contains(e.target as Node))
        setCalDropOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [calDropOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (dateRangeOpen) { setDateRangeOpen(false); return }
        if (locOpen)    { setLocOpen(false);    return }
        if (startOpen)  { setStartOpen(false);  return }
        if (endOpen)    { setEndOpen(false);    return }
        if (calDropOpen){ setCalDropOpen(false); return }
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, startOpen, endOpen, calDropOpen, locOpen, dateRangeOpen])

  function setField<K extends keyof PopoverFormData>(key: K, val: PopoverFormData[K]) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'startTime' && typeof val === 'string' && !next.allDay) {
        const [h, m] = val.split(':').map(Number)
        const eh = (h + 1) % 24
        next.endTime = `${String(eh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
        // If adding 1h crossed midnight (e.g. start 23:30 → end 00:30), advance endDate
        if (eh < h && next.endDate === next.date) next.endDate = addOneDay(next.date)
      }
      if (key === 'endTime' && typeof val === 'string' && !next.allDay) {
        // End time is before start time on the same date → must be next day
        if (val < next.startTime && next.endDate === next.date) next.endDate = addOneDay(next.date)
      }
      if (key === 'date' && typeof val === 'string' && next.endDate < val) {
        next.endDate = val
      }
      return next
    })
  }

  function openStartDrop() {
    if (startOpen) { setStartOpen(false); return }
    const r = startBtnRef.current?.getBoundingClientRect()
    if (!r) return
    setStartDropRect({ top: r.bottom, left: r.left, width: r.width })
    setStartOpen(true)
    setEndOpen(false)
    const target = form.startTime
    setTimeout(() => {
      const el = startDropRef.current
      if (!el) return
      const idx = TIMES.indexOf(target)
      if (idx >= 0) el.scrollTop = Math.max(0, idx * ITEM_H - el.clientHeight / 2 + ITEM_H / 2)
    }, 20)
  }

  function openEndDrop() {
    if (endOpen) { setEndOpen(false); return }
    const r = endBtnRef.current?.getBoundingClientRect()
    if (!r) return
    setEndDropRect({ top: r.bottom, left: r.left, width: r.width })
    setEndOpen(true)
    setStartOpen(false)
    const target = form.endTime
    setTimeout(() => {
      const el = endDropRef.current
      if (!el) return
      const idx = TIMES.indexOf(target)
      if (idx >= 0) el.scrollTop = Math.max(0, idx * ITEM_H - el.clientHeight / 2 + ITEM_H / 2)
    }, 20)
  }

  function openCalDrop() {
    const r = calBtnRef.current?.getBoundingClientRect()
    if (r) setCalDropRect({ top: r.top, left: r.left, width: r.width })
    setCalDropOpen(o => !o)
  }

  useEffect(() => {
    if (!locOpen) return
    const onDown = (e: MouseEvent) => {
      if (!locDropRef.current?.contains(e.target as Node) && !locRowRef.current?.contains(e.target as Node))
        setLocOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [locOpen])

  useEffect(() => {
    const el = locTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [locValue])

  function handleLocChange(val: string) {
    setLocValue(val)
    setField('location', val)
    if (locTimerRef.current) clearTimeout(locTimerRef.current)
    if (!val.trim()) {
      setLocSuggestions([])
      if (recentLoc) {
        if (locRowRef.current) {
          const r = locRowRef.current.getBoundingClientRect()
          setLocDropRect({ top: r.bottom, left: r.left, width: r.width })
        }
        setLocOpen(true)
      } else {
        setLocOpen(false)
      }
      return
    }
    locTimerRef.current = setTimeout(() => {
      const svc = locSvcRef.current as { getPlacePredictions: (req: unknown, cb: (results: unknown[] | null, status: string) => void) => void } | null
      if (!svc) return
      svc.getPlacePredictions(
        { input: val, types: ['geocode', 'establishment'] },
        (results: unknown[] | null, status: string) => {
          if (status === 'OK' && results && results.length > 0) {
            const mapped = (results as Array<{
              place_id: string
              structured_formatting: {
                main_text:                    string
                secondary_text?:              string
                main_text_matched_substrings: Array<{ offset: number; length: number }>
              }
              description: string
            }>).slice(0, 5).map(r => ({
              placeId:           r.place_id,
              mainText:          r.structured_formatting.main_text,
              secText:           r.structured_formatting.secondary_text ?? '',
              description:       r.description,
              matchedSubstrings: r.structured_formatting.main_text_matched_substrings ?? [],
            }))
            setLocSuggestions(mapped)
            if (locRowRef.current) {
              const rect = locRowRef.current.getBoundingClientRect()
              setLocDropRect({ top: rect.bottom, left: rect.left, width: rect.width })
            }
            setLocOpen(true)
          } else {
            setLocSuggestions([])
            setLocOpen(false)
          }
        }
      )
    }, 200)
  }

  function handleLocFocus() {
    if (locRowRef.current) {
      const r = locRowRef.current.getBoundingClientRect()
      setLocDropRect({ top: r.bottom, left: r.left, width: r.width })
    }
    if (locSuggestions.length > 0) setLocOpen(true)
    else if (!locValue && recentLoc) setLocOpen(true)
  }

  function selectLoc(text: string) {
    setLocValue(text)
    setField('location', text)
    setLocOpen(false)
    setLocSuggestions([])
    localStorage.setItem('cal-recent-location', text)
    setRecentLoc(text)
  }

  function highlightMatch(text: string, query: string) {
    if (!query.trim()) return text
    const lower  = text.toLowerCase()
    const qLower = query.toLowerCase()
    const idx    = lower.indexOf(qLower)
    if (idx < 0) return text
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ color: GOLD }}>{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    )
  }

  const calList   = googleCals
  const activeCal = calList.find(c => c.id === form.calendarId) ?? calList[0]
  const calColor  = googleCalendarColors?.[form.calendarId] ?? activeCal?.backgroundColor ?? '#4285F4'
  const canSave   = !!form.title.trim()

  const inputStyle: React.CSSProperties = {
    background: 'none', border: 'none', outline: 'none',
    color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)',
    fontSize: 13, caretColor: GOLD, colorScheme: 'dark',
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', borderBottom: `0.5px solid ${DIV}`,
  }

  const timeBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.06)',
    border: 'none', cursor: 'pointer', borderRadius: 6,
    fontSize: 13, color: active ? GOLD : 'var(--color-ink)',
    fontFamily: 'var(--font-montserrat)', padding: '4px 10px',
    transition: 'background 0.1s', flexShrink: 0, fontWeight: active ? 600 : 400,
  })

  const nativeTimeStyle: React.CSSProperties = {
    flex: 1, background: 'rgba(255,255,255,0.06)', border: 'none', outline: 'none',
    borderRadius: 6, padding: '4px 8px', fontSize: 13,
    color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)',
    colorScheme: 'dark', minWidth: 0,
  }

  const dateLabelWrap: React.CSSProperties = {
    position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0,
  }

  const hiddenDate: React.CSSProperties = {
    position: 'absolute', inset: 0, opacity: 0,
    cursor: 'pointer', width: '100%', height: '100%', colorScheme: 'dark',
  }

  const timeDropStyle = (rect: DropRect): React.CSSProperties => ({
    position: 'fixed',
    top: rect.top + 4,
    left: rect.left,
    minWidth: Math.max(rect.width, 130),
    maxHeight: 200,
    overflowY: 'auto',
    background: BG,
    border: `1px solid ${DIV}`,
    borderRadius: 10,
    zIndex: 202,
    boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
  })

  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    width: W, maxHeight: MAX_H,
    background: BG,
    borderRadius: 14,
    boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
    zIndex: 200,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    opacity: visible ? 1 : 0,
    transition: 'transform 0.14s cubic-bezier(0.2,0,0,1), opacity 0.1s ease',
    transformOrigin: origin,
    fontFamily: 'var(--font-montserrat)',
    ...(isModal ? {
      top: '50%', left: '50%',
      transform: visible ? 'translate(-50%,-50%) scale(1)' : 'translate(-50%,-50%) scale(0.93)',
    } : {
      top: placement!.top, left: placement!.left,
      transform: visible ? 'scale(1)' : 'scale(0.93)',
    }),
  }

  return (
    <>
      {/* Backdrop (modal) */}
      {isModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.5)', opacity: visible ? 1 : 0, transition: 'opacity 0.15s' }}
          onMouseDown={onClose} />
      )}

      {/* Arrow (anchored) */}
      {!isModal && placement && (() => {
        const a = placement.arrowAt, s = placement.side
        const base: React.CSSProperties = { position: 'fixed', zIndex: 199, width: 0, height: 0 }
        if (s === 'right') return <div style={{ ...base, top: placement.top + a - ARROW, left: placement.left - ARROW*2, borderTop: `${ARROW}px solid transparent`, borderBottom: `${ARROW}px solid transparent`, borderRight: `${ARROW*2}px solid ${BG}` }} />
        if (s === 'left')  return <div style={{ ...base, top: placement.top + a - ARROW, left: placement.left + W, borderTop: `${ARROW}px solid transparent`, borderBottom: `${ARROW}px solid transparent`, borderLeft: `${ARROW*2}px solid ${BG}` }} />
        return <div style={{ ...base, top: placement.top - ARROW*2, left: placement.left + a - ARROW, borderLeft: `${ARROW}px solid transparent`, borderRight: `${ARROW}px solid transparent`, borderBottom: `${ARROW*2}px solid ${BG}` }} />
      })()}

      {/* Start time dropdown — fixed, doesn't disturb popover layout */}
      {startOpen && startDropRect && (
        <div ref={startDropRef} style={timeDropStyle(startDropRect)}>
          {TIMES.map(t => {
            const sel = t === form.startTime
            return (
              <button key={t} onClick={() => { setField('startTime', t); setStartOpen(false) }}
                style={{ display: 'block', width: '100%', height: ITEM_H, padding: '0 14px', background: sel ? 'rgba(201,168,76,0.1)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: sel ? GOLD : 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', fontWeight: sel ? 600 : 400 }}>
                {fmt12(t)}
              </button>
            )
          })}
        </div>
      )}

      {/* End time dropdown */}
      {endOpen && endDropRect && (
        <div ref={endDropRef} style={timeDropStyle(endDropRect)}>
          {TIMES.map(t => {
            const sel = t === form.endTime
            return (
              <button key={t} onClick={() => { setField('endTime', t); setEndOpen(false) }}
                style={{ display: 'block', width: '100%', height: ITEM_H, padding: '0 14px', background: sel ? 'rgba(201,168,76,0.1)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: sel ? GOLD : 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', fontWeight: sel ? 600 : 400 }}>
                {fmt12(t)}
              </button>
            )
          })}
        </div>
      )}

      {/* Calendar dropdown — fixed above row, z-201 */}
      {calDropOpen && calDropRect && (
        <div ref={calDropRef} style={{
          position: 'fixed',
          bottom: window.innerHeight - calDropRect.top,
          left: calDropRect.left,
          minWidth: Math.max(calDropRect.width, 200),
          background: BG, border: `1px solid ${DIV}`, borderRadius: 10,
          overflow: 'hidden', zIndex: 201, boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
        }}>
          {calList.map(cal => {
            const color = googleCalendarColors?.[cal.id] ?? cal.backgroundColor
            const isSelected = cal.id === (form.calendarId || calList[0]?.id)
            return (
              <button key={cal.id} onClick={() => { setField('calendarId', cal.id); setCalDropOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', width: '100%', background: isSelected ? 'rgba(201,168,76,0.08)' : 'none', border: 'none', cursor: 'pointer' }}>
                <span style={{ width: 10, height: 10, borderRadius: 5, background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', textAlign: 'left' }}>
                  {cal.summary}{cal.primary ? ' (primary)' : ''}
                </span>
                {isSelected && <span style={{ color: GOLD, fontSize: 15, lineHeight: 1 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Location suggestions dropdown — rendered as sibling to avoid layout disruption */}
      {locOpen && locDropRect && (
        <div
          ref={locDropRef}
          onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
          style={{
            position: 'fixed',
            top: locDropRect.top + 2,
            left: locDropRect.left,
            width: locDropRect.width,
            background: '#1D2026',
            border: `0.5px solid ${DIV}`,
            borderRadius: 8,
            zIndex: 203,
            boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
            maxHeight: 320,
            overflowY: 'auto',
            fontFamily: 'var(--font-montserrat)',
          }}
        >
          {!locValue && recentLoc && (
            <button
              onClick={() => selectLoc(recentLoc)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', borderBottom: locSuggestions.length > 0 ? `0.5px solid ${DIV}` : 'none', textAlign: 'left' }}
            >
              <Clock size={14} color={MUTED} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: 'var(--color-ink)' }}>{recentLoc}</span>
            </button>
          )}
          {locSuggestions.map((sug, i) => (
            <button
              key={sug.placeId}
              onClick={() => selectLoc(sug.description)}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', borderBottom: i < locSuggestions.length - 1 ? `0.5px solid ${DIV}` : 'none', textAlign: 'left' }}
            >
              <MapPin size={14} color={MUTED} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, color: 'var(--color-ink)', fontWeight: 400, lineHeight: 1.4 }}>
                  {highlightMatch(sug.mainText, locValue)}
                </div>
                {sug.secText && (
                  <div style={{ fontSize: 12, color: MUTED, fontWeight: 300, lineHeight: 1.4, marginTop: 2 }}>
                    {sug.secText}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Custom date-range picker (PC / iPad) */}
      {dateRangeOpen && dateAnchor && (
        <DateRangePicker
          anchorRect={dateAnchor}
          startDate={form.date}
          endDate={form.endDate}
          onClose={() => setDateRangeOpen(false)}
          onApply={(start, end) => {
            setForm(f => ({ ...f, date: start, endDate: end }))
            setDateRangeOpen(false)
          }}
        />
      )}

      {/* Popover card */}
      <div ref={popRef} style={popoverStyle}>

        {/* Title */}
        <div style={{ padding: '13px 14px 11px', borderBottom: `0.5px solid ${DIV}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <input ref={titleRef} type="text" placeholder="Title" value={form.title}
            onChange={e => setField('title', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave && !saving) onSave(form) }}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 18, fontWeight: 500, color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', caretColor: GOLD }} />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: MUTED, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>

          {/* Date row — always FROM → TO */}
          <div style={rowStyle}>
            <Calendar size={16} color={MUTED} style={{ flexShrink: 0 }} />
            {isModal ? (
              /* iPhone — native wheel picker (unchanged) */
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                <div style={dateLabelWrap}>
                  <span style={{ fontSize: 13, color: 'var(--color-ink)', cursor: 'pointer', userSelect: 'none' }}>{fmtDateLabel(form.date)}</span>
                  <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} style={hiddenDate} />
                </div>
                <span style={{ color: MUTED, fontSize: 13 }}>→</span>
                <div style={dateLabelWrap}>
                  <span style={{ fontSize: 13, color: form.endDate !== form.date ? GOLD : 'var(--color-ink)', cursor: 'pointer', userSelect: 'none' }}>{fmtDateLabel(form.endDate)}</span>
                  <input type="date" value={form.endDate} min={form.date} onChange={e => setField('endDate', e.target.value)} style={hiddenDate} />
                </div>
              </div>
            ) : (
              /* PC / iPad — custom themed range picker */
              <div
                ref={dateRowRef}
                onClick={() => { setDateAnchor(dateRowRef.current?.getBoundingClientRect() ?? null); setDateRangeOpen(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, cursor: 'pointer', userSelect: 'none' }}
              >
                <span style={{ fontSize: 13, color: 'var(--color-ink)' }}>{fmtDateLabel(form.date)}</span>
                <span style={{ color: MUTED, fontSize: 13 }}>→</span>
                <span style={{ fontSize: 13, color: form.endDate !== form.date ? GOLD : 'var(--color-ink)' }}>{fmtDateLabel(form.endDate)}</span>
              </div>
            )}
          </div>

          {/* Time row — hidden when all-day */}
          {!form.allDay && (() => {
            const crossDay    = form.endDate !== form.date
            const durationStr = calcDuration(form.date, form.startTime, form.endDate, form.endTime)
            return (
              <div style={{ ...rowStyle, alignItems: crossDay ? 'flex-start' : 'center' }}>
                <Clock size={16} color={MUTED} style={{ flexShrink: 0, marginTop: crossDay ? 3 : 0 }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                  {/* Times + duration */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isModal ? (
                      <>
                        <input type="time" value={form.startTime} onChange={e => setField('startTime', e.target.value)} style={nativeTimeStyle} />
                        <span style={{ color: MUTED, fontSize: 13, flexShrink: 0 }}>→</span>
                        <input type="time" value={form.endTime} onChange={e => setField('endTime', e.target.value)} style={nativeTimeStyle} />
                      </>
                    ) : (
                      <>
                        <button ref={startBtnRef} onClick={openStartDrop} style={timeBtnStyle(startOpen)}>{fmt12(form.startTime)}</button>
                        <span style={{ color: MUTED, fontSize: 13, flexShrink: 0 }}>→</span>
                        <button ref={endBtnRef} onClick={openEndDrop} style={timeBtnStyle(endOpen)}>{fmt12(form.endTime)}</button>
                      </>
                    )}
                    {durationStr && <span style={{ fontSize: 12, color: MUTED, flexShrink: 0 }}>{durationStr}</span>}
                  </div>
                  {/* Date labels — only shown when event crosses midnight */}
                  {crossDay && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>{fmtDateUnder(form.date)}</span>
                      <span style={{ fontSize: 13, color: 'transparent', flexShrink: 0, userSelect: 'none' }}>→</span>
                      <span style={{ fontSize: 11, color: GOLD, flexShrink: 0 }}>{fmtDateUnder(form.endDate)}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {/* All-day toggle */}
          <div style={rowStyle}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--color-ink)' }}>All day</span>
            <button
              onClick={() => { setField('allDay', !form.allDay); setStartOpen(false); setEndOpen(false) }}
              style={{ width: 44, height: 24, borderRadius: 12, padding: '2px', background: form.allDay ? GOLD : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', transition: 'background 0.15s', display: 'flex', alignItems: 'center', justifyContent: form.allDay ? 'flex-end' : 'flex-start', flexShrink: 0 }}>
              <span style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
          </div>

          {/* Repeat */}
          <div style={{ borderBottom: `0.5px solid ${DIV}` }}>
            <button onClick={() => setRepeatOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}>
              <RefreshCw size={16} color={MUTED} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: form.recurrenceRule ? 'var(--color-ink)' : MUTED, fontFamily: 'var(--font-montserrat)', textAlign: 'left' }}>
                {repeatLabel(form.recurrenceRule)}
              </span>
            </button>
            {repeatOpen && (
              <div style={{ borderTop: `0.5px solid ${DIV}` }}>
                {REPEAT_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => { setField('recurrenceRule', opt.value); setRepeatOpen(false) }}
                    style={{ display: 'block', width: '100%', padding: '8px 14px 8px 40px', background: form.recurrenceRule === opt.value ? 'rgba(201,168,76,0.08)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: form.recurrenceRule === opt.value ? GOLD : 'var(--color-ink)', fontFamily: 'var(--font-montserrat)' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Location — textarea auto-sizes to content, icon top-pinned to first line */}
          <div ref={locRowRef} style={{ ...rowStyle, alignItems: 'flex-start', padding: '12px 14px' }}>
            <MapPin size={16} color={MUTED} style={{ flexShrink: 0, marginTop: 1 }} />
            <textarea
              ref={locTextareaRef}
              placeholder="Location"
              value={locValue}
              onChange={e => handleLocChange(e.target.value)}
              onFocus={handleLocFocus}
              rows={1}
              style={{ ...inputStyle, flex: 1, resize: 'none', lineHeight: 1.5, overflow: 'hidden', minHeight: 22, display: 'block' }}
            />
          </div>

          {/* Description */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: `0.5px solid ${DIV}` }}>
            <AlignLeft size={16} color={MUTED} style={{ flexShrink: 0, marginTop: 2 }} />
            <textarea placeholder="Description" value={form.notes} onChange={e => setField('notes', e.target.value)}
              rows={2} style={{ ...inputStyle, flex: 1, resize: 'none', lineHeight: 1.5 }} />
          </div>

          {/* Calendar selector */}
          {calList.length > 0 && (
            <button ref={calBtnRef} onClick={openCalDrop}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', width: '100%', background: 'none', border: 'none', cursor: calList.length > 1 ? 'pointer' : 'default' }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: calColor, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', textAlign: 'left' }}>
                {activeCal?.summary ?? 'Calendar'}{activeCal?.primary ? ' (primary)' : ''}
              </span>
              {calList.length > 1 && <ChevronDown size={14} color={MUTED} style={{ flexShrink: 0 }} />}
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: `0.5px solid ${DIV}`, padding: '8px 14px', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexShrink: 0 }}>
          {mode === 'edit' && onDelete && (
            <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444', fontFamily: 'var(--font-montserrat)', padding: '6px 10px', borderRadius: 8, marginRight: 'auto' }}>
              Delete
            </button>
          )}
          <button onClick={() => canSave && !saving && onSave(form)} disabled={!canSave || saving}
            style={{ background: canSave ? GOLD : 'rgba(255,255,255,0.08)', border: 'none', cursor: canSave ? 'pointer' : 'default', color: canSave ? '#fff' : MUTED, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-montserrat)', padding: '6px 18px', borderRadius: 8, transition: 'all 0.12s' }}>
            {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
