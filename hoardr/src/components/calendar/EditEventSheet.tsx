'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Clock, AlignLeft, X, ChevronRight, RefreshCw, Calendar } from 'lucide-react'
import { localToday } from '@/lib/utils'
import { rruleLabel } from '@/lib/rrule'
import { RecurrencePicker } from './RecurrencePicker'
import type { GCalendar } from './CalendarSettingsSheet'

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

export type RecurrenceScope = 'this' | 'following' | 'all'

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
  onSave:      (edits: EventEdits, scope: RecurrenceScope) => Promise<void>
  onDelete:    (scope: RecurrenceScope) => void
}

const M    = 'var(--font-montserrat)'
const GOLD = '#C9A84C'
const IC   = '#556070'   // icon / muted label color
const SEP  = 'rgba(255,255,255,0.05)'

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtShortDate(dateStr: string): string {
  if (!dateStr) return ''
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function calcDuration(date: string, startTime: string, endDate: string, endTime: string): string {
  const totalMin = Math.round((new Date(`${endDate}T${endTime}:00`).getTime() - new Date(`${date}T${startTime}:00`).getTime()) / 60000)
  if (totalMin <= 0) return ''
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  return h === 0 ? `${m}m` : m === 0 ? `${h}h` : `${h}h ${m}m`
}

export function EditEventSheet({ open, event, googleCals = [], onClose, onSave, onDelete }: Props) {
  const [step, setStep]                   = useState<'scope' | 'form'>('form')
  const [scope, setScope]                 = useState<RecurrenceScope>('this')
  const [form, setForm]                   = useState<EventEdits | null>(null)
  const [saving, setSaving]               = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recurrencePickerOpen, setRecurrencePickerOpen] = useState(false)
  const [locValue,       setLocValue]     = useState('')
  const [locSuggestions, setLocSuggestions] = useState<LocSuggestion[]>([])
  const [locOpen,        setLocOpen]      = useState(false)
  const [recentLoc,      setRecentLoc]    = useState('')

  const locSvcRef      = useRef<unknown>(null)
  const locTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const locRowRef      = useRef<HTMLDivElement>(null)
  const locRef         = useRef<HTMLTextAreaElement>(null)
  const notesRef       = useRef<HTMLTextAreaElement>(null)
  const titleRef       = useRef<HTMLInputElement>(null)
  const backdropRef    = useRef<HTMLDivElement>(null)
  const dragStartY     = useRef<number | null>(null)
  const sheetRef       = useRef<HTMLDivElement>(null)
  const scrollRef      = useRef<HTMLDivElement>(null)

  // Initialize AutocompleteService once
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) return
    const saved = localStorage.getItem('cal-recent-location')
    if (saved) setRecentLoc(saved)
    function init() {
      const g = (window as unknown as Record<string, unknown>).google as { maps?: { places?: { AutocompleteService: new () => unknown } } } | undefined
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
      } else existing.addEventListener('load', init, { once: true })
    }
    return () => { locSvcRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (open && event) {
      setStep(event.recurrenceRule ? 'scope' : 'form')
      setScope('this'); setSaving(false); setConfirmDelete(false)
      setLocValue(event.location); setLocOpen(false); setLocSuggestions([])
      setForm({
        title: event.title, date: event.date, endDate: event.endDate || event.date,
        allDay: event.allDay, startTime: event.startTime || '09:00', endTime: event.endTime || '10:00',
        location: event.location, notes: event.notes, recurrenceRule: event.recurrenceRule,
        calendarId: event.calendarId || 'primary',
      })
      // Auto-focus title for new events
      if (!event.id) setTimeout(() => titleRef.current?.focus(), 350)
    } else {
      setTimeout(() => { setForm(null); setSaving(false); setConfirmDelete(false); setLocValue(''); setLocOpen(false); setLocSuggestions([]) }, 300)
    }
  }, [open, event])

  // Auto-resize textareas
  useEffect(() => {
    const el = locRef.current; if (!el) return
    el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`
  }, [locValue])
  useEffect(() => {
    const el = notesRef.current; if (!el) return
    el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`
  }, [form?.notes])

  // Scroll-area swipe-down dismiss
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !open) return
    let startY = 0, dragging = false
    const onStart = (e: TouchEvent) => { startY = e.touches[0].clientY; dragging = el.scrollTop <= 0 }
    const onMove  = (e: TouchEvent) => {
      if (!dragging || !sheetRef.current) return
      const dy = e.touches[0].clientY - startY
      if (dy <= 0) { dragging = false; return }
      e.preventDefault()
      sheetRef.current.style.transform = `translateY(${dy}px)`; sheetRef.current.style.transition = 'none'
    }
    const onEnd = (e: TouchEvent) => {
      if (!dragging || !sheetRef.current) return; dragging = false
      const dy = Math.max(0, e.changedTouches[0].clientY - startY)
      if (dy > 80) {
        sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
        sheetRef.current.style.transform  = 'translateY(100%)'
        setTimeout(() => { if (sheetRef.current) { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' } onClose() }, 280)
      } else { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove',  onMove,  { passive: false })
    el.addEventListener('touchend',   onEnd,   { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove); el.removeEventListener('touchend', onEnd) }
  }, [open, onClose])

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'; document.body.style.top = `-${scrollY}px`; document.body.style.width = '100%'
    document.documentElement.style.overscrollBehavior = 'none'
    return () => {
      document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = ''
      document.documentElement.style.overscrollBehavior = ''; window.scrollTo(0, scrollY)
    }
  }, [open])

  function handleLocChange(val: string) {
    setLocValue(val); setForm(f => f ? { ...f, location: val } : f)
    if (locTimerRef.current) clearTimeout(locTimerRef.current)
    if (!val.trim()) { setLocSuggestions([]); setLocOpen(!!recentLoc); return }
    locTimerRef.current = setTimeout(() => {
      const svc = locSvcRef.current as { getPlacePredictions: (req: unknown, cb: (r: unknown[] | null, s: string) => void) => void } | null
      if (!svc) return
      svc.getPlacePredictions({ input: val, types: ['geocode', 'establishment'] }, (results, status) => {
        if (status === 'OK' && results?.length) {
          const mapped = (results as Array<{ place_id: string; structured_formatting: { main_text: string; secondary_text?: string; main_text_matched_substrings: Array<{ offset: number; length: number }> }; description: string }>)
            .slice(0, 5).map(r => ({ placeId: r.place_id, mainText: r.structured_formatting.main_text, secText: r.structured_formatting.secondary_text ?? '', description: r.description, matchedSubstrings: r.structured_formatting.main_text_matched_substrings ?? [] }))
          setLocSuggestions(mapped); setLocOpen(true)
        } else { setLocSuggestions([]); setLocOpen(false) }
      })
    }, 200)
  }

  function selectLoc(text: string) {
    setLocValue(text); setForm(f => f ? { ...f, location: text } : f)
    setLocOpen(false); setLocSuggestions([])
    localStorage.setItem('cal-recent-location', text); setRecentLoc(text)
  }

  function highlightMatch(text: string, query: string) {
    if (!query.trim()) return <>{text}</>
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx < 0) return <>{text}</>
    return <>{text.slice(0, idx)}<span style={{ color: GOLD }}>{text.slice(idx, idx + query.length)}</span>{text.slice(idx + query.length)}</>
  }

  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !sheetRef.current) return
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current)
    sheetRef.current.style.transform = `translateY(${dy}px)`; sheetRef.current.style.transition = 'none'
  }
  function onDragEnd(e: React.TouchEvent) {
    if (!sheetRef.current) return
    const dy = dragStartY.current !== null ? Math.max(0, e.changedTouches[0].clientY - dragStartY.current) : 0
    dragStartY.current = null
    if (dy > 80) {
      sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
      sheetRef.current.style.transform  = 'translateY(100%)'
      setTimeout(() => { if (sheetRef.current) { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' } onClose() }, 280)
    } else { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
  }

  function set(k: keyof EventEdits, v: string | boolean) {
    setForm(f => {
      if (!f) return f
      const next = { ...f, [k]: v }
      if (k === 'endTime' && typeof v === 'string' && !next.allDay && v < next.startTime && next.endDate === next.date)
        next.endDate = addOneDay(next.date)
      if (k === 'date' && typeof v === 'string' && next.endDate < v)
        next.endDate = v
      return next
    })
  }

  async function handleSave() {
    if (!form) return; setSaving(true)
    await onSave(form, scope); onClose()
  }

  function handleDelete() {
    if (!event?.recurrenceRule) { onDelete('this'); onClose(); return }
    setConfirmDelete(true)
  }

  function confirmDeleteWithScope(s: RecurrenceScope) { onDelete(s); onClose() }

  const canSave = !!form?.title.trim() && !!form?.date && form.date.length === 10
  const isNew   = !event?.id

  const selectedCal = googleCals.find(c => (c.primary ? 'primary' : c.id) === form?.calendarId) ?? googleCals[0]

  const durationStr = form && !form.allDay
    ? calcDuration(form.date, form.startTime, form.endDate, form.endTime)
    : ''

  const showLocDropdown = locOpen && (locSuggestions.length > 0 || (!locValue && recentLoc))

  // ── Shared styles ──────────────────────────────────────────────────────────

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '11px 16px', borderBottom: `0.5px solid ${SEP}`,
    position: 'relative',
  }

  const pillWrap = (active?: boolean): React.CSSProperties => ({
    position: 'relative', display: 'inline-flex', alignItems: 'center',
    background: active ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.06)',
    borderRadius: 7, padding: '4px 9px',
    fontSize: 13, fontWeight: 500, fontFamily: M,
    color: active ? GOLD : 'var(--color-ink)',
    overflow: 'hidden', cursor: 'pointer', userSelect: 'none', flexShrink: 0,
  })

  const hiddenNative: React.CSSProperties = {
    position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer', colorScheme: 'dark',
  }

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
          background: 'var(--color-bg-surface)', maxHeight: '88vh',
          willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >

        {/* ── Scope step ── */}
        {step === 'scope' && (
          <>
            <div onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
              className="flex-shrink-0" style={{ touchAction: 'none' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div style={{ width: 36, height: 4, borderRadius: 2, background: '#2A3040' }} />
              </div>
              <div className="flex items-center justify-between px-4 py-3">
                <span style={{ fontFamily: M, fontSize: 17, fontWeight: 500, color: 'var(--color-ink)' }}>Edit Recurring Event</span>
                <button onTouchStart={e => e.stopPropagation()} onClick={onClose}
                  style={{ width: 26, height: 26, borderRadius: 13, background: '#21242A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={13} color={IC} />
                </button>
              </div>
            </div>
            <p style={{ fontFamily: M, fontSize: 13, color: IC, padding: '0 16px 12px' }}>Which events do you want to edit?</p>
            <div style={{ borderTop: `0.5px solid ${SEP}` }}>
              {([{ scope: 'this' as RecurrenceScope, label: 'This event' }, { scope: 'following' as RecurrenceScope, label: 'This and following events' }, { scope: 'all' as RecurrenceScope, label: 'All events' }])
                .map(({ scope: s, label }, i) => (
                  <button key={s} onClick={() => { setScope(s); setStep('form') }}
                    style={{ ...row, width: '100%', background: 'none', border: 'none', cursor: 'pointer', borderBottom: i < 2 ? `0.5px solid ${SEP}` : 'none' }}>
                    <span style={{ fontFamily: M, fontSize: 15, color: 'var(--color-ink)', flex: 1, textAlign: 'left' }}>{label}</span>
                    <ChevronRight size={15} color={IC} />
                  </button>
                ))}
            </div>
            <div style={{ padding: '12px 16px' }}>
              <button onClick={onClose}
                style={{ width: '100%', padding: '12px', borderRadius: 12, background: '#21242A', border: 'none', fontFamily: M, fontSize: 15, color: IC, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </>
        )}

        {/* ── Form step ── */}
        {step === 'form' && form && (
          <>
            {/* Drag zone: handle + header */}
            <div onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
              className="flex-shrink-0" style={{ touchAction: 'none' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div style={{ width: 36, height: 4, borderRadius: 2, background: '#2A3040' }} />
              </div>
              <div className="flex items-center justify-between px-4 py-2">
                <span style={{ fontFamily: M, fontSize: 17, fontWeight: 500, color: 'var(--color-ink)' }}>
                  {isNew ? 'New Event' : 'Edit Event'}
                </span>
                <button onTouchStart={e => e.stopPropagation()} onClick={onClose}
                  style={{ width: 26, height: 26, borderRadius: 13, background: '#21242A', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={13} color={IC} />
                </button>
              </div>
            </div>

            {/* Hero: event title */}
            <input
              ref={titleRef}
              type="text"
              placeholder="Event name"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              style={{
                display: 'block', width: '100%', padding: '8px 16px 12px',
                fontSize: 22, fontWeight: 500, fontFamily: M,
                color: 'var(--color-ink)', background: 'none', border: 'none', outline: 'none',
                borderBottom: `0.5px solid ${SEP}`,
              }}
            />

            {/* Calendar pills */}
            {googleCals.length > 0 && (
              <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', flexShrink: 0, borderBottom: `0.5px solid ${SEP}` }}>
                {googleCals.map(cal => {
                  const calId = cal.primary ? 'primary' : cal.id
                  const active = form.calendarId === calId
                  return (
                    <button key={cal.id} onClick={() => set('calendarId', calId)}
                      style={{
                        flexShrink: 0, padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 500, fontFamily: M,
                        background: active ? 'linear-gradient(135deg, #C9A84C, #A8873C)' : '#21242A',
                        color: active ? '#1a1200' : IC,
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}>
                      {!active && <span style={{ width: 7, height: 7, borderRadius: '50%', background: cal.backgroundColor, flexShrink: 0 }} />}
                      {cal.summary}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Scrollable rows */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain', overflowX: 'hidden' }}>

              {/* Date row */}
              <div style={row}>
                <Calendar size={15} color={IC} style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
                  <div style={pillWrap()}>
                    <span>{fmtShortDate(form.date)}</span>
                    <input type="date" value={form.date} style={hiddenNative}
                      onChange={e => set('date', e.target.value)} />
                  </div>
                  <span style={{ fontSize: 13, color: IC }}>→</span>
                  <div style={pillWrap(form.endDate !== form.date)}>
                    <span style={{ color: form.endDate !== form.date ? GOLD : 'var(--color-ink)' }}>{fmtShortDate(form.endDate || form.date)}</span>
                    <input type="date" value={form.endDate || form.date} min={form.date} style={hiddenNative}
                      onChange={e => set('endDate', e.target.value)} />
                  </div>
                </div>
              </div>

              {/* All-day row */}
              <button type="button" onClick={() => set('allDay', !form.allDay)}
                style={{ ...row, width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <Clock size={15} color={IC} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontFamily: M, color: IC }}>All day</span>
                <span style={{
                  width: 40, height: 22, borderRadius: 11, padding: 2,
                  background: form.allDay ? GOLD : 'rgba(255,255,255,0.1)',
                  display: 'inline-flex', alignItems: 'center',
                  justifyContent: form.allDay ? 'flex-end' : 'flex-start',
                  flexShrink: 0, transition: 'background 0.15s',
                }}>
                  <span style={{ width: 18, height: 18, borderRadius: 9, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </span>
              </button>

              {/* Time row */}
              {!form.allDay && (
                <div style={row}>
                  <Clock size={15} color={IC} style={{ flexShrink: 0 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                    <div style={pillWrap()}>
                      <span>{fmt12(form.startTime)}</span>
                      <input type="time" value={form.startTime} style={{ ...hiddenNative, colorScheme: 'dark' }}
                        onChange={e => set('startTime', e.target.value)} />
                    </div>
                    <span style={{ fontSize: 13, color: IC }}>→</span>
                    <div style={pillWrap()}>
                      <span>{fmt12(form.endTime)}</span>
                      <input type="time" value={form.endTime} style={{ ...hiddenNative, colorScheme: 'dark' }}
                        onChange={e => set('endTime', e.target.value)} />
                    </div>
                    {durationStr && <span style={{ fontSize: 12, color: IC, fontFamily: M }}>{durationStr}</span>}
                  </div>
                </div>
              )}

              {/* Repeat row */}
              <button type="button" onClick={() => setRecurrencePickerOpen(true)}
                style={{ ...row, width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <RefreshCw size={15} color={IC} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontFamily: M, color: IC }}>Repeat</span>
                <span style={{ fontSize: 13, fontFamily: M, color: 'var(--color-ink)', marginRight: 4 }}>
                  {form.recurrenceRule ? rruleLabel(form.recurrenceRule, form.date || localToday()) : 'Never'}
                </span>
                <ChevronRight size={14} color={IC} style={{ flexShrink: 0 }} />
              </button>

              {/* Location row */}
              <div ref={locRowRef} style={{ ...row, alignItems: 'flex-start' }}>
                <MapPin size={15} color={IC} style={{ flexShrink: 0, marginTop: 2 }} />
                <textarea
                  ref={locRef}
                  placeholder="Location"
                  value={locValue}
                  onChange={e => handleLocChange(e.target.value)}
                  onFocus={() => { if (locSuggestions.length > 0) setLocOpen(true); else if (!locValue && recentLoc) setLocOpen(true) }}
                  onBlur={() => setTimeout(() => setLocOpen(false), 150)}
                  rows={1}
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
                    fontSize: 13, color: 'var(--color-ink)', fontFamily: M, lineHeight: 1.5, overflowY: 'hidden' }}
                />
              </div>

              {/* Location suggestions */}
              {showLocDropdown && (
                <div style={{ margin: '0 16px 4px', background: '#1C2A36', border: `0.5px solid rgba(255,255,255,0.10)`, borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.45)' }}>
                  {!locValue && recentLoc && (
                    <button onMouseDown={e => e.preventDefault()} onClick={() => selectLoc(recentLoc)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', borderBottom: locSuggestions.length > 0 ? `0.5px solid rgba(255,255,255,0.08)` : 'none', textAlign: 'left' }}>
                      <Clock size={13} color={IC} style={{ flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: 'var(--color-ink)', fontFamily: M }}>{recentLoc}</span>
                    </button>
                  )}
                  {locSuggestions.map((sug, i) => (
                    <button key={sug.placeId} onMouseDown={e => e.preventDefault()} onClick={() => selectLoc(sug.description)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer', borderBottom: i < locSuggestions.length - 1 ? `0.5px solid rgba(255,255,255,0.08)` : 'none', textAlign: 'left' }}>
                      <MapPin size={13} color={IC} style={{ flexShrink: 0, marginTop: 2 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, color: 'var(--color-ink)', fontFamily: M, lineHeight: 1.4 }}>{highlightMatch(sug.mainText, locValue)}</div>
                        {sug.secText && <div style={{ fontSize: 12, color: IC, fontFamily: M, lineHeight: 1.4, marginTop: 2 }}>{sug.secText}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Notes row */}
              <div style={{ ...row, alignItems: 'flex-start', borderBottom: 'none' }}>
                <AlignLeft size={15} color={IC} style={{ flexShrink: 0, marginTop: 2 }} />
                <textarea
                  ref={notesRef}
                  placeholder="Optional note"
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  rows={3}
                  style={{ flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
                    fontSize: 13, color: 'var(--color-ink)', fontFamily: M, lineHeight: 1.5, overflowY: 'hidden' }}
                />
              </div>

              {/* Bottom spacer */}
              <div style={{ height: 8 }} />
            </div>

            {/* Footer: Delete + Save */}
            <div className="flex-shrink-0"
              style={{ borderTop: `0.5px solid ${SEP}`, padding: '12px 16px', display: 'flex', gap: 6 }}>
              {event?.id && (
                <button type="button" onClick={handleDelete}
                  style={{ flex: 1, height: 44, background: 'linear-gradient(135deg, #DC2626, #B91C1C)', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 15, fontWeight: 500, fontFamily: M, color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                  Delete
                </button>
              )}
              <button type="button" onClick={handleSave} disabled={!canSave || saving}
                style={{ flex: 1, height: 44, background: canSave && !saving ? 'linear-gradient(135deg, #C9A84C, #A8873C)' : 'rgba(201,168,76,0.3)', border: 'none', borderRadius: 12, cursor: canSave && !saving ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 500, fontFamily: M, color: '#fff', boxShadow: canSave && !saving ? '0 4px 12px rgba(0,0,0,0.3)' : 'none', transition: 'background 0.15s' }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Delete scope picker */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-[60]" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmDelete(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[70] rounded-t-[24px]" style={{ background: 'var(--color-bg-elevated)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex justify-center pt-3 pb-2">
              <div style={{ width: 36, height: 4, borderRadius: 2, background: '#2A3040' }} />
            </div>
            <div style={{ padding: '0 16px 12px' }}>
              <p style={{ fontFamily: M, fontSize: 17, fontWeight: 500, color: 'var(--color-ink)' }}>Delete Recurring Event</p>
              <p style={{ fontFamily: M, fontSize: 13, color: IC, marginTop: 4 }}>Which events do you want to delete?</p>
            </div>
            <div style={{ borderTop: `0.5px solid ${SEP}` }}>
              {([{ s: 'this' as RecurrenceScope, label: 'This event', danger: false }, { s: 'following' as RecurrenceScope, label: 'This and following events', danger: false }, { s: 'all' as RecurrenceScope, label: 'All events', danger: true }])
                .map(({ s, label, danger }, i) => (
                  <button key={s} onClick={() => confirmDeleteWithScope(s)}
                    style={{ ...row, width: '100%', background: 'none', border: 'none', cursor: 'pointer', borderBottom: i < 2 ? `0.5px solid ${SEP}` : 'none' }}>
                    <span style={{ fontFamily: M, fontSize: 15, fontWeight: 500, color: danger ? '#ef4444' : 'var(--color-ink)' }}>{label}</span>
                  </button>
                ))}
            </div>
            <div style={{ padding: '12px 16px' }}>
              <button onClick={() => setConfirmDelete(false)}
                style={{ width: '100%', padding: '12px', borderRadius: 12, background: '#21242A', border: 'none', fontFamily: M, fontSize: 15, color: IC, cursor: 'pointer' }}>
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
    </>
  )
}
