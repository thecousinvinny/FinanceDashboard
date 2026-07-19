'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Clock, AlignLeft, X, ChevronDown, RefreshCw, Calendar, Copy } from 'lucide-react'
import { localToday } from '@/lib/utils'
import { rruleLabel } from '@/lib/rrule'
import { RecurrencePicker } from './RecurrencePicker'
import { LocationPickerSheet } from './LocationPickerSheet'
import { DateRangePicker } from './DateRangePicker'
import { useIsLargeScreen } from '@/lib/use-large-screen'
import type { GCalendar } from './CalendarSettingsSheet'
import type { RecurScope } from '@/lib/calendar'

export interface EditableEvent {
  id?:            string
  title:          string
  allDay:         boolean
  date:           string
  endDate:        string
  startTime:      string
  endTime:        string
  location:       string
  notes:          string
  recurrenceRule: string
  calendarId:     string
  googleEventId?: string
  instanceDate?:  string
  recurringEventId?: string   // Google master id — set when editing a recurring instance
}

export interface EventEdits {
  title:          string
  date:           string
  endDate:        string
  allDay:         boolean
  startTime:      string
  endTime:        string
  location:       string
  notes:          string
  recurrenceRule: string
  calendarId:     string
}

export type RecurrenceScope = RecurScope

interface LocSuggestion {
  placeId:           string
  mainText:          string
  secText:           string
  description:       string
  matchedSubstrings: Array<{ offset: number; length: number }>
}

interface Props {
  open:        boolean
  event:       EditableEvent | null
  googleCals?: GCalendar[]
  onClose:     () => void
  // Resolves false when the write failed — the sheet then stays open so the
  // user's edits survive. void/undefined is treated as success.
  onSave:      (edits: EventEdits, scope: RecurrenceScope) => Promise<boolean | void>
  onDelete:    (scope: RecurrenceScope) => void
  onDuplicate?: (edits: EventEdits) => void
}

const M    = 'var(--font-montserrat)'
const GOLD = '#C9A84C'
const MUTED = 'rgb(var(--rgb-ink-muted))'
const SEP   = 'rgba(var(--rgb-ink-faint) / 0.25)'

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function fmtDatePill(dateStr: string): string {
  if (!dateStr) return ''
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
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

export function EditEventSheet({ open, event, googleCals = [], onClose, onSave, onDelete, onDuplicate }: Props) {
  const [confirmScope, setConfirmScope]   = useState(false)
  const [form, setForm]                   = useState<EventEdits | null>(null)
  const [saving, setSaving]               = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recurrencePickerOpen, setRecurrencePickerOpen] = useState(false)
  const [locPickerOpen,        setLocPickerOpen]        = useState(false)
  const [dateRangeOpen,        setDateRangeOpen]        = useState(false)
  const [dateAnchor,           setDateAnchor]           = useState<DOMRect | null>(null)
  const isLargeScreen = useIsLargeScreen()
  const dateRowRef = useRef<HTMLDivElement>(null)

  // Location autocomplete state
  const [locValue,       setLocValue]       = useState('')
  const [locSuggestions, setLocSuggestions] = useState<LocSuggestion[]>([])
  const [locOpen,        setLocOpen]        = useState(false)
  const [recentLoc,      setRecentLoc]      = useState('')

  const locSvcRef    = useRef<unknown>(null)
  const locTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locRowRef    = useRef<HTMLDivElement>(null)
  const locTextareaRef  = useRef<HTMLTextAreaElement>(null)
  const notesRef        = useRef<HTMLTextAreaElement>(null)
  const backdropRef  = useRef<HTMLDivElement>(null)
  const dragStartY   = useRef<number | null>(null)
  const sheetRef     = useRef<HTMLDivElement>(null)
  const scrollRef    = useRef<HTMLDivElement>(null)

  // Initialize AutocompleteService once
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
    if (g?.maps?.places) { init() }
    else {
      const existing = document.getElementById('gmaps-script')
      if (!existing) {
        const s = document.createElement('script'); s.id = 'gmaps-script'
        s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`; s.async = true; s.onload = init
        document.head.appendChild(s)
      } else { existing.addEventListener('load', init, { once: true }) }
    }
    return () => { locSvcRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // `event` identity changes again shortly after open when the master's RRULE
  // arrives from Google. Only a genuinely different event resets the form —
  // a late-arriving rule just patches that one field, so edits made in the
  // meantime survive.
  const prevEvent = useRef<EditableEvent | null>(null)
  useEffect(() => {
    if (open && event) {
      const prev = prevEvent.current
      prevEvent.current = event
      // The ONLY case that should skip a full re-init is the master's rule
      // landing on the event we already initialized. Comparing ids alone was
      // wrong: a create has no id, so `undefined !== undefined` was false and
      // the form never initialized at all — a blank sheet.
      const onlyRuleArrived = !!prev && prev !== event
        && prev.id === event.id && prev.date === event.date && prev.title === event.title
        && prev.recurrenceRule !== event.recurrenceRule
      if (onlyRuleArrived) {
        setForm(f => f ? { ...f, recurrenceRule: event.recurrenceRule } : f)
        return
      }
      setSaving(false)
      setConfirmDelete(false)
      setConfirmScope(false)
      setLocValue(event.location)
      setLocOpen(false)
      setLocSuggestions([])
      setForm({
        title:          event.title,
        date:           event.date,
        endDate:        event.endDate || event.date,
        allDay:         event.allDay,
        startTime:      event.startTime || '09:00',
        endTime:        event.endTime   || '10:00',
        location:       event.location,
        notes:          event.notes,
        recurrenceRule: event.recurrenceRule,
        calendarId:     event.calendarId || 'primary',
      })
    } else {
      prevEvent.current = null
      setTimeout(() => { setForm(null); setSaving(false); setConfirmDelete(false); setLocValue(''); setLocOpen(false); setLocSuggestions([]) }, 300)
    }
  }, [open, event])

  // Auto-resize location textarea
  useEffect(() => {
    const el = locTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [locValue])

  // Auto-resize notes textarea
  useEffect(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [form?.notes])

  // Scroll-area swipe-down dismiss: when already at top, pull-down closes the sheet
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !open) return
    let startY = 0
    let dragging = false
    const onStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY
      dragging = (el.scrollTop <= 0)
    }
    const onMove = (e: TouchEvent) => {
      if (!dragging || !sheetRef.current) return
      const dy = e.touches[0].clientY - startY
      if (dy <= 0) { dragging = false; return }
      e.preventDefault()
      sheetRef.current.style.transform  = `translateY(${dy}px)`
      sheetRef.current.style.transition = 'none'
    }
    const onEnd = (e: TouchEvent) => {
      if (!dragging || !sheetRef.current) return
      dragging = false
      const dy = Math.max(0, e.changedTouches[0].clientY - startY)
      if (dy > 80) {
        sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
        sheetRef.current.style.transform  = 'translateY(100%)'
        setTimeout(() => {
          if (sheetRef.current) { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
          onClose()
        }, 280)
      } else {
        sheetRef.current.style.transform  = ''
        sheetRef.current.style.transition = ''
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: false })
    el.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove',  onMove)
      el.removeEventListener('touchend',   onEnd)
    }
  }, [open, onClose])

  // Body-position lock: prevents iOS from shifting the viewport (and the nav bar)
  // when the keyboard appears inside the sheet
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top      = `-${scrollY}px`
    document.body.style.width    = '100%'
    document.documentElement.style.overscrollBehavior = 'none'
    return () => {
      document.body.style.position = ''
      document.body.style.top      = ''
      document.body.style.width    = ''
      document.documentElement.style.overscrollBehavior = ''
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // Keyboard-aware scroll: when keyboard opens, pad scroll container and
  // scroll the focused field above the keyboard so it's always visible
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return

    const onResize = () => {
      const sc = scrollRef.current
      if (!sc) return

      const kbH = Math.max(0, window.innerHeight - vv.height)

      if (kbH > 50) {
        // Keyboard open — give scroll room below content + scroll focused into view
        sc.style.paddingBottom = `${kbH + 24}px`
        requestAnimationFrame(() => {
          const focused = document.activeElement as HTMLElement | null
          if (!focused || !sc.contains(focused)) return
          const elRect   = focused.getBoundingClientRect()
          const clearance = vv.height - 16   // target: element bottom at most this far down
          if (elRect.bottom > clearance) {
            sc.scrollTop += elRect.bottom - clearance
          }
        })
      } else {
        // Keyboard closed — remove extra padding
        sc.style.paddingBottom = ''
      }
    }

    vv.addEventListener('resize', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      if (scrollRef.current) scrollRef.current.style.paddingBottom = ''
    }
  }, [open])

  function handleLocChange(val: string) {
    setLocValue(val)
    setForm(f => f ? { ...f, location: val } : f)
    if (locTimerRef.current) clearTimeout(locTimerRef.current)
    if (!val.trim()) {
      setLocSuggestions([])
      setLocOpen(recentLoc ? true : false)
      return
    }
    locTimerRef.current = setTimeout(() => {
      const svc = locSvcRef.current as {
        getPlacePredictions: (req: unknown, cb: (results: unknown[] | null, status: string) => void) => void
      } | null
      if (!svc) return
      svc.getPlacePredictions(
        { input: val, types: ['geocode', 'establishment'] },
        (results: unknown[] | null, status: string) => {
          if (status === 'OK' && results && results.length > 0) {
            const mapped = (results as Array<{
              place_id: string
              structured_formatting: {
                main_text: string
                secondary_text?: string
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
    if (locSuggestions.length > 0) { setLocOpen(true); return }
    if (!locValue && recentLoc) setLocOpen(true)
  }

  function selectLoc(text: string) {
    setLocValue(text)
    setForm(f => f ? { ...f, location: text } : f)
    setLocOpen(false)
    setLocSuggestions([])
    localStorage.setItem('cal-recent-location', text)
    setRecentLoc(text)
  }

  function highlightMatch(text: string, query: string) {
    if (!query.trim()) return <>{text}</>
    const lower  = text.toLowerCase()
    const qLower = query.toLowerCase()
    const idx    = lower.indexOf(qLower)
    if (idx < 0) return <>{text}</>
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ color: GOLD }}>{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    )
  }

  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !sheetRef.current) return
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current)
    sheetRef.current.style.transform  = `translateY(${dy}px)`
    sheetRef.current.style.transition = 'none'
  }
  function onDragEnd(e: React.TouchEvent) {
    if (!sheetRef.current) return
    const dy = dragStartY.current !== null ? Math.max(0, e.changedTouches[0].clientY - dragStartY.current) : 0
    dragStartY.current = null
    if (dy > 80) {
      sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
      sheetRef.current.style.transform  = 'translateY(100%)'
      setTimeout(() => {
        if (sheetRef.current) { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
        onClose()
      }, 280)
    } else {
      sheetRef.current.style.transform  = ''
      sheetRef.current.style.transition = ''
    }
  }

  function set(k: keyof EventEdits, v: string | boolean) {
    setForm(f => {
      if (!f) return f
      const next = { ...f, [k]: v }
      if (k === 'endTime' && typeof v === 'string' && !next.allDay) {
        if (v < next.startTime && next.endDate === next.date) next.endDate = addOneDay(next.date)
      }
      if (k === 'date' && typeof v === 'string' && next.endDate < v) {
        next.endDate = v
      }
      return next
    })
  }

  // Ask about scope at the moment of saving rather than up front, so a simple
  // edit doesn't open with a question before you've even seen the event.
  async function handleSave() {
    if (!form) return
    const isRecurring = !!event?.recurrenceRule && !!event.id
    if (!isRecurring) { await commitSave('this'); return }
    // Rewriting the rule can't apply to a single instance — no point asking.
    if (form.recurrenceRule !== event.recurrenceRule) { await commitSave('following'); return }
    setConfirmScope(true)
  }

  async function commitSave(s: RecurrenceScope) {
    if (!form) return
    setConfirmScope(false)
    setSaving(true)
    // Closing unconditionally threw away the user's edits whenever the write
    // failed (read-only calendar, rejected RRULE, network). onSave reports
    // success; on failure the sheet stays open with the form intact and the
    // caller's toast explains why.
    const ok = await onSave(form, s)
    if (ok === false) { setSaving(false); return }
    onClose()
  }

  function handleDelete() {
    if (!event?.recurrenceRule) { onDelete('this'); onClose(); return }
    setConfirmDelete(true)
  }

  function confirmDeleteWithScope(s: RecurrenceScope) {
    onDelete(s)
    onClose()
  }

  const canSave = !!form?.title.trim() && !!form?.date && form.date.length === 10

  const selectedCal = googleCals.find(c => (c.primary ? 'primary' : c.id) === form?.calendarId) ?? googleCals[0]
  const calDotColor = selectedCal?.backgroundColor ?? '#4285F4'
  const calName     = selectedCal?.summary ?? 'Calendar'

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px',
    borderBottom: `0.5px solid ${SEP}`,
  }

  const pillStyle = (active?: boolean): React.CSSProperties => ({
    position: 'relative',
    display: 'inline-flex', alignItems: 'center',
    background: active ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.06)',
    borderRadius: 8, padding: '5px 10px',
    fontSize: 13, fontWeight: 500, fontFamily: M,
    color: active ? GOLD : 'var(--color-ink)',
    overflow: 'hidden', cursor: 'pointer', userSelect: 'none',
  })

  const hiddenInput: React.CSSProperties = {
    position: 'absolute', inset: 0, opacity: 0,
    width: '100%', height: '100%', cursor: 'pointer',
    colorScheme: 'dark',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: MUTED, marginBottom: 4,
    fontFamily: M,
  }

  const durationStr = form && !form.allDay
    ? calcDuration(form.date, form.startTime, form.endDate, form.endTime)
    : ''

  const showLocDropdown = locOpen && (locSuggestions.length > 0 || (!locValue && recentLoc))

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] flex flex-col"
        style={{
          background:    'var(--color-bg-surface)',
          height:        'calc(100dvh - env(safe-area-inset-top, 44px) - 8px)',
          willChange:    'transform',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform:     open ? 'translateY(0)' : 'translateY(100%)',
          transition:    'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {form && (
          <>
            {/* Drag zone covers handle + × header — large touch target */}
            <div
              onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
              className="flex-shrink-0" style={{ touchAction: 'none' }}
            >
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 rounded-full bg-white/20" />
              </div>
              <div className="flex items-center justify-end px-4 pb-2">
                <button onTouchStart={e => e.stopPropagation()} onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
                  <X size={14} className="text-ink-muted" />
                </button>
              </div>
            </div>

            {/* Scrollable form */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto"
              style={{ overscrollBehavior: 'contain', overflowX: 'hidden' }}
            >

              {/* 1 — Title */}
              <input
                type="text"
                placeholder="Event name"
                value={form.title}
                onChange={e => set('title', e.target.value)}
                style={{
                  width: '100%', display: 'block',
                  padding: '12px 16px',
                  fontSize: 18, fontWeight: 500, fontFamily: M,
                  color: 'var(--color-ink)',
                  background: 'none', border: 'none', outline: 'none',
                  borderBottom: `0.5px solid ${SEP}`,
                }}
              />

              {/* 2 — All day toggle */}
              <button
                type="button"
                onClick={() => set('allDay', !form.allDay)}
                style={{ ...rowStyle, width: '100%', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
              >
                <Clock size={16} color={MUTED} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--color-ink)', fontFamily: M }}>All day</span>
                <span style={{
                  width: 44, height: 24, borderRadius: 12, padding: 2,
                  background: form.allDay ? GOLD : 'rgba(255,255,255,0.1)',
                  display: 'inline-flex', alignItems: 'center',
                  justifyContent: form.allDay ? 'flex-end' : 'flex-start',
                  flexShrink: 0, transition: 'background 0.15s',
                }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </span>
              </button>

              {/* 3 — From / To dates */}
              <div style={rowStyle}>
                <Calendar size={16} color={MUTED} style={{ flexShrink: 0 }} />
                <div
                  ref={dateRowRef}
                  onClick={isLargeScreen ? () => { setDateAnchor(dateRowRef.current?.getBoundingClientRect() ?? null); setDateRangeOpen(true) } : undefined}
                  style={{ display: 'flex', gap: 10, flex: 1, cursor: isLargeScreen ? 'pointer' : undefined }}
                >
                  <div>
                    <p style={labelStyle}>FROM</p>
                    <div style={pillStyle()}>
                      <span>{fmtDatePill(form.date)}</span>
                      {!isLargeScreen && (
                        <input type="date" value={form.date} style={hiddenInput}
                          onChange={e => set('date', e.target.value)} />
                      )}
                    </div>
                  </div>
                  <div>
                    <p style={labelStyle}>TO</p>
                    <div style={pillStyle(form.endDate !== form.date)}>
                      <span style={{ color: form.endDate !== form.date ? GOLD : 'var(--color-ink)' }}>
                        {fmtDatePill(form.endDate || form.date)}
                      </span>
                      {!isLargeScreen && (
                        <input type="date" value={form.endDate || form.date} min={form.date} style={hiddenInput}
                          onChange={e => set('endDate', e.target.value)} />
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 — Start / End time + duration */}
              {!form.allDay && (
                <div style={rowStyle}>
                  <Clock size={16} color={MUTED} style={{ flexShrink: 0 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
                    <div>
                      <p style={labelStyle}>START</p>
                      <div style={pillStyle()}>
                        <span>{fmt12(form.startTime)}</span>
                        <input type="time" value={form.startTime} style={{ ...hiddenInput, colorScheme: 'dark' }}
                          onChange={e => set('startTime', e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <p style={labelStyle}>END</p>
                      <div style={pillStyle()}>
                        <span>{fmt12(form.endTime)}</span>
                        <input type="time" value={form.endTime} style={{ ...hiddenInput, colorScheme: 'dark' }}
                          onChange={e => set('endTime', e.target.value)} />
                      </div>
                    </div>
                    {durationStr && (
                      <span style={{ fontSize: 12, color: MUTED, fontFamily: M, alignSelf: 'flex-end', paddingBottom: 2 }}>
                        {durationStr}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 5 — Repeat */}
              <button
                type="button"
                onClick={() => setRecurrencePickerOpen(true)}
                style={{ ...rowStyle, width: '100%', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
              >
                <RefreshCw size={16} color={MUTED} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--color-ink)', fontFamily: M }}>Repeat</span>
                <span style={{ fontSize: 13, color: MUTED, fontFamily: M, marginRight: 4 }}>
                  {form.recurrenceRule ? rruleLabel(form.recurrenceRule, form.date || localToday()) : 'Never'}
                </span>
                <ChevronDown size={14} color={MUTED} style={{ flexShrink: 0 }} />
              </button>

              {/* 6 — Location — taps open LocationPickerSheet */}
              <button
                type="button"
                onClick={() => setLocPickerOpen(true)}
                style={{ ...rowStyle, cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
              >
                <MapPin size={16} color={MUTED} style={{ flexShrink: 0 }} />
                <span style={{
                  flex: 1, fontSize: 14, fontFamily: M,
                  color: locValue ? 'var(--color-ink)' : MUTED,
                  textAlign: 'left', lineHeight: 1.4,
                }}>
                  {locValue || 'Location'}
                </span>
                <ChevronDown size={14} color={MUTED} style={{ flexShrink: 0 }} />
              </button>

              {/* 7 — Notes */}
              <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                <AlignLeft size={16} color={MUTED} style={{ flexShrink: 0, marginTop: 2 }} />
                <textarea
                  ref={notesRef}
                  placeholder="Notes"
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  rows={3}
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
                    fontSize: 14, color: 'var(--color-ink)', fontFamily: M,
                    lineHeight: 1.5, overflowY: 'hidden',
                  }}
                />
              </div>

              {/* 8 — Calendar selector */}
              {googleCals.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <div style={rowStyle}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: calDotColor, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--color-ink)', fontFamily: M }}>{calName}</span>
                    <ChevronDown size={14} color={MUTED} style={{ flexShrink: 0 }} />
                  </div>
                  <select
                    value={form.calendarId}
                    onChange={e => set('calendarId', e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                  >
                    {googleCals.map(cal => (
                      <option key={cal.id} value={cal.primary ? 'primary' : cal.id}>
                        {cal.summary}{cal.primary ? ' (primary)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Duplicate — only when editing an existing event */}
              {event?.id && onDuplicate && (
                <div style={{ padding: '12px 16px 0' }}>
                  <button
                    type="button"
                    onClick={() => { if (form) onDuplicate(form) }}
                    style={{ width: '100%', height: 44, background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 500, fontFamily: M, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                  >
                    <Copy size={15} /> Duplicate
                  </button>
                </div>
              )}

              {/* ── Delete + Save — scroll with content ── */}
              <div style={{ display: 'flex', gap: 8, padding: '16px 16px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
                {event?.id && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    style={{
                      flex: 1, height: 52,
                      background: 'linear-gradient(135deg, #DC2626, #B91C1C)',
                      border: 'none', borderRadius: 14, cursor: 'pointer',
                      fontSize: 16, fontWeight: 500, fontFamily: M,
                      color: '#fff',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || saving}
                  style={{
                    flex: 1, height: 52,
                    background: canSave && !saving
                      ? 'linear-gradient(135deg, #C9A84C, #A8873C)'
                      : 'rgba(201,168,76,0.35)',
                    border: 'none', borderRadius: 14,
                    cursor: canSave && !saving ? 'pointer' : 'not-allowed',
                    fontSize: 16, fontWeight: 500, fontFamily: M,
                    color: '#fff',
                    boxShadow: canSave && !saving ? '0 4px 12px rgba(0,0,0,0.3)' : 'none',
                    transition: 'background 0.15s, box-shadow 0.15s',
                  }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>

            </div>
          </>
        )}
      </div>

      {/* Save scope picker — asked on Save, not before the form is even shown */}
      {confirmScope && (
        <>
          <div className="fixed inset-0 z-[60]" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmScope(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[70] rounded-t-[24px]" style={{ background: 'var(--color-bg-elevated)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>
            <div className="px-4 pb-4">
              <h2 style={{ fontFamily: M, fontSize: 17, fontWeight: 700, color: 'var(--color-ink)' }}>Edit Recurring Event</h2>
              <p style={{ fontFamily: M, fontSize: 13, color: MUTED, marginTop: 4 }}>This event repeats. What should this change apply to?</p>
            </div>
            <div style={{ borderTop: `0.5px solid ${SEP}` }}>
              {([
                { s: 'this'      as RecurrenceScope, label: 'This event',             hint: 'Only this occurrence' },
                { s: 'following' as RecurrenceScope, label: 'This and following',     hint: 'This occurrence and every one after it' },
              ]).map(({ s, label, hint }, i) => (
                <button key={s} onClick={() => { void commitSave(s) }}
                  className="w-full px-4 py-4 text-left"
                  style={{ borderBottom: i < 1 ? `0.5px solid ${SEP}` : 'none', background: 'none', cursor: 'pointer' }}>
                  <div style={{ fontFamily: M, fontSize: 15, fontWeight: 500, color: 'var(--color-ink)' }}>{label}</div>
                  <div style={{ fontFamily: M, fontSize: 12, color: MUTED, marginTop: 2 }}>{hint}</div>
                </button>
              ))}
            </div>
            <div className="px-4 py-4">
              <button onClick={() => setConfirmScope(false)}
                className="w-full py-3.5 rounded-[14px] bg-white/[0.06] text-[15px] font-medium text-ink-muted">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Delete scope picker (for recurring events) */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-[60]" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmDelete(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[70] rounded-t-[24px]" style={{ background: 'var(--color-bg-elevated)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>
            <div className="px-4 pb-4">
              <h2 style={{ fontFamily: M, fontSize: 17, fontWeight: 700, color: 'var(--color-ink)' }}>Delete Recurring Event</h2>
              <p style={{ fontFamily: M, fontSize: 13, color: MUTED, marginTop: 4 }}>Which events do you want to delete?</p>
            </div>
            <div style={{ borderTop: `0.5px solid ${SEP}` }}>
              {([
                { s: 'this'      as RecurrenceScope, label: 'This event',                danger: false },
                { s: 'following' as RecurrenceScope, label: 'This and following events', danger: true  },
              ]).map(({ s, label, danger }, i) => (
                <button key={s} onClick={() => confirmDeleteWithScope(s)}
                  className="w-full px-4 py-4 text-left"
                  style={{ borderBottom: i < 1 ? `0.5px solid ${SEP}` : 'none', background: 'none', cursor: 'pointer' }}>
                  <span style={{ fontFamily: M, fontSize: 15, fontWeight: 500, color: danger ? '#ef4444' : 'var(--color-ink)' }}>{label}</span>
                </button>
              ))}
            </div>
            <div className="px-4 py-4">
              <button onClick={() => setConfirmDelete(false)}
                className="w-full py-3.5 rounded-[14px] bg-white/[0.06] text-[15px] font-medium text-ink-muted">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      <RecurrencePicker
        open={recurrencePickerOpen}
        date={form?.date || localToday()}
        value={form?.recurrenceRule ?? ''}
        onClose={() => setRecurrencePickerOpen(false)}
        onChange={rule => set('recurrenceRule', rule)}
      />

      <LocationPickerSheet
        open={locPickerOpen}
        initial={locValue}
        onClose={() => setLocPickerOpen(false)}
        onSelect={loc => { setLocValue(loc); setForm(f => f ? { ...f, location: loc } : f) }}
      />

      {/* Custom date-range picker (PC / iPad) */}
      {dateRangeOpen && dateAnchor && form && (
        <DateRangePicker
          anchorRect={dateAnchor}
          startDate={form.date}
          endDate={form.endDate || form.date}
          onClose={() => setDateRangeOpen(false)}
          onApply={(start, end) => {
            setForm(f => f ? { ...f, date: start, endDate: end } : f)
            setDateRangeOpen(false)
          }}
        />
      )}
    </>
  )
}
